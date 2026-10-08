import { all, get, run } from "./db";
import type { Client, ClientBundle, Freeze, Item, Letter, Notification, PortalAccess, Report, Score } from "./types";
import { hasApiKey } from "./agent";
import { emailConfig } from "./email";
import { mailConfig, refreshStaleTracking } from "./mail";
import { paymentsConfig, provider } from "./payments";
import { getPlan } from "./plan";

type Raw = Record<string, unknown>;
const j = <T>(v: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
};

export const toItem = (r: Raw): Item =>
  ({
    ...r,
    bureaus: j(r.bureaus, []),
    issues: j(r.issues, []),
    laws: j(r.laws, []),
    next_steps: j(r.next_steps, []),
    identity_theft: Boolean(r.identity_theft),
  }) as unknown as Item;

export const toLetter = (r: Raw): Letter =>
  ({ ...r, item_ids: j(r.item_ids, []), enclosures: j(r.enclosures, []), mail_test: Boolean(r.mail_test) }) as unknown as Letter;

export const getClient = (id: number) => get<Client>("SELECT * FROM clients WHERE id = ?", id);
export const getItems = (clientId: number) =>
  all("SELECT * FROM items WHERE client_id = ? ORDER BY id", clientId).map(toItem);
export const getLetters = (clientId: number) =>
  all("SELECT * FROM letters WHERE client_id = ? ORDER BY id DESC", clientId).map(toLetter);
export const getLetter = (id: number) => {
  const r = get("SELECT * FROM letters WHERE id = ?", id);
  return r ? toLetter(r) : undefined;
};

// Background jobs die with the server process; don't leave rows spinning forever.
function expireStaleJobs() {
  run(
    "UPDATE reports SET status = 'error', error = 'Analysis was interrupted. Upload the report again.' WHERE status = 'analyzing' AND uploaded_at < datetime('now', '-30 minutes')",
  );
  run(
    "UPDATE letters SET status = 'error', error = 'Drafting was interrupted. Generate it again.' WHERE status = 'generating' AND created_at < datetime('now', '-15 minutes')",
  );
  run(
    "UPDATE plans SET status = 'error', error = 'Building the plan was interrupted. Try again.' WHERE status = 'generating' AND created_at < datetime('now', '-20 minutes')",
  );
}

function portalAccess(clientId: number): PortalAccess {
  const user = get<{ email: string }>("SELECT email FROM users WHERE client_id = ? AND role = 'client'", clientId);
  if (user) return { status: "active", email: user.email };
  const invite = get<{ email: string }>(
    "SELECT email FROM invites WHERE client_id = ? AND expires_at > datetime('now')",
    clientId,
  );
  return invite ? { status: "invited", email: invite.email } : { status: "none", email: "" };
}

/** A client login gets its own file without the specialist's working notes, unfinished drafts, or settings. */
export function getBundle(id: number, role: "admin" | "client" = "admin"): ClientBundle | undefined {
  const row = getClient(id);
  if (!row) return undefined;
  expireStaleJobs();
  const { signature = "", signature_at = "", ...client } = row;
  const reports = all<Report>(
    "SELECT id, client_id, filename, status, error, summary, uploaded_at FROM reports WHERE client_id = ? ORDER BY id DESC",
    id,
  );
  const mail = mailConfig();
  const email = emailConfig();
  const payments = paymentsConfig();
  const scores = all<Score>("SELECT id, report_id, bureau, score, model, as_of, source FROM scores WHERE client_id = ? ORDER BY as_of, id", id);
  if (role === "client") {
    return {
      client,
      signature: { onFile: Boolean(signature), at: signature_at, image: signature },
      mail,
      email,
      payments,
      reports: reports.map((r) => (r.status === "error" ? { ...r, error: "We couldn't read this file. Try uploading it again, or contact your specialist." } : r)),
      items: getItems(id).map((i) => ({ ...i, notes: "" })),
      letters: getLetters(id).filter((l) => l.status === "draft" || l.status === "sent"),
      scores,
      plan: clientPlan(id),
      // Clients see their freeze statuses and whether a letter is on file, never the letter itself.
      freezes: all<Freeze>("SELECT agency, status, confirmed_on, confirmation_number, doc_name, added_by FROM freezes WHERE client_id = ?", id),
      hasApiKey: true,
    };
  }
  refreshStaleTracking(id);
  return {
    client,
    access: portalAccess(id),
    signature: { onFile: Boolean(signature), at: signature_at },
    mail,
    email,
    payments,
    notifications: all<Notification>(
      "SELECT id, letter_id, kind, recipient, subject, status, error, created_at FROM notifications WHERE client_id = ? ORDER BY id DESC LIMIT 20",
      id,
    ),
    reports,
    items: getItems(id),
    letters: getLetters(id),
    scores,
    plan: getPlan(id),
    freezes: all<Freeze>("SELECT agency, status, confirmed_on, confirmation_number, doc_name, added_by FROM freezes WHERE client_id = ?", id),
    hasApiKey: hasApiKey(),
  };
}

