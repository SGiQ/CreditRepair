import { requireAdmin } from "@/lib/auth";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { MailError, refreshTracking } from "@/lib/mail";
import { getLetter } from "@/lib/store";

export async function POST(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const letter = getLetter(await idOf(ctx));
  if (!letter?.mail_id) return bad("This letter wasn't sent through the mail service.", 404);
  try {
    await refreshTracking(letter);
    return ok();
  } catch (e) {
    return bad(e instanceof MailError ? e.message : "Tracking could not be checked right now.", 502);
  }
}
