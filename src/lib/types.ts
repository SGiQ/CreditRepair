export type Bureau = "Equifax" | "Experian" | "TransUnion";
export const BUREAUS: Bureau[] = ["Equifax", "Experian", "TransUnion"];

export const ITEM_STATUSES = [
  "identified",
  "disputed",
  "awaiting_response",
  "verified",
  "updated",
  "deleted",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const STATUS_LABEL: Record<ItemStatus, string> = {
  identified: "Identified",
  disputed: "Dispute drafted",
  awaiting_response: "Awaiting response",
  verified: "Verified (stays)",
  updated: "Corrected",
  deleted: "Deleted",
};

export const CATEGORY_LABEL: Record<string, string> = {
  collection: "Collection",
  charge_off: "Charge-off",
  late_payment: "Late payment",
  repossession: "Repossession",
  foreclosure: "Foreclosure",
  bankruptcy: "Bankruptcy",
  public_record: "Public record",
  inquiry: "Hard inquiry",
  personal_info: "Personal info",
  other: "Other",
};

export interface Client {
  id: number;
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  dob: string;
  ssn_last4: string;
  phone: string;
  email: string;
  created_at: string;
  /** PNG data URL of the client's drawn signature. Server-side only; never sent in a bundle. */
  signature?: string;
  signature_at?: string;
}

export interface Report {
  id: number;
  client_id: number;
  filename: string;
  status: "analyzing" | "done" | "error";
  error: string;
  summary: string;
  uploaded_at: string;
}

export interface Law {
  citation: string;
  why: string;
}

export interface Item {
  id: number;
  client_id: number;
  report_id: number | null;
  creditor: string;
  creditor_address: string;
  original_creditor: string;
  account_number: string;
  category: string;
  bureaus: Bureau[];
  balance: string;
  date_opened: string;
  date_of_first_delinquency: string;
  reported_status: string;
  issues: string[];
  laws: Law[];
  dispute_angle: string;
  next_steps: string[];
  strength: "strong" | "moderate" | "weak";
  status: ItemStatus;
  identity_theft: boolean;
  notes: string;
}

export const LETTER_TYPES = {
  bureau_dispute: {
    label: "Bureau dispute (Round 1)",
    to: "bureau",
    stage: "Dispute",
    desc: "FCRA §611 reinvestigation request sent to each credit bureau.",
  },
  debt_validation: {
    label: "Debt validation",
    to: "furnisher",
    stage: "Dispute",
    desc: "FDCPA §809 (15 U.S.C. §1692g) validation demand to a collection agency.",
  },
  furnisher_dispute: {
    label: "Direct furnisher dispute",
    to: "furnisher",
    stage: "Dispute",
    desc: "FCRA §623 direct dispute to the creditor reporting the account.",
  },
  inquiry_removal: {
    label: "Inquiry challenge",
    to: "bureau",
    stage: "Dispute",
    desc: "FCRA §604 permissible-purpose challenge for unrecognized hard inquiries.",
  },
  personal_info: {
    label: "Personal info correction",
    to: "bureau",
    stage: "Dispute",
    desc: "Remove outdated names, addresses, and employers from the file.",
  },
  method_of_verification: {
    label: "Method of verification (follow-up)",
    to: "bureau",
    stage: "Follow-up",
    desc: "FCRA §611(a)(6)(B)(iii) & (a)(7) demand after an item comes back 'verified'.",
  },
  no_response: {
    label: "No response in 30 days (follow-up)",
    to: "bureau",
    stage: "Follow-up",
    desc: "FCRA §611(a)(1)(A) deletion demand when the bureau misses its deadline.",
  },
  final_notice: {
    label: "Final notice before legal action",
    to: "either",
    stage: "Escalation",
    desc: "Notice of intent to pursue FCRA §616/§617 remedies and regulator complaints.",
  },
  cfpb_complaint: {
    label: "CFPB complaint narrative",
    to: "cfpb",
    stage: "Escalation",
    desc: "Ready-to-paste complaint narrative for consumerfinance.gov/complaint.",
  },
  identity_theft_affidavit: {
    label: "Identity theft affidavit + §605B block",
    to: "bureau",
    stage: "Affidavit",
    desc: "Sworn statement and block request. Only for items flagged as identity theft.",
  },
  freeze_request: {
    label: "Security freeze request",
    to: "agency",
    stage: "Freeze",
    desc: "Security freeze request to a secondary consumer reporting agency.",
  },
} as const;
export type LetterType = keyof typeof LETTER_TYPES;

export interface Letter {
  id: number;
  client_id: number;
  item_ids: number[];
  type: LetterType;
  round: number;
  recipient_name: string;
  recipient_address: string;
  subject: string;
  body: string;
  enclosures: string[];
  status: "generating" | "draft" | "sent" | "error";
  error: string;
  sent_at: string;
  response: "" | "deleted" | "updated" | "verified" | "no_response";
  created_at: string;
  /** When the client approved this exact text and applied their signature. Cleared if the letter is edited. */
  signed_at: string;
  /** Delivery date reported by the mail carrier; the 30-day clock runs from here when known. */
  delivered_at: string;
  mail_provider: string;
  mail_id: string;
  mail_tracking: string;
  mail_status: string;
  mail_expected: string;
  mail_preview: string;
  /** True when the send was a test or simulation and nothing was physically mailed. */
  mail_test: boolean;
  /** How the client chose to get this letter mailed: "self" (they print and mail it) or "service" (sent from the app). */
  delivery_choice: "" | "self" | "service";
  /** Mailing-fee payment for a "service" letter. */
  payment_status: "" | "pending" | "paid";
  payment_order_id: string;
  paid_cents: number;
  paid_at: string;
}

/** Mailed disputes start a 30-day reply clock; freeze requests and CFPB filings are tracked without one. */
export const hasReplyClock = (type: LetterType) => type !== "freeze_request" && type !== "cfpb_complaint";

export const CFPB_URL = "https://www.consumerfinance.gov/complaint/";

/** Letter types that can go out through the mail service (affidavits need a notary; CFPB is filed online). */
export const canMail = (type: LetterType) => type !== "cfpb_complaint" && type !== "identity_theft_affidavit";

export interface EmailConfig {
  enabled: boolean;
  /** "demo" records the email in the app's log without sending it. */
  mode: "resend" | "smtp" | "demo" | "off";
  from: string;
}

export interface Notification {
  id: number;
  letter_id: number | null;
  kind: string;
  recipient: string;
  subject: string;
  status: "sent" | "logged" | "failed";
  error: string;
  created_at: string;
}

export interface PaymentsConfig {
  enabled: boolean;
  /** "sandbox" and "demo" never move real money. */
  mode: "live" | "sandbox" | "demo" | "off";
  /** Per-letter mailing fee in cents; 0 means mailing is free to the client. */
  feeCents: number;
}

export interface MailConfig {
  enabled: boolean;
  /** "live" really mails and bills; "test" and "demo" never mail anything. */
  mode: "live" | "test" | "demo" | "off";
}

export interface Score {
  id: number;
  /** Set when the score was read from an uploaded report. */
  report_id: number | null;
  bureau: Bureau;
  score: number;
  /** Scoring model as labelled on the report, e.g. "FICO 8" or "VantageScore 3.0". */
  model: string;
  as_of: string;
  source: "report" | "manual";
}

export interface Freeze {
  agency: string;
  status: "todo" | "requested" | "frozen";
}

export interface SessionUser {
  id: number;
  email: string;
  role: "admin" | "client";
  client_id: number | null;
}

/** Portal login state for a client, as shown to the specialist. */
export interface PortalAccess {
  status: "none" | "invited" | "active";
  email: string;
}

export interface ClientBundle {
  client: Client;
  access?: PortalAccess;
  /** `image` is only included for the client's own login. */
  signature: { onFile: boolean; at: string; image?: string };
  mail: MailConfig;
  email: EmailConfig;
  payments: PaymentsConfig;
  reports: Report[];
  items: Item[];
  letters: Letter[];
  scores: Score[];
  freezes: Freeze[];
  /** Specialist only: recent emails sent about this client. */
  notifications?: Notification[];
  hasApiKey: boolean;
}
