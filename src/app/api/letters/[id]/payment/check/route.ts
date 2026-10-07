import { requireClientAccess } from "@/lib/auth";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { PaymentError } from "@/lib/payments";
import { getLetter, settleLetterPayment } from "@/lib/store";

/** Re-checks a pending payment with PayPal and records it if it went through (e.g. paid by phone via the QR code). */
export async function POST(_: Request, ctx: Ctx) {
  const letter = getLetter(await idOf(ctx));
  if (!letter) return bad("Letter not found", 404);
  const auth = await requireClientAccess(letter.client_id);
  if (auth instanceof Response) return auth;
  if (!letter.payment_order_id) return bad("No payment has been started for this letter.");
  try {
    return ok({ status: await settleLetterPayment(letter) });
  } catch (e) {
    return bad(e instanceof PaymentError ? e.message : "Could not check the payment right now.", 502);
  }
}
