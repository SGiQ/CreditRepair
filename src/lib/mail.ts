import { all, run } from "./db";
import { notifyDelivered } from "./email";
import type { Client, Letter, MailConfig } from "./types";

// Sending is behind this small interface so another print-and-mail service
// (e.g. Click2Mail) can be added beside Lob without touching the routes or UI.
export interface PostalAddress {
  name: string;
  company?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface SendArgs {
  letterId: number;
  to: PostalAddress;
  from: PostalAddress;
  pdf: Uint8Array;
  filename: string;
  returnReceipt: boolean;
  /** Changes whenever the approved content changes, so a retry can never double-mail the same letter. */
  idempotencyKey: string;
}

export interface SendResult {
  id: string;
  tracking: string;
  expected: string;
  previewUrl: string;
  /** False for test keys and the demo provider: nothing was printed or mailed. */
  mailed: boolean;
}

export interface TrackingResult {
  status: string;
  /** YYYY-MM-DD once the carrier confirms delivery, else "". */
  deliveredAt: string;
}

interface MailProvider {
  send(args: SendArgs): Promise<SendResult>;
  track(id: string): Promise<TrackingResult>;
}

export class MailError extends Error {}

export function mailConfig(): MailConfig {
  const key = process.env.LOB_API_KEY ?? "";
  if (key.startsWith("live_")) return { enabled: true, mode: "live" };
  if (key.startsWith("test_")) return { enabled: true, mode: "test" };
  if (process.env.MAIL_PROVIDER === "demo") return { enabled: true, mode: "demo" };
  return { enabled: false, mode: "off" };
}

// ---------------------------------------------------------------- Lob

const LOB = "https://api.lob.com/v1";
const lobAuth = () => `Basic ${Buffer.from(`${process.env.LOB_API_KEY}:`).toString("base64")}`;

async function lobError(res: Response): Promise<MailError> {
  const body = await res.json().catch(() => null);
  const message = body?.error?.message ?? `Lob returned ${res.status}`;
  if (res.status === 401) return new MailError("Lob rejected the API key. Check LOB_API_KEY in .env.local.");
  return new MailError(`Lob could not accept this letter: ${message}`);
}

const lob: MailProvider = {
  async send(a) {
    const form = new FormData();
    const address = (prefix: "to" | "from", p: PostalAddress) => {
      form.set(`${prefix}[name]`, p.name);
      if (p.company) form.set(`${prefix}[company]`, p.company);
      form.set(`${prefix}[address_line1]`, p.line1);
      if (p.line2) form.set(`${prefix}[address_line2]`, p.line2);
      form.set(`${prefix}[address_city]`, p.city);
      form.set(`${prefix}[address_state]`, p.state);
      form.set(`${prefix}[address_zip]`, p.zip);
      form.set(`${prefix}[address_country]`, "US");
    };
    address("to", a.to);
    address("from", a.from);
    form.set("description", `Letter ${a.letterId} to ${a.to.name}`.slice(0, 255));
    form.set("file", new Blob([new Uint8Array(a.pdf)], { type: "application/pdf" }), a.filename);
    form.set("color", "false");
    form.set("double_sided", "false");
    form.set("use_type", "operational");
    form.set("mail_type", "usps_first_class");
    // Certified mail adds Lob's own address-and-barcode sheet in front, so the letter itself prints untouched.
    form.set("extra_service", a.returnReceipt ? "certified_return_receipt" : "certified");
    form.set("metadata[letter_id]", String(a.letterId));

    const res = await fetch(`${LOB}/letters`, {
      method: "POST",
      headers: { Authorization: lobAuth(), "Idempotency-Key": a.idempotencyKey },
      body: form,
    });
    if (!res.ok) throw await lobError(res);
    const l = await res.json();
    return {
      id: l.id,
      tracking: l.tracking_number ?? "",
      expected: l.expected_delivery_date ?? "",
      previewUrl: l.url ?? "",
      mailed: (process.env.LOB_API_KEY ?? "").startsWith("live_"),
    };
  },

  async track(id) {
    const res = await fetch(`${LOB}/letters/${encodeURIComponent(id)}`, { headers: { Authorization: lobAuth() } });
    if (!res.ok) throw await lobError(res);
    return lobTracking(await res.json());
  },
};

/** Exported for tests: reduces Lob's tracking_events to the latest status and the delivery date. */
export function lobTracking(letter: { tracking_events?: { name?: string; time?: string }[] }): TrackingResult {
  const events = [...(letter.tracking_events ?? [])].sort((x, y) => String(x.time).localeCompare(String(y.time)));
  const delivered = events.find((e) => e.name === "Delivered");
  return {
    status: events.at(-1)?.name ?? "Processing at the print facility",
    deliveredAt: delivered?.time ? delivered.time.slice(0, 10) : "",
  };
}

// ---------------------------------------------------------------- Demo

// Pretends to mail and then "delivers" within a couple of minutes, so the whole flow can be shown without an account.
const demo: MailProvider = {
  async send() {
    const now = Date.now();
    return {
      id: `demo_${now}`,
      tracking: `DEMO${String(now).slice(-10)}`,
      expected: new Date(now + 5 * 86_400_000).toISOString().slice(0, 10),
      previewUrl: "",
      mailed: false,
    };
  },
  async track(id) {
    const age = Date.now() - Number(id.replace("demo_", ""));
    if (age < 45_000) return { status: "Mailed", deliveredAt: "" };
    if (age < 90_000) return { status: "In Transit", deliveredAt: "" };
    return { status: "Delivered", deliveredAt: new Date().toISOString().slice(0, 10) };
  },
};

const provider = (name: string): MailProvider => (name === "demo" ? demo : lob);

export function activeProvider(): { name: string; api: MailProvider } {
  const { mode } = mailConfig();
  if (mode === "off") throw new MailError("Mail sending isn't connected. Add LOB_API_KEY to .env.local and restart the app.");
  const name = mode === "demo" ? "demo" : "lob";
  return { name, api: provider(name) };
}

// ---------------------------------------------------------------- Addresses

const clip = (s: string, n: number) => s.trim().slice(0, n);

/** Turns a letter's free-text recipient block into the structured address a mail service needs. */
export function parseRecipient(name: string, block: string): PostalAddress {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines.pop() ?? "";
  const m = last.match(/^(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m || !lines.length) {
    throw new MailError('The recipient address isn\'t complete. Edit the letter so the address ends with a "City, ST 12345" line under the street or P.O. Box.');
  }
  // The delivery line is the street or P.O. Box; anything else (Attn:, suite, department) rides on line 2.
  const street = [...lines].reverse().find((l) => /\d/.test(l)) ?? lines[lines.length - 1];
  const rest = lines.filter((l) => l !== street).join(", ");
  if (street.length > 64 || rest.length > 64) throw new MailError("An address line is longer than 64 characters. Shorten it in the letter.");

  // Names are capped at 40 characters; spill the remainder onto the company line.
  let primary = name.trim();
  let company = "";
  if (primary.length > 40) {
    const cut = primary.lastIndexOf(" ", 40);
    company = clip(primary.slice(cut > 0 ? cut : 40), 40);
    primary = primary.slice(0, cut > 0 ? cut : 40).trim();
  }
  if (!primary) throw new MailError("The letter has no recipient name.");
  return { name: primary, company, line1: street, line2: rest, city: m[1].replace(/,$/, "").trim(), state: m[2].toUpperCase(), zip: m[3] };
}

export function clientAddress(c: Client): PostalAddress {
  if (!c.address1 || !c.city || !/^[A-Za-z]{2}$/.test(c.state) || !/^\d{5}(-\d{4})?$/.test(c.zip)) {
    throw new MailError("The client's mailing address is incomplete (street, city, 2-letter state and ZIP are needed). It is used as the return address.");
  }
  return { name: clip(c.name, 40), line1: clip(c.address1, 64), line2: clip(c.address2, 64), city: c.city.trim(), state: c.state.toUpperCase(), zip: c.zip };
}

// ---------------------------------------------------------------- Tracking

export async function refreshTracking(letter: Pick<Letter, "id" | "mail_id" | "mail_provider">): Promise<void> {
  if (!letter.mail_id) return;
  const t = await provider(letter.mail_provider).track(letter.mail_id);
  run(
    "UPDATE letters SET mail_status = ?, delivered_at = CASE WHEN ? != '' THEN ? ELSE delivered_at END, mail_checked_at = datetime('now') WHERE id = ?",
    t.status,
    t.deliveredAt,
    t.deliveredAt,
    letter.id,
  );
  if (t.deliveredAt) await notifyDelivered(letter.id);
}

/** Every undelivered certified letter across all clients; the background poller walks this list. */
export async function pollAllTracking(): Promise<void> {
  const rows = all<Pick<Letter, "id" | "mail_id" | "mail_provider">>(
    "SELECT id, mail_id, mail_provider FROM letters WHERE mail_id != '' AND status = 'sent' AND delivered_at = ''",
  );
  for (const row of rows) {
    run("UPDATE letters SET mail_checked_at = datetime('now') WHERE id = ?", row.id);
    await refreshTracking(row).catch((e) => console.error("tracking poll failed", e));
  }
}

/** Called when the specialist opens a file: quietly re-checks undelivered mail that hasn't been looked at lately. */
export function refreshStaleTracking(clientId: number) {
  const window = mailConfig().mode === "demo" ? "-20 seconds" : "-6 hours";
  const rows = all<Pick<Letter, "id" | "mail_id" | "mail_provider">>(
    `SELECT id, mail_id, mail_provider FROM letters
     WHERE client_id = ? AND mail_id != '' AND status = 'sent' AND delivered_at = ''
       AND (mail_checked_at = '' OR mail_checked_at < datetime('now', ?))`,
    clientId,
    window,
  );
  for (const row of rows) {
    // Mark first so concurrent page loads don't all hit the provider.
    run("UPDATE letters SET mail_checked_at = datetime('now') WHERE id = ?", row.id);
    void refreshTracking(row).catch((e) => console.error("tracking refresh failed", e));
  }
}
