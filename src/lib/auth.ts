import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { get, run } from "./db";
import type { SessionUser } from "./types";

const COOKIE = "crd_session";
const SESSION_DAYS = 30;
export const INVITE_DAYS = 7;
export const MIN_PASSWORD = 10;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = sha;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return "Password is too long.";
  return null;
}

export const hasAdmin = () => Boolean(get("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1"));

/** Only the token's hash is stored, so a copy of the database cannot be replayed as a login. */
export async function startSession(userId: number) {
  const token = newToken();
  run("DELETE FROM sessions WHERE expires_at < datetime('now')");
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))", sha(token), userId, `+${SESSION_DAYS} days`);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", sha(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return (
    get<SessionUser>(
      `SELECT u.id, u.email, u.role, u.client_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
      sha(token),
    ) ?? null
  );
}

const deny = (status: number, error: string) => Response.json({ error }, { status });

/** Route-handler guards: return the user, or the Response to send back. */
export async function requireUser(): Promise<SessionUser | Response> {
  return (await currentUser()) ?? deny(401, "Sign in to continue.");
}

export async function requireAdmin(): Promise<SessionUser | Response> {
  const user = await currentUser();
  if (!user) return deny(401, "Sign in to continue.");
  return user.role === "admin" ? user : deny(403, "Not allowed.");
}

/** The specialist, or the client whose file this is. */
export async function requireClientAccess(clientId: number): Promise<SessionUser | Response> {
  const user = await currentUser();
  if (!user) return deny(401, "Sign in to continue.");
  return user.role === "admin" || user.client_id === clientId ? user : deny(403, "Not allowed.");
}

export const RESET_MINUTES = 60;

/** Issues a one-time password-reset token for a user; any earlier token for them stops working. */
export function createResetToken(userId: number): string {
  const token = newToken();
  run("DELETE FROM password_resets WHERE user_id = ? OR expires_at < datetime('now')", userId);
  run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))", sha(token), userId, `+${RESET_MINUTES} minutes`);
  return token;
}

export function findResetToken(token: string) {
  return get<{ user_id: number; email: string; role: "admin" | "client" }>(
    `SELECT u.id AS user_id, u.email, u.role FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = ? AND r.expires_at > datetime('now')`,
    sha(token),
  );
}

/** Sets a new password and signs the account out everywhere else. */
export function resetPassword(userId: number, password: string) {
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(password), userId);
  run("DELETE FROM sessions WHERE user_id = ?", userId);
  run("DELETE FROM password_resets WHERE user_id = ?", userId);
}

/** Public base URL for links in emails: APP_URL if set, else what the request came in on. */
export function appUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

// Small in-memory throttle for password guessing; resets when the server restarts.
const attempts = new Map<string, { count: number; resetAt: number }>();
export function tooManyAttempts(key: string, max = 8, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  return ++entry.count > max;
}
export const clearAttempts = (key: string) => attempts.delete(key);
