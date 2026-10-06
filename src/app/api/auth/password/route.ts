import { hashPassword, passwordProblem, requireUser, startSession, tooManyAttempts, verifyPassword } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { bad, ok } from "@/lib/http";

/** Changes the signed-in user's password and signs out every other device. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  if (tooManyAttempts(`pw:${auth.id}`)) return bad("Too many attempts. Try again in 15 minutes.", 429);
  const { current, password } = await req.json();
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", auth.id);
  if (!row || typeof current !== "string" || !verifyPassword(current, row.password_hash)) return bad("Current password is incorrect.");
  const problem = passwordProblem(password);
  if (problem) return bad(problem);
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(password), auth.id);
  run("DELETE FROM sessions WHERE user_id = ?", auth.id);
  await startSession(auth.id);
  return ok();
}
