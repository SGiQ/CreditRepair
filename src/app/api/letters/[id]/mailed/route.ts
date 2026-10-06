import { requireClientAccess } from "@/lib/auth";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { getLetter, markLetterSent } from "@/lib/store";

/** Lets a client (or the specialist) confirm a finished letter was mailed, or a CFPB complaint was filed online. One-way: only a specialist can undo it. */
export async function POST(req: Request, ctx: Ctx) {
  const letter = getLetter(await idOf(ctx));
  if (!letter) return bad("Letter not found", 404);
  const auth = await requireClientAccess(letter.client_id);
  if (auth instanceof Response) return auth;
  if (letter.status !== "draft") return bad("This has already been marked as sent.");

  const today = new Date().toISOString().slice(0, 10);
  const { date = today } = await req.json().catch(() => ({}));
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return bad("Enter a valid date.");
  // Allow a day of slack for time zones ahead of the server.
  if (Date.parse(date) > Date.now() + 86_400_000) return bad("The mailing date can't be in the future.");
  markLetterSent(letter, date);
  return ok();
}
