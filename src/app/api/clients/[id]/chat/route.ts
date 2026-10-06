import { requireAdmin } from "@/lib/auth";
import { chatStream, friendlyError, hasApiKey } from "@/lib/agent";
import { bad, idOf, NO_KEY, type Ctx } from "@/lib/http";
import { getClient, getItems, getLetters } from "@/lib/store";

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const id = await idOf(ctx);
  const client = getClient(id);
  if (!client) return bad("Client not found", 404);
  if (!hasApiKey()) return bad(NO_KEY);
  const { messages } = await req.json();
  if (!Array.isArray(messages) || !messages.length) return bad("No message.");

  const stream = chatStream({ client, items: getItems(id), letters: getLetters(id), messages });
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(enc.encode("\n\n[The model declined to answer this.]"));
      } catch (e) {
        controller.enqueue(enc.encode(`\n\n[Error: ${friendlyError(e)}]`));
      }
      controller.close();
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
