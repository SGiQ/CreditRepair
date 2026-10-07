import { requireClientAccess } from "@/lib/auth";
import { run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { getLetter } from "@/lib/store";
import { canMail } from "@/lib/types";

/** The client's choice: mail it themselves ("self") or have it sent from the app ("service"). */
export async function POST(req: Request, ctx: Ctx) {
  const letter = getLetter(await idOf(ctx));
  if (!letter) return bad("Letter not found", 404);
  const auth = await requireClientAccess(letter.client_id);
  if (auth instanceof Response) return auth;
  const { choice } = await req.json();
  if (choice !== "self" && choice !== "service") return bad("Pick an option.");
  if (letter.status !== "draft" || !canMail(letter.type)) return bad("This letter can't be changed now.");
  if (letter.payment_status === "paid" && choice === "self") return bad("This letter's mailing fee is already paid; your specialist will mail it.");
  run("UPDATE letters SET delivery_choice = ? WHERE id = ?", choice, letter.id);
  return ok();
}
