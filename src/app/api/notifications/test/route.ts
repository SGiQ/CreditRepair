import { requireAdmin } from "@/lib/auth";
import { emailConfig, sendEmail } from "@/lib/email";
import { bad, ok } from "@/lib/http";
import { get } from "@/lib/db";

/** Sends a plain test message so email setup can be checked without waiting for a real event. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const cfg = emailConfig();
  if (!cfg.enabled) return bad("Email isn't configured. Set MAIL_FROM plus RESEND_API_KEY or SMTP_URL.");
  const { to } = await req.json();
  if (!/^\S+@\S+\.\S+$/.test(String(to ?? ""))) return bad("Enter a valid email address.");
  const text = `This is a test message from Credit Repair Desk, sent by ${auth.email}.\n\nIf you're reading it, email delivery is working. Sent from ${cfg.from} via ${cfg.mode}.`;
  await sendEmail({ clientId: null, letterId: null, kind: "test", to: String(to).trim(), subject: "Credit Repair Desk test email", text, html: `<p>${text.replace(/\n\n/g, "</p><p>")}</p>` });
  const last = get<{ status: string; error: string }>("SELECT status, error FROM notifications ORDER BY id DESC LIMIT 1");
  if (last?.status === "failed") return bad(`Sending failed: ${last.error}`, 502);
  return ok({ status: last?.status ?? "sent" });
}
