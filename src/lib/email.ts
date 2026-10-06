import nodemailer from "nodemailer";
import { all, get, run } from "./db";
import type { EmailConfig, Letter } from "./types";
import { LETTER_TYPES } from "./types";

// Email goes out through Resend (RESEND_API_KEY) or any SMTP server (SMTP_URL),
// with MAIL_FROM as the sender. EMAIL_PROVIDER=demo logs messages instead of sending.
export function emailConfig(): EmailConfig {
  const from = process.env.MAIL_FROM ?? "";
  if (process.env.RESEND_API_KEY && from) return { enabled: true, mode: "resend", from };
  if (process.env.SMTP_URL && from) return { enabled: true, mode: "smtp", from };
  if (process.env.EMAIL_PROVIDER === "demo") return { enabled: true, mode: "demo", from: from || "demo@example.com" };
  return { enabled: false, mode: "off", from };
}

interface Message {
  to: string;
  subject: string;
  text: string;
  html: string;
}

async function deliver(m: Message): Promise<void> {
  const cfg = emailConfig();
  if (cfg.mode === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? `Resend returned ${res.status}`);
    }
    return;
  }
  if (cfg.mode === "smtp") {
    await nodemailer.createTransport(process.env.SMTP_URL!).sendMail({ from: cfg.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
    return;
  }
  if (cfg.mode === "demo") return;
  throw new Error("Email is not configured.");
}

/** Sends one message and records the outcome in the notifications log. */
export async function sendEmail(args: Message & { clientId: number | null; letterId: number | null; kind: string }): Promise<void> {
  const mode = emailConfig().mode;
  const log = (status: string, error = "") =>
    run(
      "INSERT INTO notifications (client_id, letter_id, kind, recipient, subject, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args.clientId, args.letterId, args.kind, args.to, args.subject, status, error,
    );
  if (mode === "off") return;
  try {
    await deliver(args);
    log(mode === "demo" ? "logged" : "sent");
  } catch (e) {
    console.error("email failed", e);
    log("failed", e instanceof Error ? e.message : String(e));
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/** Password-reset link; the token in it is only ever sent to the account's own address. */
export function sendResetEmail(to: string, link: string, minutes: number): Promise<void> {
  const text = `Someone asked to reset the password for your Credit Repair Desk account.\n\nUse this link within ${minutes} minutes:\n${link}\n\nIf that wasn't you, ignore this email — your password hasn't changed.`;
  return sendEmail({
    clientId: null, letterId: null, kind: "password_reset", to,
    subject: "Reset your password", text,
    html: `<p>Someone asked to reset the password for your Credit Repair Desk account.</p><p>Use this link within ${minutes} minutes:<br><a href="${escape(link)}">${escape(link)}</a></p><p>If that wasn't you, ignore this email — your password hasn't changed.</p>`,
  });
}

/**
 * Emails the client and every admin once a certified letter is confirmed delivered.
 * Runs at most once per letter, so it is safe to call from every tracking refresh.
 */
export async function notifyDelivered(letterId: number): Promise<void> {
  if (!emailConfig().enabled) return;
  // Claim the letter first so two concurrent refreshes can't both send.
  const claimed = run(
    "UPDATE letters SET delivered_notified_at = datetime('now') WHERE id = ? AND delivered_at != '' AND delivered_notified_at = ''",
    letterId,
  );
  if (!claimed.changes) return;

  const l = get<Letter & { client_name: string; client_email: string }>(
    "SELECT l.*, c.name AS client_name, c.email AS client_email FROM letters l JOIN clients c ON c.id = l.client_id WHERE l.id = ?",
    letterId,
  );
  if (!l) return;
  const type = LETTER_TYPES[l.type]?.label ?? l.type;
  const delivered = longDate(l.delivered_at);
  const due = longDate(new Date(new Date(`${l.delivered_at}T12:00:00`).getTime() + 30 * 86_400_000).toISOString().slice(0, 10));
  const tracking = l.mail_tracking ? ` (tracking ${l.mail_tracking})` : "";
  const first = l.client_name.split(" ")[0];

  const jobs: Promise<void>[] = [];
  if (/^\S+@\S+\.\S+$/.test(l.client_email)) {
    const text = `Hi ${first},\n\nYour ${type.toLowerCase()} to ${l.recipient_name} was delivered on ${delivered}${tracking}.\n\nThey now have 30 days to respond — by about ${due}. Keep any mail you receive from them and let your specialist know what it says.\n\nYou can follow progress any time by signing in to your credit file.`;
    jobs.push(
      sendEmail({
        clientId: l.client_id, letterId: l.id, kind: "delivered_client", to: l.client_email,
        subject: `Delivered: your letter to ${l.recipient_name}`, text, html: `<p>${escape(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
      }),
    );
  }
  for (const admin of all<{ email: string }>("SELECT email FROM users WHERE role = 'admin'")) {
    const text = `${l.client_name}'s ${type.toLowerCase()} to ${l.recipient_name} was delivered on ${delivered}${tracking}.\n\nThe 30-day reply window runs to about ${due}. If nothing arrives by then, draft a no-response follow-up.`;
    jobs.push(
      sendEmail({
        clientId: l.client_id, letterId: l.id, kind: "delivered_admin", to: admin.email,
        subject: `Delivered: ${l.client_name} → ${l.recipient_name}`, text, html: `<p>${escape(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
      }),
    );
  }
  await Promise.all(jobs);
}
