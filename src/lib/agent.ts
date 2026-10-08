import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import fs from "node:fs";
import type { Client, Item, Letter, LetterType } from "./types";
import { LETTER_TYPES } from "./types";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const client = () => new Anthropic();

// Frozen across every call so the prefix caches.
export const EXPERT_SYSTEM = `You are a consumer law credit expert working alongside a credit repair specialist who manages files for multiple clients. Your job is to analyze credit reports, identify every negative, inaccurate, or unverified account, explain which consumer laws apply (FCRA / FDCPA and related), give the strongest dispute angle for each, and lay out the exact next steps to get it corrected or removed.

Statutes you work with most:
- FCRA §604 (15 U.S.C. §1681b) permissible purpose for inquiries
- FCRA §605 (§1681c) reporting time limits: 7 years from the date of first delinquency, 10 years for Chapter 7 bankruptcy; §605(c) re-aging
- FCRA §605B (§1681c-2) blocking of identity-theft information
- FCRA §607(b) (§1681e(b)) maximum possible accuracy
- FCRA §609 (§1681g) disclosure of the consumer's file
- FCRA §611 (§1681i) reinvestigation within 30 days (45 in limited cases); §611(a)(5) delete what cannot be verified; §611(a)(6)(B)(iii) and (a)(7) method of verification
- FCRA §623 (§1681s-2) furnisher duties: §623(a)(1)(A) no furnishing of information known or believed to be inaccurate, §623(a)(2) duty to correct and update, notice of dispute, direct disputes under §623(a)(8), and §623(b) investigation after a bureau forwards a dispute. Only §623(b) carries a private right of action (§1681s-2(c)), so a dispute filed through the bureau is what creates legal leverage against a furnisher; a direct letter citing §623(a) is persuasive but not enforceable by the consumer alone.
- FCRA §615 (§1681m) adverse-action notices: a consumer denied credit, insurance or employment because of a report is entitled to the notice, the source bureau's name, and a free copy of the report within 60 days
- FCRA §616 / §617 (§1681n / §1681o) civil liability for willful and negligent noncompliance
- Fair Credit Billing Act / TILA §1666b (open-end accounts such as credit cards): a payment received by 5 p.m. on the due date cannot be treated as late, and no late fee or late report is proper when the statement was not mailed at least 21 days before the due date; §1666 (billing-error disputes within 60 days of the statement). Only for credit cards and other open-end accounts, not installment loans.
- FDCPA §807 (15 U.S.C. §1692e) false or misleading representations, including §807(2)(A) misstating the legal status of a debt (e.g. collecting on a time-barred debt as if enforceable) and §807(8) failing to report a debt as disputed
- FDCPA §809 (§1692g) validation of debts
- State statutes of limitations and state consumer protection law where relevant; medical debt reporting rules

How you work:
- Ground every finding in what the report actually shows. Look for cross-bureau inconsistencies (balances, dates, statuses, account numbers, payment history), missing or contradictory dates of first delinquency, re-aging, duplicate tradelines (original creditor and collector both reporting a balance), balances on charged-off or sold accounts, collector accounts lacking original-creditor information, obsolete items past the §605 period, incomplete fields, unrecognized inquiries, and stale personal information.
- Never invent facts, account details, or events. Never assert that an account is fraudulent, not the client's, or the result of identity theft unless the specialist has explicitly flagged it that way. Demanding verification and accuracy is legitimate; fabricating a claim is not.
- Be straight about strength. If an item appears accurate, complete, and timely, say the dispute is weak, and lead with the realistic options: a verification demand, a goodwill request, a negotiated settlement or pay-for-delete, or the date it ages off under §605.
- Cite the specific section that applies and say why it applies to this account. Do not pile on citations that do not fit.
- You provide information and drafting support, not legal advice. Suggest a consumer protection attorney when a clear statutory violation with damages appears.`;

