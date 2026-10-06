import { requireClientAccess } from "@/lib/auth";
import { bad, idOf, type Ctx } from "@/lib/http";
import { letterFilename, renderDocx, renderPdf } from "@/lib/letterDoc";
import { getClient, getLetter } from "@/lib/store";

export async function GET(req: Request, ctx: Ctx) {
  const letter = getLetter(await idOf(ctx));
  const client = letter && getClient(letter.client_id);
  if (!letter || !client) return bad("Letter not found", 404);
  const auth = await requireClientAccess(client.id);
  if (auth instanceof Response) return auth;
  if (letter.status !== "draft" && letter.status !== "sent") return bad("This letter isn't ready yet.", 404);
  const docx = new URL(req.url).searchParams.get("format") === "docx";
  const bytes = docx ? await renderDocx(client, letter) : await renderPdf(client, letter);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": docx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
      "Content-Disposition": `${new URL(req.url).searchParams.has("inline") ? "inline" : "attachment"}; filename="${letterFilename(client, letter, docx ? "docx" : "pdf")}"`,
    },
  });
}
