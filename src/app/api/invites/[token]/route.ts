import { get, run } from "@/lib/db";
import { hashPassword, hashToken, passwordProblem, startSession, tooManyAttempts } from "@/lib/auth";
import { bad, ok } from "@/lib/http";

type Ctx = { params: Promise<{ token: string }> };
const EXPIRED = "This invite link has expired or was already used. Ask your specialist for a new one.";

const find = (token: string) =>
  get<{ client_id: number; email: string; name: string }>(
    `SELECT i.client_id, i.email, c.name FROM invites i JOIN clients c ON c.id = i.client_id
     WHERE i.token_hash = ? AND i.expires_at > datetime('now')`,
    hashToken(token),
  );

export async function GET(_: Request, ctx: Ctx) {
  const invite = find((await ctx.params).token);
  return invite ? ok({ email: invite.email, name: invite.name }) : bad(EXPIRED, 404);
}

/** Accepting the invite creates the client's login and signs them in. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (tooManyAttempts(`invite:${token.slice(0, 16)}`, 20)) return bad("Too many attempts. Try again later.", 429);
  const invite = find(token);
  if (!invite) return bad(EXPIRED, 404);
  const { password } = await req.json();
  const problem = passwordProblem(password);
  if (problem) return bad(problem);
  if (get("SELECT 1 FROM users WHERE email = ?", invite.email)) return bad("An account with this email already exists. Sign in instead.");

  const res = run(
    "INSERT INTO users (email, password_hash, role, client_id) VALUES (?, ?, 'client', ?)",
    invite.email,
    hashPassword(password),
    invite.client_id,
  );
  run("DELETE FROM invites WHERE client_id = ?", invite.client_id);
  await startSession(Number(res.lastInsertRowid));
  return ok({ role: "client" });
}
