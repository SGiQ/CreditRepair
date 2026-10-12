import { requireClientAccess } from "@/lib/auth";
import fs from "node:fs";
import path from "node:path";
import { get, run, UPLOAD_DIR } from "@/lib/db";
import { hasApiKey } from "@/lib/agent";
import { bad, ok, idOf, NO_KEY, type Ctx } from "@/lib/http";
import { runAnalysis } from "@/lib/jobs";
import { getClient } from "@/lib/store";
import { MONITORING_PROVIDERS } from "@/lib/types";
import { stripHtml } from "@/lib/reportHtml";

const MAX_BYTES = 30 * 1024 * 1024;
const CLIENT_DAILY_UPLOADS = 5;

export async function POST(req: Request, ctx: Ctx) {
  const clientId = await idOf(ctx);
  const auth = await requireClientAccess(clientId);
  if (auth instanceof Response) return auth;
  if (!getClient(clientId)) return bad("Client not found", 404);
  const isClient = auth.role === "client";
  if (!hasApiKey()) return bad(isClient ? "Report analysis isn't available right now. Please contact your specialist." : NO_KEY);
  // Each upload triggers a paid analysis; cap what a client login can start.
  if (isClient) {
    const recent = get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM reports WHERE client_id = ? AND uploaded_at > datetime('now', '-1 day')",
      clientId,
    );
    if ((recent?.n ?? 0) >= CLIENT_DAILY_UPLOADS) return bad("You've reached today's upload limit. Try again tomorrow or contact your specialist.", 429);
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return bad("No file uploaded.");
  // "upload" for a file someone picked; a provider key when the browser import sent the page from that service.
  const source = String(form.get("source") ?? "upload");
  if (source !== "upload" && !(source in MONITORING_PROVIDERS)) return bad("Unknown report source.");
  const ext = path.extname(file.name).toLowerCase();
  if (![".pdf", ".txt", ".html", ".htm"].includes(ext)) return bad("Upload a PDF, or a .txt/.html export of the report.");
  if (file.size > MAX_BYTES) return bad("File is larger than 30 MB. Split the report and upload the parts separately.");

  const stored = path.join(UPLOAD_DIR, `${clientId}-${Date.now()}${ext}`);
  const raw = Buffer.from(await file.arrayBuffer());
  // Scripts and stylesheets carry no report data and can dwarf it on a saved web page.
  fs.writeFileSync(stored, ext === ".html" || ext === ".htm" ? stripHtml(raw.toString("utf8")) : raw);
  const res = run("INSERT INTO reports (client_id, filename, stored_path, source) VALUES (?, ?, ?, ?)", clientId, file.name, stored, source);
  const reportId = Number(res.lastInsertRowid);
  void runAnalysis(reportId, clientId, stored, file.name);
  return ok({ id: reportId });
}
