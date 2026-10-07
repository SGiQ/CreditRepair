import { requireAdmin } from "@/lib/auth";
import { run, updateRow } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { getLetter, markLetterSent } from "@/lib/store";

const FIELDS = ["recipient_name", "recipient_address", "subject", "body", "enclosures", "status", "sent_at", "response"];

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const id = await idOf(ctx);
  const letter = getLetter(id);
  if (!letter) return bad("Letter not found", 404);
  const b = await req.json();
  if (b.status && !["draft", "sent"].includes(b.status)) return bad("Invalid status");
  if (b.status === "sent" && !b.sent_at) b.sent_at = new Date().toISOString().slice(0, 10);
  const mailedForReal = Boolean(letter.mail_id) && !letter.mail_test && letter.status === "sent";
  if (b.status === "draft") {
    if (mailedForReal) return bad("This letter went out through the mail service and can't be un-sent.");
    Object.assign(b, { sent_at: "", response: "" });
    run("UPDATE letters SET delivered_at = '', mail_id = '', mail_tracking = '', mail_status = '', mail_expected = '', mail_preview = '', mail_test = 0 WHERE id = ?", id);
  }
  if ("body" in b && !String(b.body ?? "").trim() && letter.body.trim()) {
    return bad("The letter body can't be empty. Reload the page if the text isn't showing.");
  }
  // The client's approval covers the exact text they saw; any change needs a fresh approval.
  const edited = (["recipient_name", "recipient_address", "subject", "body"] as const).some((k) => k in b && b[k] !== letter[k]);
  if (edited) {
    if (mailedForReal) return bad("This letter has already been mailed and can't be edited.");
    run("UPDATE letters SET signed_at = '' WHERE id = ?", id);
  }
  updateRow("letters", id, b, FIELDS);
  if (b.status === "sent") markLetterSent(letter, b.sent_at);
  return ok();
}

export async function DELETE(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  run("DELETE FROM letters WHERE id = ?", await idOf(ctx));
  return ok();
}
