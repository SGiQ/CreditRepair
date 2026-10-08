import { get, run } from "./db";
import { analyzeReport, draftLetter, friendlyError, type Analysis } from "./agent";
import { sameAccount } from "./dedupe";
import { knownItems, mergeInto } from "./merge";
import { BUREAU_ADDRESS, SECONDARY_AGENCIES } from "./agencies";
import { getClient, getItems, getLetters } from "./store";
import type { Bureau, Client, Item, LetterType } from "./types";
import { BUREAUS, LETTER_TYPES } from "./types";

/** Runs after the upload response is sent; the UI polls for the result. */
export async function runAnalysis(reportId: number, clientId: number, filePath: string, filename: string) {
  try {
    const analysis = await analyzeReport(filePath, filename, knownItems(clientId));
    applyAnalysis(reportId, clientId, analysis);
  } catch (e) {
    console.error("analysis failed", e);
    run("UPDATE reports SET status = 'error', error = ? WHERE id = ?", friendlyError(e), reportId);
  }
}

/** Stores an analysis: new accounts are added, accounts already in the file are updated in place. */
export function applyAnalysis(reportId: number, clientId: number, analysis: Analysis) {
  {
    const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(analysis.report_date) ? analysis.report_date : new Date().toISOString().slice(0, 10);
    const insert = (it: (typeof analysis.items)[number]) =>
      Number(
        run(
          `INSERT INTO items (client_id, report_id, creditor, creditor_address, original_creditor, account_number, category, bureaus,
             balance, date_opened, date_of_first_delinquency, reported_status, issues, laws, dispute_angle, next_steps, strength)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          clientId, reportId, it.creditor, it.creditor_address, it.original_creditor, it.account_number, it.category,
          JSON.stringify(it.bureaus), it.balance, it.date_opened, it.date_of_first_delinquency, it.reported_status,
          JSON.stringify(it.issues), JSON.stringify(it.laws), it.dispute_angle, JSON.stringify(it.next_steps), it.strength,
        ).lastInsertRowid,
      );

    for (const it of analysis.items) {
      // The agent's match first; the rule-based check catches what it misses.
      const current = getItems(clientId);
      const match =
        current.find((i) => i.id === it.same_as_item_id && i.category === it.category) ??
        current.find((i) => i.report_id !== reportId && sameAccount(i, it));
      if (!match) {
        insert(it);
        continue;
      }
      // Same account seen again: refresh what the new report says, keep the specialist's work.
      const reappeared = match.status === "deleted" || match.status === "updated";
      const freshId = insert(it);
      const fresh = getItems(clientId).find((i) => i.id === freshId)!;
      mergeInto(match, [{ ...fresh, status: match.status, notes: "" }]);
      // The item keeps its original report: removing this newer report must not delete an account older reports show.
      run(
        "UPDATE items SET reported_status = ?, balance = CASE WHEN ? != '' THEN ? ELSE balance END WHERE id = ?",
        it.reported_status, it.balance, it.balance, match.id,
      );
      if (reappeared) {
        run(
          "UPDATE items SET status = 'identified', notes = TRIM(notes || ?) WHERE id = ?",
          `\n\nReappeared on the report dated ${reportDate} after being marked ${match.status}. Check for reinsertion: a bureau must notify the consumer in writing within 5 business days of reinserting deleted information (FCRA §611(a)(5)(B)).`,
          match.id,
        );
      }
    }
    const asOf = reportDate;
    for (const s of analysis.scores) {
      if (s.score < 300 || s.score > 850) continue;
      // The same report uploaded twice shouldn't record the same reading twice.
      const seen = get(
        "SELECT 1 FROM scores WHERE client_id = ? AND bureau = ? AND score = ? AND as_of = ? AND lower(model) = lower(?)",
        clientId, s.bureau, Math.round(s.score), asOf, s.model,
      );
      if (seen) continue;
      run(
        "INSERT INTO scores (client_id, report_id, bureau, score, model, as_of, source) VALUES (?, ?, ?, ?, ?, ?, 'report')",
        clientId, reportId, s.bureau, Math.round(s.score), s.model, asOf,
      );
    }
    run("UPDATE reports SET status = 'done', summary = ? WHERE id = ?", analysis.summary, reportId);
  }
}

interface Planned {
  recipient_name: string;
  recipient_address: string;
  items: Item[];
}

function planLetters(type: LetterType, items: Item[], bureaus: Bureau[]): Planned[] {
  const to = LETTER_TYPES[type].to;
  if (to === "furnisher") {
    return items.map((i) => ({
      recipient_name: i.creditor,
      recipient_address: i.creditor_address || "[Creditor mailing address]",
      items: [i],
    }));
  }
  // One document per bureau covering every selected item that bureau reports.
  return bureaus
    .map((b) => ({ b, its: items.filter((i) => i.bureaus.includes(b)) }))
    .filter(({ its }) => its.length)
    .map(({ b, its }) =>
      to === "cfpb"
        ? { recipient_name: `Complaint against ${BUREAU_ADDRESS[b].name}`, recipient_address: "", items: its }
        : { recipient_name: BUREAU_ADDRESS[b].name, recipient_address: BUREAU_ADDRESS[b].address, items: its },
    );
}

const BUREAU_DISPUTES = new Set(["bureau_dispute", "method_of_verification", "no_response", "inquiry_removal", "personal_info"]);

/** True once a bureau dispute covering this item was sent 45+ days ago or got an answer (the CFPB's filing rule). */
export function cfpbReady(itemId: number, letters: ReturnType<typeof getLetters>): boolean {
  return letters.some(
    (l) =>
      BUREAU_DISPUTES.has(l.type) &&
      l.status === "sent" &&
      l.item_ids.includes(itemId) &&
      (Boolean(l.response) || (Boolean(l.sent_at) && Date.now() - new Date(`${l.sent_at}T12:00:00`).getTime() >= 45 * 86_400_000)),
  );
}

export function createLetters(clientId: number, type: LetterType, itemIds: number[], bureaus: Bureau[]): number[] {
  if (type === "freeze_request") throw new Error("Use the Freezes tab for freeze requests.");
  const client = getClient(clientId);
  if (!client) throw new Error("Client not found");
  let items = getItems(clientId).filter((i) => itemIds.includes(i.id));
  if (type === "cfpb_complaint") {
    const history = getLetters(clientId);
    items = items.filter((i) => cfpbReady(i.id, history));
    if (!items.length) {
      throw new Error(
        "The CFPB only accepts credit reporting complaints after the bureau dispute was sent more than 45 days ago, or the bureau has answered. None of the selected items qualify yet.",
      );
    }
  }
  if (type === "identity_theft_affidavit") {
    items = items.filter((i) => i.identity_theft);
    if (!items.length) {
      throw new Error("None of the selected items are flagged as identity theft. Flag the item first — only do so if the client confirms it.");
    }
  }
  const plan = planLetters(type, items, bureaus.length ? bureaus : BUREAUS);
  if (!plan.length) throw new Error("No selected items match the chosen bureaus.");

  const history = getLetters(clientId).filter((l) => l.status !== "error");
  const ids: number[] = [];
  for (const p of plan) {
    const pIds = p.items.map((i) => i.id);
    const prior = history.filter((l) => l.recipient_name === p.recipient_name && l.item_ids.some((id) => pIds.includes(id)));
    const round = prior.reduce((m, l) => Math.max(m, l.round), 0) + 1;
    const res = run(
      "INSERT INTO letters (client_id, item_ids, type, round, recipient_name, recipient_address, status) VALUES (?, ?, ?, ?, ?, ?, 'generating')",
      clientId,
      JSON.stringify(pIds),
      type,
      round,
      p.recipient_name,
      p.recipient_address,
    );
    const id = Number(res.lastInsertRowid);
    ids.push(id);
    void draftInBackground(id, client, type, p, round, prior);
  }
  return ids;
}

async function draftInBackground(
  id: number,
  client: Client,
  type: Exclude<LetterType, "freeze_request">,
  p: Planned,
  round: number,
  prior: ReturnType<typeof getLetters>,
) {
  try {
    const d = await draftLetter({ type, client, items: p.items, recipient: p.recipient_name, round, history: prior });
    run(
      "UPDATE letters SET subject = ?, body = ?, enclosures = ?, status = 'draft' WHERE id = ?",
      d.subject,
      d.body,
      JSON.stringify(d.enclosures),
      id,
    );
    for (const i of p.items) {
      run("UPDATE items SET status = 'disputed', updated_at = datetime('now') WHERE id = ? AND status = 'identified'", i.id);
    }
  } catch (e) {
    console.error("letter draft failed", e);
    run("UPDATE letters SET status = 'error', error = ? WHERE id = ?", friendlyError(e), id);
  }
}

/** Freeze requests are a fixed form; no model call needed. */
/**
 * Mail-in freeze request to a secondary (specialty) agency. The federal freeze right in 15 U.S.C. §1681c-1(i)
 * binds only the three nationwide bureaus, so the request rests on state law and the agency's own freeze policy.
 * `reference` is the number an agency gives when it can't verify someone online and asks for a written request.
 */
export function createFreezeLetter(clientId: number, agencyKey: string, reference = ""): number {
  const agency = SECONDARY_AGENCIES.find((a) => a.key === agencyKey);
  if (!agency) throw new Error("Unknown agency");
  const [name, ...addr] = agency.address.split("\n");
  const ref = reference.trim().slice(0, 40);
  // "Clarity Services (Experian)" → "Clarity Services"; "DataX, incl. Teletrack (Equifax)" → "DataX".
  const companyName = agency.name.replace(/\s*\(.*\)$/, "").replace(/,\s*incl\..*$/, "");
  const body = `To Whom It May Concern:

I am writing to request that a security freeze be placed on my consumer file, as provided by applicable state law and your security freeze policy. Please place the freeze on all consumer reports and files that ${companyName} maintains about me.
${ref ? `\nI tried to place this freeze online and was asked to send a written request instead. My reference number from that request is ${ref}.\n` : ""}
My full legal name, current address, date of birth and the last four digits of my Social Security number appear above. I have enclosed copies of the documents listed below to verify my identity and current address.

Please send written confirmation that the freeze has been placed, along with the PIN or instructions I will need to lift or remove it in the future, to the address above. I understand there is no fee for placing a security freeze.

Thank you for your prompt attention to this request.`;
  const existing = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM letters WHERE client_id = ? AND type = 'freeze_request' AND recipient_name = ?",
    clientId,
    name,
  );
  const res = run(
    "INSERT INTO letters (client_id, type, round, recipient_name, recipient_address, subject, body, enclosures, status) VALUES (?, 'freeze_request', ?, ?, ?, ?, ?, ?, 'draft')",
    clientId,
    (existing?.n ?? 0) + 1,
    name,
    addr.join("\n"),
    "Request for Security Freeze",
    body,
    JSON.stringify([
      "Copy of my driver's license or other government-issued photo ID",
      "Copy of my Social Security card",
      "Proof of current address dated within the last 30 days (utility bill or bank statement)",
    ]),
  );
  return Number(res.lastInsertRowid);
}
