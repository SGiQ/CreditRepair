import { requireClientAccess } from "@/lib/auth";
import JSZip from "jszip";
import { bad, idOf, type Ctx } from "@/lib/http";
import { letterFilename, renderDocx, renderPdf } from "@/lib/letterDoc";
import { getClient, getLetters } from "@/lib/store";

/** Every finished letter for the client in one archive (?format=pdf|docx, ?only=draft for unsent). */
export async function GET(req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  const auth = await requireClientAccess(id);
  if (auth instanceof Response) return auth;
  const client = getClient(id);
  if (!client) return bad("Client not found", 404);
  const q = new URL(req.url).searchParams;
  const docx = q.get("format") === "docx";
  const letters = getLetters(id).filter(
    (l) => (l.status === "draft" || l.status === "sent") && (q.get("only") !== "draft" || l.status === "draft"),
  );
  if (!letters.length) return bad("No letters to download yet.", 404);
  const zip = new JSZip();
  for (const l of letters) {
    zip.file(letterFilename(client, l, docx ? "docx" : "pdf"), docx ? await renderDocx(client, l) : await renderPdf(client, l));
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${client.name.replace(/[^A-Za-z0-9]+/g, "-")}_letters_${docx ? "docx" : "pdf"}.zip"`,
    },
  });
}
