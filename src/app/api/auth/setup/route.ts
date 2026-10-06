import { run } from "@/lib/db";
import { hasAdmin, hashPassword, passwordProblem, startSession } from "@/lib/auth";
import { bad, ok } from "@/lib/http";

/** One-time creation of the specialist account. Closed once an admin exists. */
export async function POST(req: Request) {
  if (hasAdmin()) return bad("Setup is already complete.", 403);
  const { email, password } = await req.json();
  if (!/^\S+@\S+\.\S+$/.test(String(email ?? ""))) return bad("Enter a valid email address.");
  const problem = passwordProblem(password);
  if (problem) return bad(problem);
  const res = run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')", String(email).trim(), hashPassword(password));
  await startSession(Number(res.lastInsertRowid));
  return ok({ role: "admin" });
}
