import { requireAdmin, requireClientAccess } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { nextReminderAt, sendReminderNow } from "@/lib/reminders";

/**
 * { enabled: boolean } turns this client's monthly upload reminders on or off (the client or a specialist).
 * { send: true } sends one right away (specialist only).
 */
export async function POST(req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  const b = await req.json();
  if (b.send) {
    const auth = await requireAdmin();
    if (auth instanceof Response) return auth;
    const problem = await sendReminderNow(id);
    if (problem) return bad(problem);
    const last = all<{ status: string; error: string }>("SELECT status, error FROM notifications WHERE client_id = ? ORDER BY id DESC LIMIT 1", id)[0];
    if (last?.status === "failed") return bad(`Sending failed: ${last.error}`, 502);
    return ok({ next: nextReminderAt(id) });
  }
  const auth = await requireClientAccess(id);
  if (auth instanceof Response) return auth;
  if (typeof b.enabled !== "boolean") return bad("Invalid request.");
  run("UPDATE clients SET report_reminders = ? WHERE id = ?", b.enabled ? 1 : 0, id);
  return ok({ next: b.enabled ? nextReminderAt(id) : null });
}