const ItemSchema = z.object({
  same_as_item_id: z
    .number()
    .nullable()
    .describe("If this account or record is already in the client's file (the list provided), that item's id; otherwise null"),
  creditor: z.string().describe("Name of the furnisher / collector / inquirer as shown on the report"),
  creditor_address: z.string().describe("Mailing address if shown on the report, lines separated by \\n; empty string if not shown"),
  original_creditor: z.string().describe("Original creditor for collections / sold debts; empty if not applicable"),
  account_number: z.string().describe("Account number exactly as masked on the report; empty if none"),
  category: z.enum([
    "collection",
    "charge_off",
    "late_payment",
    "repossession",
    "foreclosure",
    "bankruptcy",
    "public_record",
    "inquiry",
    "personal_info",
    "other",
  ]),
  bureaus: z.array(z.enum(["Equifax", "Experian", "TransUnion"])).describe("Bureaus reporting this item"),
  balance: z.string().describe("Reported balance / past-due amount, e.g. \"$1,240\"; empty if none"),
  date_opened: z.string(),
  date_of_first_delinquency: z.string().describe("As reported; empty if missing"),
  reported_status: z.string().describe("Status as reported, e.g. \"Collection account, $1,240 past due\""),
  issues: z.array(z.string()).describe("Specific inaccuracies, inconsistencies, or unverified elements found in the report"),
  laws: z.array(z.object({ citation: z.string(), why: z.string() })),
  dispute_angle: z.string().describe("The single strongest dispute angle, 2-4 sentences"),
  next_steps: z.array(z.string()).describe("Exact, ordered next steps to get the item corrected or removed"),
  strength: z.enum(["strong", "moderate", "weak"]).describe("Honest strength of the dispute"),
});

