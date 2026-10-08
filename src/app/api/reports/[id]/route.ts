import { requireAdmin } from "@/lib/auth";
import fs from "node:fs";
import { get, run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";

/** Removes the report, its stored file, the scores read from it, and the items found in it that have no letters yet. */
export async function DELETE(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const id = await idOf(ctx);
  const r = get<{ stored_path: string }>("SELECT stored_path FROM reports WHERE id = ?", id);
  if (!r) return bad("Report not found", 404);
  fs.rmSync(r.stored_path, { force: true });
  run(
    `DELETE FROM items WHERE report_id = ? AND status = 'identified'
       AND NOT EXISTS (SELECT 1 FROM letters l, json_each(l.item_ids) j WHERE j.value = items.id)`,
    id,
  );
  run("DELETE FROM scores WHERE report_id = ? AND source = 'report'", id);
  run("DELETE FROM reports WHERE id = ?", id);
  return ok();
}
