import { hashPassword, passwordProblem, requireAdmin } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { bad, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  return ok({
    me: auth.id,
    admins: all("SELECT id, email, created_at FROM users WHERE role = 'admin' ORDER BY id"),
    clients: all(
      `SELECT u.id, u.email, u.created_at, c.id AS client_id, c.name FROM users u JOIN clients c ON c.id = u.client_id
       WHERE u.role = 'client' ORDER BY c.name COLLATE NOCASE`,
    ),
    invites: all(
      `SELECT c.id AS client_id, c.name, i.email, i.expires_at FROM invites i JOIN clients c ON c.id = i.client_id
       WHERE i.expires_at > datetime('now') ORDER BY c.name COLLATE NOCASE`,
    ),
  });
}

/** Adds another admin account. Admins see every client's file. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const { email, password } = await req.json();
  const address = String(email ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(address)) return bad("Enter a valid email address.");
  const problem = passwordProblem(password);
  if (problem) return bad(problem);
  if (get("SELECT 1 FROM users WHERE email = ?", address)) return bad("An account with that email already exists.");
  run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')", address, hashPassword(password));
  return ok();
}