const AnalysisSchema = z.object({
  summary: z.string().describe("3-6 sentence overview of the file and the recommended order of attack"),
  report_date: z.string().describe("Date the report was generated, as YYYY-MM-DD; empty string if not shown"),
  scores: z
    .array(
      z.object({
        bureau: z.enum(["Equifax", "Experian", "TransUnion"]),
        score: z.number().describe("Credit score as printed, 300-850"),
        model: z.string().describe("Scoring model as labelled, e.g. \"FICO 8\" or \"VantageScore 3.0\"; empty if not stated"),
      }),
    )
    .describe(
      "Credit scores printed anywhere in the document (summary pages, headers, score sections), one per bureau, e.g. FICO or VantageScore. Do not estimate or infer a score. Empty if none is printed.",
    ),
  items: z.array(ItemSchema),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function checkStop(msg: Anthropic.Message) {
  if (msg.stop_reason === "refusal") {
    throw new Error("The model declined this request. Review the document and try again.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new Error("The response was cut off before it finished. Try a shorter report or fewer items at once.");
  }
}

export function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Invalid Anthropic API key. Check ANTHROPIC_API_KEY in .env.local.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Wait a minute and retry.";
  if (e instanceof Anthropic.BadRequestError) return `The API rejected the request: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API. Check your connection.";
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status ?? ""}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

const SYSTEM: Anthropic.TextBlockParam[] = [
  { type: "text", text: EXPERT_SYSTEM, cache_control: { type: "ephemeral" } },
];

/** What the agent sees of the client's file, so a re-uploaded or combined report updates items instead of duplicating them. */
export interface KnownItem {
  id: number;
  creditor: string;
  original_creditor: string;
  account_number: string;
  category: string;
  bureaus: string[];
  balance: string;
  date_opened: string;
  reported_status: string;
}

export async function analyzeReport(filePath: string, filename: string, known: KnownItem[] = []): Promise<Analysis> {
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const doc: Anthropic.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: fs.readFileSync(filePath).toString("base64") },
      }
    : { type: "document", source: { type: "text", media_type: "text/plain", data: fs.readFileSync(filePath, "utf8") } };

  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 64000,
    output_config: { effort: "high", format: zodOutputFormat(AnalysisSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          doc,
          {
            type: "text",
            text: `Analyze this credit report and identify every negative, inaccurate, or unverified account. Include derogatory tradelines (collections, charge-offs, late payments, repossessions, foreclosures), public records, hard inquiries worth challenging, and personal-information errors (name variations, old addresses, employers) as their own items. Report one item per account, listing every bureau that reports it, and note where the bureaus disagree. Also capture the report date and any credit scores printed on it.

For each item, tell me which consumer laws apply (FCRA/FDCPA), the strongest dispute angle, and the exact next steps to remove it. Do not list accounts that are positive and accurate.
${
  known.length
    ? `
The client's file already contains the items below, from earlier reports. Bureaus print the same account differently: names may be abbreviated or truncated (e.g. "WFBNA AUTO" and "WELLS FARGO AUTO"), and account numbers masked differently (one bureau shows the last digits, another the first). When an account or record in this report is the same one as an existing item, set same_as_item_id to that item's id; otherwise null. Only match when you are confident it is the same account, not merely the same lender: one lender can have several separate accounts.

<existing_items>
${JSON.stringify(known)}
</existing_items>`
    : "Set same_as_item_id to null for every item."
}`,
          },
        ],
      },
    ],
  });
  const msg = await stream.finalMessage();
  checkStop(msg);
  return AnalysisSchema.parse(msg.parsed_output ?? JSON.parse(textOf(msg)));
}

const LetterSchema = z.object({
  subject: z.string().describe("Subject line without the \"Re:\" prefix"),
  body: z.string(),
  enclosures: z.array(z.string()).describe("Documents the client should enclose, e.g. copy of government ID"),
});
export type DraftedLetter = z.infer<typeof LetterSchema>;

const LETTER_BRIEF: Record<Exclude<LetterType, "freeze_request">, string> = {
  bureau_dispute:
    "A first-round dispute to the credit bureau under FCRA §611. List each disputed account (creditor, masked account number), state precisely what is inaccurate, incomplete, or unverified about it, and request reinvestigation and deletion or correction, with an updated report sent on completion.",
  debt_validation:
    "A debt validation demand to the collection agency under FDCPA §809 (15 U.S.C. §1692g). Request the amount and an itemization, the name and address of the original creditor, documentation establishing the debt and the collector's authority to collect it, and note that the debt must be reported as disputed (§807(8)). Do not acknowledge the debt as valid or promise payment.",
  furnisher_dispute:
    "A direct dispute to the furnisher under FCRA §623(a)(8) and 12 C.F.R. §1022.43. Identify the account, explain specifically what is being reported inaccurately, request an investigation and correction or deletion with all bureaus, and remind them of their duty to report accurately.",
  inquiry_removal:
    "A challenge to hard inquiries the client does not recognize under FCRA §604. Ask the bureau to verify the permissible purpose for each listed inquiry and remove any it cannot substantiate. Do not allege fraud.",
  personal_info:
    "A request to correct the personal information section: remove outdated or incorrect names, addresses, and employers so that only the client's current information remains.",
  method_of_verification:
    "A follow-up after the bureau reported the item(s) as verified. Under FCRA §611(a)(6)(B)(iii) and §611(a)(7), demand a description of the procedure used to verify, including the name, address, and telephone number of each furnisher contacted, to be provided within 15 days. Restate what remains inaccurate and request deletion if the verification cannot be substantiated.",
  no_response:
    "A follow-up when the bureau has not responded within the 30-day period in FCRA §611(a)(1)(A). Reference the date the original dispute was sent, state that the deadline has passed, and demand deletion of the unverified items under §611(a)(5)(A).",
  final_notice:
    "A firm, professional final notice. Summarize the dispute history with dates, identify the specific statutory duties that remain unmet, give 15 days to cure, and state that the client will file complaints with the CFPB and state attorney general and consult counsel regarding remedies under FCRA §616 and §617. No threats beyond lawful remedies.",
  cfpb_complaint:
    "A complaint narrative to paste into the CFPB portal (consumerfinance.gov/complaint) against the named company. Write in the first person as the consumer: what happened in date order, what the company did or failed to do, which statutory duties are implicated, and the resolution requested. This is not a letter — no salutation or closing. Do not include the full account number or SSN.",
  identity_theft_affidavit:
    "A sworn identity theft affidavit combined with a request to block the listed accounts under FCRA §605B. Write numbered first-person statements: the affiant's identity, that the listed accounts were opened or used without their knowledge or authorization, that they received no benefit, and that an FTC Identity Theft Report (IdentityTheft.gov) is enclosed. End with a declaration under penalty of perjury. Leave bracketed placeholders for facts you do not have (e.g. [FTC report number], [date discovered]).",
};

export async function draftLetter(args: {
  type: Exclude<LetterType, "freeze_request">;
  client: Client;
  items: Item[];
  recipient: string;
  round: number;
  history: Letter[];
}): Promise<DraftedLetter> {
  const { type, items, recipient, round, history } = args;
  const c = args.client;
  const context = {
    today: new Date().toISOString().slice(0, 10),
    letter_type: LETTER_TYPES[type].label,
    recipient,
    round,
    consumer: {
      name: c.name,
      address: [c.address1, c.address2, `${c.city}, ${c.state} ${c.zip}`].filter(Boolean).join(", "),
      date_of_birth: c.dob,
      ssn_last4: c.ssn_last4,
    },
    items: items.map((i) => ({
      creditor: i.creditor,
      original_creditor: i.original_creditor,
      account_number: i.account_number,
      category: i.category,
      bureaus: i.bureaus,
      balance: i.balance,
      date_opened: i.date_opened,
      date_of_first_delinquency: i.date_of_first_delinquency,
      reported_status: i.reported_status,
      issues: i.issues,
      laws: i.laws,
      dispute_angle: i.dispute_angle,
      flagged_identity_theft_by_client: i.identity_theft,
      specialist_notes: i.notes,
    })),
    prior_correspondence: history.map((l) => ({
      type: LETTER_TYPES[l.type]?.label ?? l.type,
      recipient: l.recipient_name,
      round: l.round,
      sent_on: l.sent_at || "not yet sent",
      outcome: l.response || "none recorded",
    })),
  };

  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(LetterSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Draft this document for the client to sign and mail.

What it is: ${LETTER_BRIEF[type]}

Write it in the consumer's own first-person voice: clear, firm, specific to these accounts, and factual. Use only the facts in the file below; where a needed fact is missing, leave a bracketed placeholder such as [date] rather than guessing. If prior correspondence exists, reference it by date. Each letter should read as individually written, not as a form.

Formatting: the body only, in plain text with blank lines between paragraphs and no markdown. For letters, start at the salutation and end with the last paragraph — the app adds the sender block, date, recipient block, subject line, signature, and enclosure list. List disputed accounts as simple lines beginning with "- ".

<file>
${JSON.stringify(context, null, 2)}
</file>`,
      },
    ],
  });
  const msg = await stream.finalMessage();
  checkStop(msg);
  return LetterSchema.parse(msg.parsed_output ?? JSON.parse(textOf(msg)));
}

