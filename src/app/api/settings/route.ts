import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/db";
import { bad, ok } from "@/lib/http";
import { FEE_KEY, paymentsConfig } from "@/lib/payments";
import { REMINDER_DAYS_KEY, REMINDERS_KEY, reminderSettings } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  return ok({ payments: paymentsConfig(), reminders: reminderSettings() });
}

/** { feeDollars: "10.00" } sets the per-letter mailing fee clients pay; 0 turns the payment step off. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const b = await req.json();
  if ("feeDollars" in b) {
    const cents = Math.round(Number(b.feeDollars) * 100);
    if (!Number.isFinite(cents) || cents < 0 || cents > 100_000) return bad("Enter a fee between $0 and $1,000.");
    setSetting(FEE_KEY, String(cents));
  }
  if ("remindersEnabled" in b) setSetting(REMINDERS_KEY, b.remindersEnabled ? "on" : "off");
  if ("reminderDays" in b) {
    const days = Math.round(Number(b.reminderDays));
    if (!Number.isFinite(days) || days < 7 || days > 90) return bad("Choose an interval between 7 and 90 days.");
    setSetting(REMINDER_DAYS_KEY, String(days));
  }
  return ok({ payments: paymentsConfig(), reminders: reminderSettings() });
}
