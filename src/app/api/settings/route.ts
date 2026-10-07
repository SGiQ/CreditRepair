import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/db";
import { bad, ok } from "@/lib/http";
import { FEE_KEY, paymentsConfig } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  return ok({ payments: paymentsConfig() });
}

/** { feeDollars: "10.00" } sets the per-letter mailing fee clients pay; 0 turns the payment step off. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const { feeDollars } = await req.json();
  const cents = Math.round(Number(feeDollars) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > 100_000) return bad("Enter a fee between $0 and $1,000.");
  setSetting(FEE_KEY, String(cents));
  return ok({ payments: paymentsConfig() });
}
