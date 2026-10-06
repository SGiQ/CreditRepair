import { findResetToken, passwordProblem, resetPassword, startSession, tooManyAttempts } from "@/lib/auth";
import { bad, ok } from "@/lib/http";

type Ctx = { params: Promise<{ token: string }> };
const EXPIRED = "This reset link has expired or was already used. Request a new one.";

export async function GET(_: Request, ctx: Ctx) {
  const found = findResetToken((await ctx.params).token);
  return found ? ok({ email: found.email }) : bad(EXPIRED, 404);
}

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (tooManyAttempts(`reset:${token.slice(0, 16)}`, 20)) return bad("Too many attempts. Try again later.", 429);
  const found = findResetToken(token);
  if (!found) return bad(EXPIRED, 404);
  const { password } = await req.json();
  const problem = passwordProblem(password);
  if (problem) return bad(problem);
  resetPassword(found.user_id, password);
  await startSession(found.user_id);
  return ok({ role: found.role });
}
