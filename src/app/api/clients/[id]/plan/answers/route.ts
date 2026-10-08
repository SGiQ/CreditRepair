import { requireClientAccess } from "@/lib/auth";
import { all } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { bad, ok, idOf, type Ctx } from "@/lib/http";
import { saveAnswers } from "@/lib/plan";
import { getClient } from "@/lib/store";

/** { answers: { "0": "...", ... } } from the client's portal (or the specialist). */
export async function POST(req: Request, ctx: Ctx) {
  const clientId = await idOf(ctx);
  const auth = await requireClientAccess(clientId);
  if (auth instanceof Response) return auth;
  const { answers } = await req.json();
  if (!answers || typeof answers !== "object") return bad("No answers.");
  try {
    saveAnswers(clientId, answers);
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e));
  }
  if (auth.role === "client") {
    const name = getClient(clientId)?.name ?? "A client";
    const text = `${name} answered questions on their dispute plan. Open their Plan tab to read them, then refresh the plan so it uses the answers.`;
    for (const a of all<{ email: string }>("SELECT email FROM users WHERE role = 'admin'")) {
      void sendEmail({ clientId, letterId: null, kind: "plan_answers", to: a.email, subject: `${name} answered plan questions`, text, html: `<p>${text}</p>` });
    }
  }
  return ok();
}
