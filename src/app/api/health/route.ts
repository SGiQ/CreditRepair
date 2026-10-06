import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness check for the host: confirms the server is up and the database opens. */
export async function GET() {
  try {
    db().prepare("SELECT 1").get();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
