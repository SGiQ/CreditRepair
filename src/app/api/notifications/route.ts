import { requireAdmin } from "@/lib/auth";
import { all } from "@/lib/db";
import { emailConfig } from "@/lib/email";
import { mailConfig } from "@/lib/mail";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Email setup and the most recent messages the app sent (or logged in demo mode). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  return ok({
    email: emailConfig(),
    mail: mailConfig(),
    webhook: Boolean(process.env.LOB_WEBHOOK_SECRET),
    recent: all(
      `SELECT n.id, n.kind, n.recipient, n.subject, n.status, n.error, n.created_at, c.name AS client_name, n.client_id
       FROM notifications n LEFT JOIN clients c ON c.id = n.client_id ORDER BY n.id DESC LIMIT 30`,
    ),
  });
}
