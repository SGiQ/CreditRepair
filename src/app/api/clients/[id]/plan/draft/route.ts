import { hasApiKey } from "@/lib/agent";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, idOf, NO_KEY, type Ctx } from "@/lib/http";
import { draftRound } from "@/lib/plan";

/** { round } drafts every letter the plan schedules for that round. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  if (!hasApiKey()) return bad(NO_KEY);
  const { round } = await req.json();
  try {
    return ok(draftRound(await idOf(ctx), Number(round)));
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e));
  }
}
