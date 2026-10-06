import { requireClientAccess } from "@/lib/auth";
import { run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { getClient } from "@/lib/store";
import { BUREAUS } from "@/lib/types";

/** Adds a score reading typed in by the specialist or the client (scores printed on reports are captured automatically). */
export async function POST(req: Request, ctx: Ctx) {
  const clientId = await idOf(ctx);
  const auth = await requireClientAccess(clientId);
  if (auth instanceof Response) return auth;
  if (!getClient(clientId)) return bad("Client not found", 404);
  const b = await req.json();
  const score = Number(b.score);
  if (!BUREAUS.includes(b.bureau)) return bad("Pick a bureau.");
  if (!Number.isInteger(score) || score < 300 || score > 850) return bad("Enter a score between 300 and 850.");
  const asOf = typeof b.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.as_of) ? b.as_of : "";
  if (!asOf || Date.parse(asOf) > Date.now() + 86_400_000) return bad("Enter the date the score was checked.");
  run(
    "INSERT INTO scores (client_id, bureau, score, model, as_of, source) VALUES (?, ?, ?, ?, ?, 'manual')",
    clientId, b.bureau, score, String(b.model ?? "").trim().slice(0, 40), asOf,
  );
  return ok();
}