export function chatStream(args: {
  client: Client;
  items: Item[];
  letters: Letter[];
  messages: { role: "user" | "assistant"; content: string }[];
}) {
  const file = {
    today: new Date().toISOString().slice(0, 10),
    client: { name: args.client.name, state: args.client.state },
    items: args.items.map((i) => ({
      creditor: i.creditor,
      account_number: i.account_number,
      category: i.category,
      bureaus: i.bureaus,
      balance: i.balance,
      date_of_first_delinquency: i.date_of_first_delinquency,
      reported_status: i.reported_status,
      issues: i.issues,
      dispute_angle: i.dispute_angle,
      strength: i.strength,
      tracking_status: i.status,
      notes: i.notes,
    })),
    letters: args.letters.map((l) => ({
      type: LETTER_TYPES[l.type]?.label ?? l.type,
      recipient: l.recipient_name,
      round: l.round,
      sent_on: l.sent_at,
      outcome: l.response,
    })),
  };
  return client().messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    system: [
      ...SYSTEM,
      {
        type: "text",
        text: `You are advising the specialist on one client's file. Answer their questions directly and concisely, in plain prose.\n\n<client_file>\n${JSON.stringify(file, null, 2)}\n</client_file>`,
      },
    ],
    messages: args.messages,
  });
}

const DuplicateSchema = z.object({
  groups: z.array(
    z.object({
      item_ids: z.array(z.number()).describe("Ids of items that are the same account or record, at least two"),
      reason: z.string().describe("One sentence on why these are the same, citing names, account numbers or dates"),
    }),
  ),
});

/** Groups items in one client's file that are the same account reported more than once. */
export async function findDuplicateGroups(items: KnownItem[]): Promise<{ item_ids: number[]; reason: string }[]> {
  if (items.length < 2) return [];
  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(DuplicateSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `These items in one client's file came from several credit reports, so the same account may appear more than once. Bureaus print names differently (abbreviated or truncated, e.g. "WFBNA AUTO" vs "WELLS FARGO AUTO") and mask account numbers differently (last digits on one report, first digits on another). Group the items that are the same account or record. Only group items you are confident are the same account, not merely the same lender: one lender can have several separate accounts, and two numbers whose visible digits differ are different accounts. Leave out items with no duplicate.

<items>
${JSON.stringify(items)}
</items>`,
      },
    ],
  });
  const msg = await stream.finalMessage();
  checkStop(msg);
  return DuplicateSchema.parse(msg.parsed_output ?? JSON.parse(textOf(msg))).groups;
}