/** Starts a letter's 30-day clock and moves its items to "awaiting response". */
export function markLetterSent(letter: Letter, date: string) {
  run("UPDATE letters SET status = 'sent', sent_at = ? WHERE id = ?", date, letter.id);
  for (const itemId of letter.item_ids) {
    run(
      "UPDATE items SET status = 'awaiting_response', updated_at = datetime('now') WHERE id = ? AND status IN ('identified', 'disputed')",
      itemId,
    );
  }
}

/** Asks the payment provider about a letter's order and records a completed payment. Returns the resulting status. */
export async function settleLetterPayment(letter: Letter): Promise<"paid" | "pending" | "failed"> {
  if (letter.payment_status === "paid") return "paid";
  const result = await provider().settle(letter.payment_order_id);
  if (result.status === "paid") {
    run("UPDATE letters SET payment_status = 'paid', paid_cents = ?, paid_at = datetime('now'), delivery_choice = 'service' WHERE id = ?", result.cents, letter.id);
    return "paid";
  }
  if (result.status === "other") {
    run("UPDATE letters SET payment_status = '', payment_order_id = '' WHERE id = ?", letter.id);
    return "failed";
  }
  return "pending";
}

/** The client's view: the latest finished plan (even while a refresh runs), without the specialist's letter notes. */
function clientPlan(clientId: number) {
  const p = getPlan(clientId);
  if (!p?.data) return null;
  return {
    ...p,
    status: "done" as const,
    error: "",
    data: { ...p.data, rounds: p.data.rounds.map((r) => ({ ...r, actions: r.actions.map((a) => ({ ...a, note: "" })) })) },
  };
}

/**
 * Brings item statuses back in line with the letters that actually exist: an item marked "dispute drafted"
 * with no draft or sent letter left goes back to "identified", and one "awaiting response" with no sent
 * letter left goes back to "disputed" (or "identified"). Resolved and verified items are never touched.
 */
export function reconcileItemStatuses(clientId: number, itemIds?: number[]) {
  const letters = getLetters(clientId).filter((l) => l.type !== "freeze_request");
  const drafted = new Set(letters.filter((l) => l.status === "draft" || l.status === "generating").flatMap((l) => l.item_ids));
  const sent = new Set(letters.filter((l) => l.status === "sent").flatMap((l) => l.item_ids));
  let changed = 0;
  for (const i of getItems(clientId)) {
    if (itemIds && !itemIds.includes(i.id)) continue;
    let next = i.status;
    if (i.status === "disputed" && !drafted.has(i.id) && !sent.has(i.id)) next = "identified";
    if (i.status === "awaiting_response" && !sent.has(i.id)) next = drafted.has(i.id) ? "disputed" : "identified";
    if (next !== i.status) {
      run("UPDATE items SET status = ?, updated_at = datetime('now') WHERE id = ?", next, i.id);
      changed++;
    }
  }
  return changed;
}
