import { requireAdmin, requireClientAccess } from "@/lib/auth";
import fs from "node:fs";
import { all, run, updateRow } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { getBundle } from "@/lib/store";

export const dynamic = "force-dynamic";
const FIELDS = ["name", "address1", "address2", "city", "state", "zip", "dob", "ssn_last4", "phone", "email"];

export async function GET(_: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  const auth = await requireClientAccess(id);
  if (auth instanceof Response) return auth;
  const bundle = getBundle(id, auth.role);
  return bundle ? ok(bundle) : bad("Client not found", 404);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const b = await req.json();
  if ("name" in b && !String(b.name).trim()) return bad("Client name is required.");
  if (b.ssn_last4 && !/^\d{4}$/.test(b.ssn_last4)) return bad("SSN must be the last 4 digits only.");
  updateRow("clients", await idOf(ctx), b, FIELDS);
  return ok();
}

export async function DELETE(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const id = await idOf(ctx);
  for (const r of all<{ stored_path: string }>("SELECT stored_path FROM reports WHERE client_id = ?", id)) {
    fs.rmSync(r.stored_path, { force: true });
  }
  for (const f of all<{ doc_path: string }>("SELECT doc_path FROM freezes WHERE client_id = ? AND doc_path != ''", id)) {
    fs.rmSync(f.doc_path, { force: true });
  }
  run("DELETE FROM clients WHERE id = ?", id);
  return ok();
}
