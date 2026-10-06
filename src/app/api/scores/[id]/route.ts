import { requireClientAccess } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";

export async function DELETE(_: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  const row = get<{ client_id: number; source: string }>("SELECT client_id, source FROM scores WHERE id = ?", id);
  if (!row) return bad("Not found", 404);
  const auth = await requireClientAccess(row.client_id);
  if (auth instanceof Response) return auth;
  // Clients may only remove readings they typed in; scores read from a report stay unless the specialist removes them.
  if (auth.role === "client" && row.source !== "manual") return bad("Scores read from a report can only be removed by your specialist.", 403);
  run("DELETE FROM scores WHERE id = ?", id);
  return ok();
}
