import { bad, ok } from "@/lib/http";
import { demoApprove, paymentsConfig } from "@/lib/payments";

/** Demo-mode stand-in for PayPal's approval page: marks the order approved and hands back the return link. */
export async function POST(_: Request, ctx: { params: Promise<{ order: string }> }) {
  if (paymentsConfig().mode !== "demo") return bad("Not in demo mode.", 404);
  const { order } = await ctx.params;
  const returnUrl = demoApprove(order);
  if (!returnUrl) return bad("Unknown demo order (the app may have restarted). Start the payment again.", 404);
  return ok({ returnUrl: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}order=${encodeURIComponent(order)}` });
}
