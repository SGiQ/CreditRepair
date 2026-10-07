import { requireAdmin } from "@/lib/auth";
import { run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";

/** { status: "handled" | "new" } */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const { status } = await req.json();
  if (status !== "handled" && status !== "new") return bad("Invalid status");
  run("UPDATE leads SET status = ? WHERE id = ?", status, await idOf(ctx));
  return ok();
}

export async function DELETE(_: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  run("DELETE FROM leads WHERE id = ?", await idOf(ctx));
  return ok();
}
