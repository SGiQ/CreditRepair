import fs from "node:fs";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { get, run, UPLOAD_DIR } from "@/lib/db";
import { bad, ok } from "@/lib/http";
import { SECONDARY_AGENCIES } from "@/lib/agencies";
import { getClient } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; agency: string }> };
const MAX_BYTES = 15 * 1024 * 1024;
const TYPES: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

// Confirmation letters usually print the freeze PIN, so they're admin-only: never shown in the client portal.
async function target(ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const { id, agency } = await ctx.params;
  const clientId = Number(id);
  if (!getClient(clientId)) return bad("Client not found", 404);
  if (!SECONDARY_AGENCIES.some((a) => a.key === agency)) return bad("Unknown agency", 404);
  return { clientId, agency };
}

const current = (clientId: number, agency: string) =>
  get<{ doc_path: string; doc_name: string }>("SELECT doc_path, doc_name FROM freezes WHERE client_id = ? AND agency = ?", clientId, agency);

/** Records a freeze confirmation (date, number, optional letter) and marks the agency frozen. */
export async function POST(req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const form = await req.formData();
  const confirmedOn = String(form.get("confirmed_on") ?? "").trim();
  const number = String(form.get("confirmation_number") ?? "").trim().slice(0, 60);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedOn) || Number.isNaN(Date.parse(confirmedOn))) return bad("Enter the date the freeze was placed.");
  if (Date.parse(confirmedOn) > Date.now() + 86_400_000) return bad("The freeze date can't be in the future.");

  const file = form.get("file");
  let docPath: string | null = null;
  let docName = "";
  if (file instanceof File && file.size > 0) {
    const ext = path.extname(file.name).toLowerCase();
    if (!TYPES[ext]) return bad("Upload the letter as a PDF, PNG or JPG.");
    if (file.size > MAX_BYTES) return bad("The file is larger than 15 MB.");
    docPath = path.join(UPLOAD_DIR, `freeze-${t.clientId}-${t.agency}-${Date.now()}${ext}`);
    fs.writeFileSync(docPath, Buffer.from(await file.arrayBuffer()));
    docName = file.name.slice(0, 120);
  }

  const prev = current(t.clientId, t.agency);
  run(
    `INSERT INTO freezes (client_id, agency, status, confirmed_on, confirmation_number, doc_path, doc_name)
     VALUES (?, ?, 'frozen', ?, ?, ?, ?)
     ON CONFLICT (client_id, agency) DO UPDATE SET
       status = 'frozen', confirmed_on = excluded.confirmed_on, confirmation_number = excluded.confirmation_number,
       doc_path = CASE WHEN ? THEN excluded.doc_path ELSE freezes.doc_path END,
       doc_name = CASE WHEN ? THEN excluded.doc_name ELSE freezes.doc_name END,
       updated_at = datetime('now')`,
    t.clientId, t.agency, confirmedOn, number, docPath ?? "", docName, docPath ? 1 : 0, docPath ? 1 : 0,
  );
  // A new letter replaces the old one on disk.
  if (docPath && prev?.doc_path && prev.doc_path !== docPath) fs.rmSync(prev.doc_path, { force: true });
  return ok();
}

/** Opens the stored confirmation letter. */
export async function GET(_: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const row = current(t.clientId, t.agency);
  if (!row?.doc_path || !fs.existsSync(row.doc_path)) return bad("No confirmation letter on file.", 404);
  const ext = path.extname(row.doc_path).toLowerCase();
  return new Response(new Uint8Array(fs.readFileSync(row.doc_path)), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${row.doc_name.replace(/[^A-Za-z0-9._ -]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Clears the confirmation (and deletes the stored letter); the agency stays marked as frozen. */
export async function DELETE(_: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const row = current(t.clientId, t.agency);
  if (row?.doc_path) fs.rmSync(row.doc_path, { force: true });
  run("UPDATE freezes SET confirmed_on = '', confirmation_number = '', doc_path = '', doc_name = '' WHERE client_id = ? AND agency = ?", t.clientId, t.agency);
  return ok();
}
