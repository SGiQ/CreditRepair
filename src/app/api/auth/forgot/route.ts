import { appUrl, createResetToken, RESET_MINUTES, tooManyAttempts } from "@/lib/auth";
import { get } from "@/lib/db";
import { emailConfig, sendResetEmail } from "@/lib/email";
import { bad, ok } from "@/lib/http";

/** Always answers the same way, so the form can't be used to discover which emails have accounts. */
export async function POST(req: Request) {
  const { email } = await req.json();
  const key = String(email ?? "").trim().toLowerCase();
  if (!key) return bad("Enter your email address.");
  if (!emailConfig().enabled) return bad("Email isn't set up on this app, so links can't be sent. Ask your specialist for a reset link instead.", 503);
  if (tooManyAttempts(`forgot:${key}`, 3, 60 * 60_000)) return ok({ sent: true });

  const user = get<{ id: number; email: string }>("SELECT id, email FROM users WHERE email = ?", key);
  if (user) {
    const token = createResetToken(user.id);
    await sendResetEmail(user.email, `${appUrl(req)}/reset/${token}`, RESET_MINUTES);
  }
  return ok({ sent: true });
}
