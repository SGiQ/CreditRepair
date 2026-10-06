import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { backup as sqliteBackup } from "node:sqlite";
import JSZip from "jszip";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { all, DATA_DIR, db, run, UPLOAD_DIR } from "./db";

// Nightly snapshot of everything under data/: the database (taken with SQLite's own
// backup API so it is consistent while the app runs) plus the uploaded reports, zipped,
// optionally encrypted, kept locally and copied to an S3-compatible bucket when configured.

export const BACKUP_DIR = path.join(DATA_DIR, "backups");
const LOCAL_KEEP = 7;
export const MAGIC = "CRDBK1"; // header of an encrypted backup file

export interface BackupRecord {
  id: number;
  created_at: string;
  filename: string;
  bytes: number;
  destination: string;
  status: "ok" | "failed";
  error: string;
}

export interface BackupConfig {
  hour: number;
  encrypted: boolean;
  remote: string | null;
  keepDays: number;
}

export function backupConfig(): BackupConfig {
  const bucket = process.env.BACKUP_S3_BUCKET;
  return {
    hour: Math.min(23, Math.max(0, Number(process.env.BACKUP_HOUR ?? 3) || 0)),
    encrypted: Boolean(process.env.BACKUP_PASSPHRASE),
    remote: bucket ? `${process.env.BACKUP_S3_ENDPOINT ? "S3-compatible" : "S3"} bucket ${bucket}` : null,
    keepDays: Math.max(1, Number(process.env.BACKUP_KEEP_DAYS ?? 30) || 30),
  };
}

function s3(): S3Client | null {
  if (!process.env.BACKUP_S3_BUCKET) return null;
  return new S3Client({
    region: process.env.BACKUP_S3_REGION || "auto",
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.BACKUP_S3_ENDPOINT),
    credentials:
      process.env.BACKUP_S3_ACCESS_KEY_ID && process.env.BACKUP_S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY }
        : undefined,
  });
}
const prefix = () => (process.env.BACKUP_S3_PREFIX ?? "credit-repair-backups").replace(/^\/|\/$/g, "");

/** AES-256-GCM with a key derived from the passphrase; the file is useless without it. */
export function encrypt(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from(MAGIC), salt, iv, cipher.getAuthTag(), body]);
}

async function buildArchive(): Promise<Buffer> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const snapshot = path.join(BACKUP_DIR, `.snapshot-${process.pid}.db`);
  fs.rmSync(snapshot, { force: true });
  await sqliteBackup(db(), snapshot);
  try {
    const zip = new JSZip();
    zip.file("credit-repair.db", fs.readFileSync(snapshot));
    if (fs.existsSync(UPLOAD_DIR)) {
      for (const name of fs.readdirSync(UPLOAD_DIR)) zip.file(`uploads/${name}`, fs.readFileSync(path.join(UPLOAD_DIR, name)));
    }
    zip.file("README.txt", `Credit Repair Desk backup ${new Date().toISOString()}\nRestore with: npm run restore -- <this file>\n`);
    return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  } finally {
    fs.rmSync(snapshot, { force: true });
  }
}

function pruneLocal() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("backup-"))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - LOCAL_KEEP))) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
}

async function pruneRemote(client: S3Client) {
  const cutoff = Date.now() - backupConfig().keepDays * 86_400_000;
  const listed = await client.send(new ListObjectsV2Command({ Bucket: process.env.BACKUP_S3_BUCKET, Prefix: `${prefix()}/backup-` }));
  const old = (listed.Contents ?? []).filter((o) => o.Key && o.LastModified && o.LastModified.getTime() < cutoff).map((o) => ({ Key: o.Key! }));
  if (old.length) await client.send(new DeleteObjectsCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Delete: { Objects: old } }));
}

let running: Promise<BackupRecord> | null = null;

/** Takes a backup now. Concurrent calls share the same run. */
export function runBackup(): Promise<BackupRecord> {
  if (!running) running = doBackup().finally(() => (running = null));
  return running;
}

async function doBackup(): Promise<BackupRecord> {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const passphrase = process.env.BACKUP_PASSPHRASE;
  const filename = `backup-${stamp}.zip${passphrase ? ".enc" : ""}`;
  const record = { filename, bytes: 0, destination: "local", status: "ok" as const, error: "" };
  try {
    let bytes = await buildArchive();
    if (passphrase) bytes = encrypt(bytes, passphrase);
    fs.writeFileSync(path.join(BACKUP_DIR, filename), bytes);
    record.bytes = bytes.length;
    pruneLocal();
    const client = s3();
    if (client) {
      await client.send(new PutObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Key: `${prefix()}/${filename}`, Body: bytes, ContentType: "application/octet-stream" }));
      record.destination = `local + ${backupConfig().remote}`;
      await pruneRemote(client).catch((e) => console.error("backup prune failed", e));
    }
  } catch (e) {
    console.error("backup failed", e);
    Object.assign(record, { status: "failed", error: e instanceof Error ? e.message : String(e) });
  }
  const res = run(
    "INSERT INTO backups (filename, bytes, destination, status, error) VALUES (?, ?, ?, ?, ?)",
    record.filename, record.bytes, record.destination, record.status, record.error,
  );
  return { id: Number(res.lastInsertRowid), created_at: new Date().toISOString(), ...record };
}

export const recentBackups = () =>
  all<BackupRecord>("SELECT id, created_at, filename, bytes, destination, status, error FROM backups ORDER BY id DESC LIMIT 10");

/** Called hourly by the background scheduler: runs once per local day at BACKUP_HOUR. */
export async function nightlyTick(): Promise<void> {
  const now = new Date();
  if (now.getHours() < backupConfig().hour) return;
  const last = all<{ created_at: string }>("SELECT created_at FROM backups WHERE status = 'ok' ORDER BY id DESC LIMIT 1")[0];
  const today = now.toLocaleDateString("en-CA");
  if (last && new Date(last.created_at.replace(" ", "T") + (last.created_at.includes("Z") ? "" : "Z")).toLocaleDateString("en-CA") === today) return;
  await runBackup();
}
