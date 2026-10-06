import { requireAdmin } from "@/lib/auth";
import { hasApiKey } from "@/lib/agent";
import { bad, ok, idOf, NO_KEY, type Ctx } from "@/lib/http";
import { createLetters } from "@/lib/jobs";
import { BUREAUS, LETTER_TYPES, type Bureau, type LetterType } from "@/lib/types";

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const clientId = await idOf(ctx);
  const b = await req.json();
  if (!(b.type in LETTER_TYPES)) return bad("Unknown letter type");
  if (!Array.isArray(b.itemIds) || !b.itemIds.length) return bad("Select at least one item.");
  if (!hasApiKey()) return bad(NO_KEY);
  const bureaus = (Array.isArray(b.bureaus) ? b.bureaus : []).filter((x: Bureau) => BUREAUS.includes(x));
  try {
    return ok({ ids: createLetters(clientId, b.type as LetterType, b.itemIds.map(Number), bureaus) });
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e));
  }
}
