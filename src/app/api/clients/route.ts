import { requireAdmin } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { bad, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  return ok(
    all(`SELECT c.*,
        (SELECT COUNT(*) FROM items i WHERE i.client_id = c.id) AS item_count,
        (SELECT COUNT(*) FROM items i WHERE i.client_id = c.id AND i.status IN ('deleted','updated')) AS resolved_count,
        (SELECT COUNT(*) FROM letters l WHERE l.client_id = c.id AND l.status = 'sent' AND l.response = '' AND l.type NOT IN ('freeze_request', 'cfpb_complaint')) AS awaiting_count
      FROM clients c ORDER BY c.name COLLATE NOCASE`),
  );
}

const CLIENT_FIELDS = ["name", "address1", "address2", "city", "state", "zip", "dob", "ssn_last4", "phone", "email"] as const;

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const b = await req.json();
  if (!String(b.name ?? "").trim()) return bad("Client name is required.");
  if (b.ssn_last4 && !/^\d{4}$/.test(b.ssn_last4)) return bad("SSN must be the last 4 digits only.");
  const res = run(
    `INSERT INTO clients (${CLIENT_FIELDS.join(", ")}) VALUES (${CLIENT_FIELDS.map(() => "?").join(", ")})`,
    ...CLIENT_FIELDS.map((f) => String(b[f] ?? "").trim()),
  );
  return ok({ id: Number(res.lastInsertRowid) });
}
