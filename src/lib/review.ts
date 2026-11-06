import type { Item } from "./types";

export const PAYMENT_LABELS = {
  unconfirmed: "Unconfirmed — check records",
  unpaid: "Confirmed unpaid",
  paid: "Confirmed paid",
  settled: "Confirmed settled",
} as const;
export const REVIEW_LABELS = { gather: "Gather evidence", ready: "Reviewed — ready to draft", hold: "On hold" } as const;
export function reviewStage(item: Pick<Item, "review_stage" | "creditor" | "category">): keyof typeof REVIEW_LABELS {
  if (item.review_stage && item.review_stage !== "unreviewed") return item.review_stage;
  return /planet home|mortgage/i.test(item.creditor + " " + item.category) ? "hold" : "gather";
}
export function reviewError(items: Item[]): string | null {
  const blocked = items.find(i => reviewStage(i) !== "ready" || !i.evidence_notes?.trim());
  return blocked ? `${blocked.creditor}: record the evidence reviewed and mark this account ready before drafting or sending. Held accounts remain excluded.` : null;
}
export function evidenceChecklist(item: Pick<Item, "creditor">): string {
  if (/self/i.test(item.creditor)) return "Collect May–July 2026 statements, the $775 payment confirmation, and deposit application details. Compare June payment status across bureaus.";
  if (/affirm/i.test(item.creditor)) return "Collect the current loan balance, due dates, payment ledger, and payoff or settlement receipts. Review each loan separately; paid does not mean late history is incorrect.";
  if (/progressive|credit collection/i.test(item.creditor)) return "Collect the final insurance bill, cancellation confirmation, collection notice, and any payment receipt.";
  if (/wells fargo/i.test(item.creditor)) return "Collect itemized balance history, payment receipts, and any settlement or vehicle-sale/deficiency accounting.";
  return "Collect current statements, payment confirmations, agreements, and the report pages showing the specific issue.";
}
