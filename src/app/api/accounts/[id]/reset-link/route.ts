import { createResetToken, requireAdmin, RESET_MINUTES } from "@/lib/auth";
import { get } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";

/** An admin makes a reset link to hand to someone who is locked out (shown once; not emailed). */
export async function POST(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const id = await idOf(ctx);
  if (id === auth.id) return bad("Use \"Change your password\" for your own account.");
  if (!get("SELECT 1 FROM users WHERE id = ?", id)) return bad("Account not found", 404);
  return ok({ token: createResetToken(id), minutes: RESET_MINUTES });
}
