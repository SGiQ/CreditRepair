import { requireAdmin } from "@/lib/auth";
import { run, updateRow } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { PAYMENT_LABELS } from "@/lib/review";
import { ITEM_STATUSES } from "@/lib/types";

const FIELDS = ["review_stage", "payment_status", "evidence_notes", "status", "notes", "identity_theft", "creditor", "creditor_address", "account_number", "balance", "bureaus"];

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const id = await idOf(ctx);
  const b = await req.json();
  if ("payment_status" in b && !Object.keys(PAYMENT_LABELS).includes(b.payment_status)) return bad("Invalid payment status");
  if ("review_stage" in b && !["gather", "ready", "hold"].includes(b.review_stage)) return bad("Invalid review stage");
  if ("evidence_notes" in b && (typeof b.evidence_notes !== "string" || b.evidence_notes.length > 12000)) return bad("Evidence notes must be text up to 12,000 characters");
  if (b.review_stage === "ready" && !b.evidence_notes?.trim()) return bad("Record what you reviewed before marking this account ready");
  if (b.status && !ITEM_STATUSES.includes(b.status)) return bad("Invalid status");
  updateRow("items", id, b, FIELDS);
  run("UPDATE items SET updated_at = datetime('now') WHERE id = ?", id);
  return ok();
}

export async function DELETE(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  run("DELETE FROM items WHERE id = ?", await idOf(ctx));
  return ok();
}
