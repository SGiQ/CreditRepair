import { all, get, run } from "./db";
import type { Client, ClientBundle, Freeze, Item, Letter, Notification, PortalAccess, Report, Score } from "./types";
import { hasApiKey } from "./agent";
import { emailConfig } from "./email";
import { mailConfig, refreshStaleTracking } from "./mail";
import { paymentsConfig, provider } from "./payments";

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
  const scores = all<Score>("SELECT id, bureau, score, model, as_of, source FROM scores WHERE client_id = ? ORDER BY as_of, id", id);
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
      freezes: [],
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
    freezes: all<Freeze>("SELECT agency, status FROM freezes WHERE client_id = ?", id),
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
