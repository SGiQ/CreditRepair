import { requireClientAccess } from "@/lib/auth";
import { run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { getClient, getLetter } from "@/lib/store";
import { canMail } from "@/lib/types";

/** The client approves this letter's current text and applies their saved signature to it. */
export async function POST(_: Request, ctx: Ctx) {
  const letter = getLetter(await idOf(ctx));
  if (!letter) return bad("Letter not found", 404);
  const auth = await requireClientAccess(letter.client_id);
  if (auth instanceof Response) return auth;
  if (auth.role !== "client") return bad("Only the client can approve and sign their letters.", 403);
  if (letter.status !== "draft" || !canMail(letter.type)) return bad("This letter can't be signed here.");
  if (!getClient(letter.client_id)?.signature) return bad("Add your signature first.");
  run("UPDATE letters SET signed_at = datetime('now') WHERE id = ?", letter.id);
  return ok();
}
