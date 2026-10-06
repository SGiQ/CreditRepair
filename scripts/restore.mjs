// Restores a backup made by the app into data/ (stop the app first).
//   npm run restore -- data/backups/backup-2026-10-05-03-00.zip
//   BACKUP_PASSPHRASE=... npm run restore -- backup-2026-10-05-03-00.zip.enc
import { createDecipheriv, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Usage: npm run restore -- <backup file>");
  process.exit(1);
}
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
let bytes = fs.readFileSync(file);

if (bytes.subarray(0, 6).toString() === "CRDBK1") {
  const passphrase = process.env.BACKUP_PASSPHRASE;
  if (!passphrase) {
    console.error("This backup is encrypted. Set BACKUP_PASSPHRASE to the passphrase it was made with.");
    process.exit(1);
  }
  const salt = bytes.subarray(6, 22);
  const iv = bytes.subarray(22, 34);
  const tag = bytes.subarray(34, 50);
  const body = bytes.subarray(50);
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
  decipher.setAuthTag(tag);
  try {
    bytes = Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    console.error("Wrong passphrase, or the file is damaged.");
    process.exit(1);
  }
}

const zip = await JSZip.loadAsync(bytes);
const dbEntry = zip.file("credit-repair.db");
if (!dbEntry) {
  console.error("Not a Credit Repair Desk backup (no credit-repair.db inside).");
  process.exit(1);
}
fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
const dbPath = path.join(dataDir, "credit-repair.db");
if (fs.existsSync(dbPath)) {
  const keep = `${dbPath}.before-restore-${Date.now()}`;
  fs.copyFileSync(dbPath, keep);
  console.log(`Existing database kept at ${keep}`);
}
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
fs.writeFileSync(dbPath, await dbEntry.async("nodebuffer"));
let uploads = 0;
for (const [name, entry] of Object.entries(zip.files)) {
  if (name.startsWith("uploads/") && !entry.dir) {
    fs.writeFileSync(path.join(dataDir, "uploads", path.basename(name)), await entry.async("nodebuffer"));
    uploads++;
  }
}
console.log(`Restored database and ${uploads} uploaded file(s) into ${dataDir}. Start the app again.`);
