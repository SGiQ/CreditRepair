import { requireAdmin } from "@/lib/auth";
import { run, updateRow } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { ITEM_STATUSES } from "@/lib/types";

const FIELDS = ["status", "notes", "identity_theft", "creditor", "creditor_address", "account_number", "balance", "bureaus"];

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const id = await idOf(ctx);
  const b = await req.json();
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
