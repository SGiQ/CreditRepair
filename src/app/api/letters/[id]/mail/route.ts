import { PDFDocument } from "pdf-lib";
import { requireAdmin } from "@/lib/auth";
import { run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { letterFilename, renderPdf } from "@/lib/letterDoc";
import { activeProvider, clientAddress, mailConfig, MailError, parseRecipient } from "@/lib/mail";
import { paymentsConfig, dollars } from "@/lib/payments";
import { getClient, getLetter, markLetterSent } from "@/lib/store";
import { canMail } from "@/lib/types";

/**
 * Sends an approved letter by USPS Certified Mail through the mail service.
 * `{ preview: true }` runs every check and returns the page count without sending.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const letter = getLetter(await idOf(ctx));
  const client = letter && getClient(letter.client_id);
  if (!letter || !client) return bad("Letter not found", 404);
  const { preview = false, returnReceipt = false, waiveFee = false } = await req.json().catch(() => ({}));

  if (!canMail(letter.type)) return bad("This document can't be sent through the mail service.");
  if (letter.status !== "draft") return bad("This letter has already been sent.");
  if (!letter.signed_at || !client.signature) return bad("The client hasn't approved and signed this letter yet.");
  // When a mailing fee is set, the client pays before the letter goes out unless the specialist waives it.
  const { feeCents } = paymentsConfig();
  const feeDue = feeCents > 0 && letter.payment_status !== "paid" && !waiveFee;
  if (feeDue && !preview) return bad(`${client.name.split(" ")[0]} hasn't paid the ${dollars(feeCents)} mailing fee yet. Wait for payment, or choose "Send without charging".`);

  try {
    const { name, api } = activeProvider();
    const to = parseRecipient(letter.recipient_name, letter.recipient_address);
    const from = clientAddress(client);
    const pdf = await renderPdf(client, letter);
    const pages = (await PDFDocument.load(pdf)).getPageCount();
    const { mode } = mailConfig();
    if (preview) return ok({ pages, mode, to, feeCents, paid: letter.payment_status === "paid", paidCents: letter.paid_cents });

    const result = await api.send({
      letterId: letter.id,
      to,
      from,
      pdf,
      filename: letterFilename(client, letter, "pdf"),
      returnReceipt: Boolean(returnReceipt),
      idempotencyKey: `letter-${letter.id}-${mode}-${letter.signed_at.replace(/\D/g, "")}`,
    });
    run(
      "UPDATE letters SET mail_provider = ?, mail_id = ?, mail_tracking = ?, mail_expected = ?, mail_preview = ?, mail_test = ?, mail_status = ?, mail_checked_at = '', delivered_at = '' WHERE id = ?",
      name,
      result.id,
      result.tracking,
      result.expected,
      result.previewUrl,
      result.mailed ? 0 : 1,
      result.mailed || mode === "demo" ? "Sent to the print facility" : "Test send accepted",
      letter.id,
    );
    // A test key proves the request is valid but mails nothing, so the letter stays a draft.
    // Live sends (and the demo simulation) start the letter's clock.
    if (result.mailed || mode === "demo") markLetterSent(letter, new Date().toISOString().slice(0, 10));
    return ok({ mailed: result.mailed, mode });
  } catch (e) {
    if (e instanceof MailError) return bad(e.message);
    console.error("mail send failed", e);
    return bad("The mail service could not be reached. Nothing was sent; try again.", 502);
  }
}
