import { requireAdmin } from "@/lib/auth";
import { backupConfig, recentBackups, runBackup } from "@/lib/backup";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  return ok({ config: backupConfig(), recent: recentBackups() });
}

/** "Back up now" from the Accounts page. */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const result = await runBackup();
  return Response.json(result, { status: result.status === "ok" ? 200 : 500 });
}
