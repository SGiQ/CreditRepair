import { get } from "@/lib/db";
import { clearAttempts, startSession, tooManyAttempts, verifyPassword } from "@/lib/auth";
import { bad, ok } from "@/lib/http";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const key = String(email ?? "").trim().toLowerCase();
  if (!key || typeof password !== "string") return bad("Enter your email and password.");
  if (tooManyAttempts(key)) return bad("Too many attempts. Try again in 15 minutes.", 429);

  const user = get<{ id: number; password_hash: string; role: string }>(
    "SELECT id, password_hash, role FROM users WHERE email = ?",
    key,
  );
  if (!user || !verifyPassword(password, user.password_hash)) return bad("Incorrect email or password.", 401);
  clearAttempts(key);
  await startSession(user.id);
  return ok({ role: user.role });
}
