import QRCode from "qrcode";
import { appUrl, requireClientAccess } from "@/lib/auth";
import { run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { dollars, PaymentError, paymentsConfig, provider } from "@/lib/payments";
import { getLetter } from "@/lib/store";
import { canMail, LETTER_TYPES } from "@/lib/types";

/** Starts a PayPal payment for the mailing fee and returns the approval link plus a QR code for it. */
export async function POST(req: Request, ctx: Ctx) {
  const letter = getLetter(await idOf(ctx));
  if (!letter) return bad("Letter not found", 404);
  const auth = await requireClientAccess(letter.client_id);
  if (auth instanceof Response) return auth;
  if (auth.role !== "client") return bad("Only the client can pay the mailing fee.", 403);
  if (letter.status !== "draft" || !canMail(letter.type)) return bad("This letter can't be paid for now.");
  if (!letter.signed_at) return bad("Approve and sign the letter first.");
  if (letter.payment_status === "paid") return bad("Already paid.");
  const { feeCents } = paymentsConfig();
  if (!feeCents) return bad("There is no mailing fee for this letter.");

  try {
    const origin = appUrl(req);
    const order = await provider().create({
      cents: feeCents,
      description: `Certified mailing: ${LETTER_TYPES[letter.type]?.label ?? "letter"} to ${letter.recipient_name}`,
      reference: `letter-${letter.id}`,
      returnUrl: `${origin}/api/payments/return?letter=${letter.id}`,
      cancelUrl: `${origin}/portal?cancelled=${letter.id}`,
    });
    run("UPDATE letters SET delivery_choice = 'service', payment_status = 'pending', payment_order_id = ? WHERE id = ?", order.id, letter.id);
    return ok({ approveUrl: order.approveUrl, qr: await QRCode.toDataURL(order.approveUrl, { margin: 1, width: 220 }), amount: dollars(feeCents) });
  } catch (e) {
    return bad(e instanceof PaymentError ? e.message : "Could not start the payment. Try again.", 502);
  }
}
