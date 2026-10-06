import { requireAdmin } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";

/** Removes an account and signs it out everywhere. */
export async function DELETE(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const id = await idOf(ctx);
  if (id === auth.id) return bad("You can't remove the account you're signed in with.");
  if (!get("SELECT 1 FROM users WHERE id = ?", id)) return bad("Account not found", 404);
  run("DELETE FROM users WHERE id = ?", id);
  return ok();
}
