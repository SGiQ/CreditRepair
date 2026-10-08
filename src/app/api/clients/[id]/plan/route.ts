import { hasApiKey } from "@/lib/agent";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, idOf, NO_KEY, type Ctx } from "@/lib/http";
import { getPlan, startPlan } from "@/lib/plan";
import { getClient, getItems } from "@/lib/store";

/** { goal } builds (or rebuilds) the client's dispute plan in the background. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const clientId = await idOf(ctx);
  if (!getClient(clientId)) return bad("Client not found", 404);
  if (!hasApiKey()) return bad(NO_KEY);
  if (!getItems(clientId).length) return bad("Upload and analyze a credit report first: the plan is built from its items.");
  if (getPlan(clientId)?.status === "generating") return bad("A plan is already being built.");
  const { goal = "" } = await req.json().catch(() => ({}));
  startPlan(clientId, String(goal).trim().slice(0, 500));
  return ok();
}
