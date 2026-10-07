import { getLetter, settleLetterPayment } from "@/lib/store";

/** PayPal sends the payer back here after approval; capture, then land them on their portal. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const letter = getLetter(Number(url.searchParams.get("letter")));
  const orderId = url.searchParams.get("token") ?? url.searchParams.get("order") ?? "";
  let result = "error";
  if (letter && letter.payment_order_id && letter.payment_order_id === orderId) {
    result = await settleLetterPayment(letter).catch(() => "error");
  }
  return Response.redirect(`${url.origin}/portal?payment=${result}&letter=${letter?.id ?? ""}`, 303);
}
