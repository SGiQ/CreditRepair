import { findDuplicateGroups, friendlyError, hasApiKey } from "@/lib/agent";
import { requireAdmin } from "@/lib/auth";
import { sameAccount } from "@/lib/dedupe";
import { bad, ok, idOf, NO_KEY, type Ctx } from "@/lib/http";
import { knownItems, mergeItems } from "@/lib/merge";
import { getItems } from "@/lib/store";

/** Proposes groups of items that look like the same account (agent + rule-based), for the specialist to review. */
export async function GET(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const clientId = await idOf(ctx);
  const items = getItems(clientId);
  const ids = new Set(items.map((i) => i.id));

  // Union-find so overlapping suggestions from both checks end up in one group.
  const parent = new Map<number, number>();
  const find = (x: number): number => (parent.get(x) ?? x) === x ? x : find(parent.get(x)!);
  const union = (a: number, b: number) => parent.set(find(a), find(b));
  const reasons = new Map<number, string>();

  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (sameAccount(items[a], items[b])) {
        union(items[a].id, items[b].id);
        reasons.set(items[a].id, "Same creditor and matching account number details.");
      }
    }
  }
  let agentChecked = false;
  if (hasApiKey()) {
    try {
      for (const g of await findDuplicateGroups(knownItems(clientId))) {
        const valid = [...new Set(g.item_ids)].filter((id) => ids.has(id));
        for (const id of valid.slice(1)) union(valid[0], id);
        if (valid.length > 1) reasons.set(valid[0], g.reason);
      }
      agentChecked = true;
    } catch (e) {
      console.error("duplicate check failed", e);
      return bad(`The duplicate check failed: ${friendlyError(e)}`, 502);
    }
  }

  const groups = new Map<number, number[]>();
  for (const i of items) {
    const root = find(i.id);
    groups.set(root, [...(groups.get(root) ?? []), i.id]);
  }
  const out = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({ item_ids: g.sort((a, b) => a - b), reason: g.map((id) => reasons.get(id)).find(Boolean) ?? "Looks like the same account." }));
  return ok({ groups: out, agentChecked, note: agentChecked ? "" : NO_KEY });
}

/** { ids } merges those items into the oldest one. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const clientId = await idOf(ctx);
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length < 2) return bad("Pick at least two items to merge.");
  try {
    return ok({ kept: mergeItems(clientId, ids.map(Number)) });
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e));
  }
}
