import { all, get, getSetting, run } from "./db";
import { emailConfig, sendEmail } from "./email";

// Monthly nudge for clients with a portal login to upload a fresh credit report, so scores
// and item statuses stay current. Runs from the hourly scheduler; each client gets at most
// one reminder per interval, counted from their latest upload, latest reminder, or login creation.

export const REMINDERS_KEY = "report_reminders";
export const REMINDER_DAYS_KEY = "report_reminder_days";
const DAY = 86_400_000;

export interface ReminderSettings {
  enabled: boolean;
  days: number;
  /** UTC hour after which reminders go out (default 15 = 11 a.m. Eastern in summer). */
  hour: number;
}

export function reminderSettings(): ReminderSettings {
  return {
    enabled: getSetting(REMINDERS_KEY, "on") === "on",
    days: Math.min(90, Math.max(7, Number(getSetting(REMINDER_DAYS_KEY, "30")) || 30)),
    hour: Math.min(23, Math.max(0, Number(process.env.REMINDER_HOUR ?? 15) || 0)),
  };
}

const ts = (s: string | null | undefined) => (s ? new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`).getTime() : 0);

interface Candidate {
  id: number;
  name: string;
  login_email: string;
  login_created: string;
  report_reminded_at: string;
  last_upload: string | null;
  items: number;
  open_items: number;
}

const candidates = (clientId?: number) =>
  all<Candidate>(
    `SELECT c.id, c.name, u.email AS login_email, u.created_at AS login_created, c.report_reminded_at,
       (SELECT MAX(uploaded_at) FROM reports r WHERE r.client_id = c.id AND r.status != 'error') AS last_upload,
       (SELECT COUNT(*) FROM items i WHERE i.client_id = c.id) AS items,
       (SELECT COUNT(*) FROM items i WHERE i.client_id = c.id AND i.status NOT IN ('deleted', 'updated')) AS open_items
     FROM clients c JOIN users u ON u.client_id = c.id AND u.role = 'client'
     WHERE c.report_reminders = 1 ${clientId ? "AND c.id = ?" : ""}`,
    ...(clientId ? [clientId] : []),
  );

export function nextReminderAt(clientId: number): string | null {
  const c = candidates(clientId)[0];
  if (!c) return null;
  const base = Math.max(ts(c.last_upload), ts(c.report_reminded_at), ts(c.login_created));
  return new Date(base + reminderSettings().days * DAY).toISOString();
}

async function send(c: Candidate, appUrl: string) {
  const first = c.name.split(" ")[0];
  const link = `${appUrl}/portal`;
  const text = `Hi ${first},\n\nIt's time to upload a fresh copy of your credit report so we can see what has changed and keep your file moving.\n\n1. Download your latest report — from your credit monitoring service, or free from annualcreditreport.com.\n2. Sign in and upload the PDF under "Credit reports": ${link}\n\nIf your report shows your credit scores, they'll be added to your score history automatically.\n\nYou can turn these reminders off from your portal.`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const html = `<p>${esc(text).replace(esc(link), `<a href="${esc(link)}">${esc(link)}</a>`).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
  // Stamp first so a slow send or an overlapping tick can't double-email.
  run("UPDATE clients SET report_reminded_at = datetime('now') WHERE id = ?", c.id);
  await sendEmail({ clientId: c.id, letterId: null, kind: "report_reminder", to: c.login_email, subject: "Time for a fresh credit report", text, html });
}

const baseUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Hourly: emails every client whose reminder is due. Clients with every item resolved are left alone. */
export async function reminderTick(): Promise<number> {
  const cfg = reminderSettings();
  if (!cfg.enabled || !emailConfig().enabled || new Date().getUTCHours() < cfg.hour) return 0;
  const now = Date.now();
  let sent = 0;
  for (const c of candidates()) {
    if (c.items > 0 && c.open_items === 0) continue;
    const base = Math.max(ts(c.last_upload), ts(c.report_reminded_at), ts(c.login_created));
    if (now - base < cfg.days * DAY) continue;
    await send(c, baseUrl());
    sent++;
  }
  return sent;
}

/** "Send now" from the specialist's view of a client. */
export async function sendReminderNow(clientId: number): Promise<string | null> {
  if (!emailConfig().enabled) return "Email isn't configured.";
  const c = get<Candidate>(
    `SELECT c.id, c.name, u.email AS login_email, u.created_at AS login_created, c.report_reminded_at, NULL AS last_upload, 0 AS items, 0 AS open_items
     FROM clients c JOIN users u ON u.client_id = c.id AND u.role = 'client' WHERE c.id = ?`,
    clientId,
  );
  if (!c) return "This client doesn't have a portal login, so there's nowhere to send a reminder.";
  await send(c, baseUrl());
  return null;
}
