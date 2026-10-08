import { requireAdmin } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { ok } from "@/lib/http";
import { scoreSeries } from "@/lib/scores";
import type { Score } from "@/lib/types";
import type { KeyDate, Step } from "@/lib/steps";
import { hasApiKey } from "@/lib/agent";
import { backupConfig } from "@/lib/backup";
import { emailConfig } from "@/lib/email";
import { mailConfig } from "@/lib/mail";
import { paymentsConfig } from "@/lib/payments";

export const dynamic = "force-dynamic";

interface ClientRow {
  id: number;
  name: string;
  reports: number;
  failed_reports: number;
  open_items: number;
  verified: number;
  drafts: number;
  overdue: number;
  due_soon: number;
  worst_overdue: number;
}

/** Cross-client numbers and a worklist for the specialist's home screen. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  // Reply clocks only run on dispute letters; freeze requests are tracked on their own tab.
  const WAITING = "l.status = 'sent' AND l.response = '' AND l.sent_at != '' AND l.type NOT IN ('freeze_request', 'cfpb_complaint')";
  const rows = all<ClientRow>(`
    SELECT c.id, c.name,
      (SELECT COUNT(*) FROM reports r WHERE r.client_id = c.id) AS reports,
      (SELECT COUNT(*) FROM reports r WHERE r.client_id = c.id AND r.status = 'error') AS failed_reports,
      (SELECT COUNT(*) FROM items i WHERE i.client_id = c.id AND i.status NOT IN ('deleted', 'updated')) AS open_items,
      (SELECT COUNT(*) FROM items i WHERE i.client_id = c.id AND i.status = 'verified') AS verified,
      (SELECT COUNT(*) FROM letters l WHERE l.client_id = c.id AND l.status = 'draft' AND l.type NOT IN ('cfpb_complaint', 'freeze_request')) AS drafts,
      (SELECT COUNT(*) FROM letters l WHERE l.client_id = c.id AND ${WAITING} AND julianday('now') - julianday(CASE WHEN l.delivered_at != '' THEN l.delivered_at ELSE l.sent_at END) > 30) AS overdue,
      (SELECT COUNT(*) FROM letters l WHERE l.client_id = c.id AND ${WAITING} AND julianday('now') - julianday(CASE WHEN l.delivered_at != '' THEN l.delivered_at ELSE l.sent_at END) BETWEEN 23 AND 30) AS due_soon,
      (SELECT COALESCE(MAX(CAST(julianday('now') - julianday(CASE WHEN l.delivered_at != '' THEN l.delivered_at ELSE l.sent_at END) - 30 AS INTEGER)), 0) FROM letters l WHERE l.client_id = c.id AND ${WAITING}) AS worst_overdue
    FROM clients c ORDER BY c.name COLLATE NOCASE`);

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const attention: { client_id: number; client: string; text: string; tone: "red" | "amber" | "stone"; rank: number }[] = [];
  for (const r of rows) {
    const add = (rank: number, tone: "red" | "amber" | "stone", text: string) =>
      attention.push({ client_id: r.id, client: r.name, text, tone, rank });
    if (r.overdue) add(0, "red", `${plural(r.overdue, "letter")} past the 30-day reply deadline (up to ${r.worst_overdue} days over) — send a no-response follow-up`);
    if (r.verified) add(1, "red", `${plural(r.verified, "item")} came back verified — send a method-of-verification demand`);
    if (r.failed_reports) add(2, "red", `${plural(r.failed_reports, "report")} failed to analyze — upload again`);
    if (r.due_soon) add(3, "amber", `${plural(r.due_soon, "reply", "replies")} due within a week`);
    if (r.drafts) add(4, "amber", `${plural(r.drafts, "drafted letter")} not yet mailed`);
    if (!r.reports) add(5, "stone", "No credit report uploaded yet");
  }
  attention.sort((a, b) => a.rank - b.rank || a.client.localeCompare(b.client));

  const statuses = all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM items GROUP BY status");
  const count = (sql: string) => get<{ n: number }>(sql)?.n ?? 0;
  const items = statuses.reduce((s, r) => s + r.n, 0);
  const resolved = statuses.filter((r) => r.status === "deleted" || r.status === "updated").reduce((s, r) => s + r.n, 0);

  // Change from first to latest reading within each client + bureau + scoring model, averaged over every series
  // with 2+ readings. Different models are never compared with each other.
  const allScores = all<Score & { client_id: number }>("SELECT id, client_id, report_id, bureau, score, model, as_of, source FROM scores");
  const byClient = new Map<number, Score[]>();
  for (const s of allScores) byClient.set(s.client_id, [...(byClient.get(s.client_id) ?? []), s]);
  const changes: { client_id: number; change: number }[] = [];
  for (const [client_id, list] of byClient) {
    for (const series of scoreSeries(list)) if (series.change !== null) changes.push({ client_id, change: series.change });
  }
  const scoreChange = changes.length ? Math.round(changes.reduce((sum, c) => sum + c.change, 0) / changes.length) : null;

  // ---- Business setup checklist for the sidebar
  const firstClient = get<{ id: number }>("SELECT id FROM clients ORDER BY id LIMIT 1");
  const clientUrl = firstClient ? `/clients/${firstClient.id}` : "#clients";
  const has = (sql: string) => Boolean(get(sql));
  const email = emailConfig();
  const backups = backupConfig();
  const offsiteOk = has("SELECT 1 FROM backups WHERE status = 'ok' AND destination LIKE '%bucket%'");
  const mail = mailConfig();
  const pay = paymentsConfig();
  const setup: Step[] = [
    {
      key: "ai",
      title: "Connect the AI agent",
      detail: "Add ANTHROPIC_API_KEY to the app's environment (Railway → Variables). Report analysis, letters and the advisor need it.",
      done: hasApiKey(),
    },
    {
      key: "email",
      title: "Turn on email",
      detail: "Set MAIL_FROM plus RESEND_API_KEY or SMTP_URL so invites, password resets, delivery notices and reminders can be sent.",
      done: email.enabled && email.mode !== "demo",
      target: "/admin",
      cta: "Open email settings",
    },
    {
      key: "backups",
      title: "Back up off-site, encrypted",
      detail: !backups.remote
        ? "Add the R2/S3 bucket keys so nightly backups are copied off this server."
        : !backups.encrypted
          ? "Set BACKUP_PASSPHRASE so backups are encrypted. They contain client data."
          : "Settings are in place. Run one backup to confirm it reaches the bucket.",
      done: Boolean(backups.remote) && backups.encrypted && offsiteOk,
      target: "/admin",
      cta: backups.remote && backups.encrypted ? "Run a backup now" : "Open backup settings",
      expect: "Backups run nightly after BACKUP_HOUR. A manual one takes a few seconds.",
    },
    {
      key: "client",
      title: "Add your first client",
      detail: "Name, mailing address, date of birth and last 4 of SSN. These print on every letter.",
      done: Boolean(firstClient),
      target: "#clients",
      cta: "Add a client",
    },
    {
      key: "report",
      title: "Upload a credit report",
      detail: "Upload the client's report on their Overview. The agent lists every negative item with the laws and dispute angle.",
      done: has("SELECT 1 FROM reports WHERE status = 'done'"),
      target: clientUrl,
      cta: "Go to the client",
      expect: "Analysis takes about 2–5 minutes per report.",
    },
    {
      key: "invite",
      title: "Invite a client to their portal",
      detail: "On the client's Overview, Client login → Create invite link. They can then upload reports, approve letters and follow progress.",
      done: has("SELECT 1 FROM users WHERE role = 'client'"),
      target: clientUrl,
      cta: "Go to the client",
    },
    {
      key: "letters",
      title: "Draft your first letters",
      detail: "Pick the items on the Negative items tab and draft round-one disputes.",
      done: has("SELECT 1 FROM letters WHERE status IN ('draft', 'sent') AND type != 'freeze_request'"),
      target: clientUrl,
      cta: "Go to the client",
    },
    {
      key: "lob",
      title: "Connect certified mail (Lob)",
      detail: "Add LOB_API_KEY so approved letters can be mailed from the app with tracking. Until then, letters are printed and mailed by hand.",
      done: mail.mode === "live" || mail.mode === "test",
      optional: true,
    },
    {
      key: "paypal",
      title: "Take mailing fees by PayPal",
      detail: "Add the PayPal app keys and set a fee per letter on the Accounts page.",
      done: pay.enabled && pay.mode !== "demo" && pay.feeCents > 0,
      target: "/admin",
      cta: "Open fee settings",
      optional: true,
    },
  ];

  // ---- Key numbers for the sidebar
  const newLeads = get<{ n: number }>("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'")?.n ?? 0;
  const drafts = rows.reduce((s, r) => s + r.drafts, 0);
  const dueSoon = rows.reduce((s, r) => s + r.due_soon, 0);
  const overdue = rows.reduce((s, r) => s + r.overdue, 0);
  const lastBackup = get<{ created_at: string }>("SELECT created_at FROM backups WHERE status = 'ok' ORDER BY id DESC LIMIT 1");
  const keyDates: KeyDate[] = [];
  if (overdue) keyDates.push({ label: "Replies overdue", value: String(overdue), tone: "red" });
  if (dueSoon) keyDates.push({ label: "Replies due this week", value: String(dueSoon), tone: "amber" });
  if (drafts) keyDates.push({ label: "Letters not yet mailed", value: String(drafts), tone: "amber" });
  if (newLeads) keyDates.push({ label: "New inquiries", value: String(newLeads), tone: "amber" });
  keyDates.push({
    label: "Last backup",
    value: lastBackup ? new Date(`${lastBackup.created_at.replace(" ", "T")}Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never",
    tone: lastBackup ? undefined : "red",
  });

  return ok({
    setup,
    key_dates: keyDates,
    score_change: scoreChange,
    score_clients: new Set(changes.map((c) => c.client_id)).size,
    totals: {
      clients: rows.length,
      items,
      resolved,
      open: items - resolved,
      awaiting: count(`SELECT COUNT(*) AS n FROM letters l WHERE ${WAITING}`),
      overdue: rows.reduce((s, r) => s + r.overdue, 0),
      portal_logins: count("SELECT COUNT(*) AS n FROM users WHERE role = 'client'"),
    },
    statuses: Object.fromEntries(statuses.map((r) => [r.status, r.n])),
    attention,
  });
}
