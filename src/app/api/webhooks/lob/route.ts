import { createHmac, timingSafeEqual } from "node:crypto";
import { get } from "@/lib/db";
import { refreshTracking } from "@/lib/mail";
import type { Letter } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOLERANCE_MS = 5 * 60_000;

/**
 * Lob calls this as a letter moves through the mail (letter.certified.* events), so delivery
 * shows up and emails go out within seconds instead of at the next 30-minute check.
 * Every request is verified against the webhook's secret before anything is read from it.
 */
export async function POST(req: Request) {
  const secret = process.env.LOB_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "LOB_WEBHOOK_SECRET is not set." }, { status: 503 });

  const raw = await req.text();
  const signature = req.headers.get("lob-signature") ?? "";
  const timestamp = req.headers.get("lob-signature-timestamp") ?? "";
  // Lob signs "<timestamp>.<raw body>" with HMAC-SHA256 (hex). Compare in constant time.
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const given = Buffer.from(signature, "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, Buffer.from(expected, "utf8"))) {
    return Response.json({ error: "Bad signature." }, { status: 401 });
  }
  if (Math.abs(Date.now() - Number(timestamp)) > TOLERANCE_MS) return Response.json({ error: "Stale timestamp." }, { status: 401 });

  let event: { event_type?: { id?: string }; reference_id?: string };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Not JSON." }, { status: 400 });
  }
  const type = event.event_type?.id ?? "";
  if (!type.startsWith("letter.") || !event.reference_id) return Response.json({ ok: true, ignored: true });

  // The payload only tells us which letter changed; the status itself is re-read from Lob so a
  // replayed or reordered event can never move a letter backwards.
  const letter = get<Pick<Letter, "id" | "mail_id" | "mail_provider">>(
    "SELECT id, mail_id, mail_provider FROM letters WHERE mail_id = ? AND status = 'sent'",
    event.reference_id,
  );
  if (!letter) return Response.json({ ok: true, ignored: true });
  try {
    await refreshTracking(letter);
  } catch (e) {
    console.error("webhook tracking refresh failed", e);
    // Tell Lob to retry later rather than drop the event.
    return Response.json({ error: "Could not refresh tracking." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
