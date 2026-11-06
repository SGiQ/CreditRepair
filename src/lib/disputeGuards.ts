import type { Letter, LetterType } from "./types";

const disputes = new Set(["bureau_dispute", "inquiry_removal", "personal_info"]);

/** Conservative workflow gate, not a calculation of the statutory deadline. */
export function followUpError(type: LetterType, itemIds: number[], recipient: string, history: Letter[], now = Date.now()): string | null {
  if (type !== "no_response" && type !== "method_of_verification") return null;
  for (const id of itemIds) {
    const prior = history
      .filter(l => disputes.has(l.type) && l.status === "sent" && !l.mail_test && l.recipient_name === recipient && l.item_ids.includes(id))
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at) || b.id - a.id)[0];
    if (!prior) return "Record a real, sent bureau dispute for every selected item and recipient first.";
    if (type === "method_of_verification") {
      if (prior.response !== "verified") return "Record the bureau's verified response before requesting its verification procedure.";
    } else {
      if (prior.response && prior.response !== "no_response") return "A bureau response is already recorded. Review that response instead of drafting a no-response letter.";
      const received = Date.parse(prior.delivered_at);
      if (!Number.isFinite(received)) return "Confirm the original dispute's delivery date before drafting a no-response follow-up.";
      // 45 days plus a 15-day notification/mail buffer. Deliberately conservative.
      if (now - received < 60 * 86_400_000) return "This app waits 60 days after confirmed receipt before drafting a no-response status follow-up. This is a conservative workflow buffer, not the legal deadline.";
    }
  }
  return null;
}
