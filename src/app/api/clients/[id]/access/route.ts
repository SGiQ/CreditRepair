import { get, run } from "@/lib/db";
import { hashToken, INVITE_DAYS, newToken, requireAdmin } from "@/lib/auth";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { getClient } from "@/lib/store";

/** { action: "invite" } returns a one-time link token; { action: "revoke" } removes the login and any open invite. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const clientId = await idOf(ctx);
  const client = getClient(clientId);
  if (!client) return bad("Client not found", 404);
  const { action } = await req.json();

  if (action === "revoke") {
    run("DELETE FROM users WHERE client_id = ? AND role = 'client'", clientId);
    run("DELETE FROM invites WHERE client_id = ?", clientId);
    return ok();
  }
  if (action !== "invite") return bad("Unknown action");
  const email = client.email.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad("Add the client's email address first — it becomes their login.");
  if (get("SELECT 1 FROM users WHERE client_id = ?", clientId)) return bad("This client already has a login.");
  if (get("SELECT 1 FROM users WHERE email = ?", email)) return bad("That email is already used by another account.");

  const token = newToken();
  run("DELETE FROM invites WHERE client_id = ?", clientId);
  run(
    "INSERT INTO invites (token_hash, client_id, email, expires_at) VALUES (?, ?, ?, datetime('now', ?))",
    hashToken(token),
    clientId,
    email,
    `+${INVITE_DAYS} days`,
  );
  return ok({ token });
}
