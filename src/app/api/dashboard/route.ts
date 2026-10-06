import { requireAdmin } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { ok } from "@/lib/http";

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

  // Change from the first to the latest reading, per client and bureau, averaged across every pair with 2+ readings.
  const scoreRows = all<{ client_id: number; bureau: string; first: number; latest: number }>(`
    SELECT client_id, bureau,
      (SELECT score FROM scores s2 WHERE s2.client_id = s.client_id AND s2.bureau = s.bureau ORDER BY as_of, id LIMIT 1) AS first,
      (SELECT score FROM scores s2 WHERE s2.client_id = s.client_id AND s2.bureau = s.bureau ORDER BY as_of DESC, id DESC LIMIT 1) AS latest
    FROM scores s GROUP BY client_id, bureau HAVING COUNT(*) > 1`);
  const scoreChange = scoreRows.length
    ? Math.round(scoreRows.reduce((sum, r) => sum + (r.latest - r.first), 0) / scoreRows.length)
    : null;

  return ok({
    score_change: scoreChange,
    score_clients: new Set(scoreRows.map((r) => r.client_id)).size,
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
