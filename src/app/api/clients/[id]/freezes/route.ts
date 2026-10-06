import { requireAdmin } from "@/lib/auth";
import { run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { createFreezeLetter } from "@/lib/jobs";
import { SECONDARY_AGENCIES } from "@/lib/agencies";
import { getClient } from "@/lib/store";

/** { agency, status } updates the checklist; { agency, letter: true } also drafts the mail-in request. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const clientId = await idOf(ctx);
  if (!getClient(clientId)) return bad("Client not found", 404);
  const b = await req.json();
  if (!SECONDARY_AGENCIES.some((a) => a.key === b.agency)) return bad("Unknown agency");
  if (b.letter) return ok({ id: createFreezeLetter(clientId, b.agency) });
  if (!["todo", "requested", "frozen"].includes(b.status)) return bad("Invalid status");
  run(
    `INSERT INTO freezes (client_id, agency, status) VALUES (?, ?, ?)
     ON CONFLICT (client_id, agency) DO UPDATE SET status = excluded.status, updated_at = datetime('now')`,
    clientId,
    b.agency,
    b.status,
  );
  return ok();
}
