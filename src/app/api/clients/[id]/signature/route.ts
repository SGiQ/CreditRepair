import { requireClientAccess } from "@/lib/auth";
import { run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";

const PREFIX = "data:image/png;base64,";

/** Only the client's own login may set or remove their signature; a specialist never signs for them. */
async function ownLogin(ctx: Ctx) {
  const id = await idOf(ctx);
  const auth = await requireClientAccess(id);
  if (auth instanceof Response) return auth;
  if (auth.role !== "client") return bad("Only the client can add their own signature, from their login.", 403);
  return id;
}

export async function POST(req: Request, ctx: Ctx) {
  const id = await ownLogin(ctx);
  if (id instanceof Response) return id;
  const { image, consent } = await req.json();
  if (consent !== true) return bad("Tick the box to authorize use of your signature.");
  if (typeof image !== "string" || !image.startsWith(PREFIX) || image.length > 400_000) return bad("That signature couldn't be saved. Try drawing it again.");
  const png = Buffer.from(image.slice(PREFIX.length), "base64");
  if (png.length < 200 || png.subarray(1, 4).toString() !== "PNG") return bad("That signature couldn't be saved. Try drawing it again.");
  run("UPDATE clients SET signature = ?, signature_at = datetime('now') WHERE id = ?", image, id);
  return ok();
}

/** Removing the signature also withdraws approval from letters that have not gone out yet. */
export async function DELETE(_: Request, ctx: Ctx) {
  const id = await ownLogin(ctx);
  if (id instanceof Response) return id;
  run("UPDATE clients SET signature = '', signature_at = '' WHERE id = ?", id);
  run("UPDATE letters SET signed_at = '' WHERE client_id = ? AND status = 'draft'", id);
  return ok();
}
