import { requireAdmin, tooManyAttempts } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { bad, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** Public inquiry form on the landing page. Saved for the admins and emailed to each of them. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  // Bots fill every field, including the hidden one; real visitors never see it.
  if (b.website) return ok();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (tooManyAttempts(`lead:${ip}`, 5, 60 * 60_000)) return bad("Too many requests. Please try again later.", 429);

  const name = clip(b.name, 100);
  const email = clip(b.email, 200);
  const phone = clip(b.phone, 40);
  const message = clip(b.message, 2000);
  if (!name) return bad("Please enter your name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad("Please enter a valid email address.");

  run("INSERT INTO leads (name, email, phone, message) VALUES (?, ?, ?, ?)", name, email, phone, message);

  const text = `New inquiry from the website.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "—"}\n\n${message || "(no message)"}\n\nIt's also listed on your dashboard.`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  for (const admin of all<{ email: string }>("SELECT email FROM users WHERE role = 'admin'")) {
    void sendEmail({
      clientId: null, letterId: null, kind: "lead", to: admin.email,
      subject: `New inquiry: ${name}`, text, html: `<p>${esc(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
    });
  }
  return ok();
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  return ok(all("SELECT id, name, email, phone, message, status, created_at FROM leads ORDER BY status = 'new' DESC, id DESC LIMIT 50"));
}
