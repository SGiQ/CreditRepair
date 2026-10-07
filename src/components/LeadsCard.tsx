"use client";
import { useEffect, useState } from "react";
import { api, Badge, Button, Card, fmtDate } from "./ui";

interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: "new" | "handled";
  created_at: string;
}

/** Inquiries from the public landing page. */
export function LeadsCard() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const load = () => api<Lead[]>("/api/leads").then(setLeads).catch(() => {});
  useEffect(() => {
    api<Lead[]>("/api/leads").then(setLeads).catch(() => {});
  }, []);
  if (!leads?.length) return null;

  const fresh = leads.filter((l) => l.status === "new");
  const shown = showHandled ? leads : fresh;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2 className="font-semibold">
          Website inquiries {fresh.length > 0 && <Badge tone="amber">{fresh.length} new</Badge>}
        </h2>
        <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => setShowHandled(!showHandled)}>
          {showHandled ? "Hide handled" : `Show all (${leads.length})`}
        </button>
      </div>
      {!shown.length && <p className="px-5 pb-5 pt-2 text-sm text-stone-500">No new inquiries.</p>}
      <ul className="mt-2 divide-y divide-stone-100">
        {shown.map((l) => (
          <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1 basis-72">
              <div className="font-medium">
                {l.name} <span className="font-normal text-stone-500">· {fmtDate(l.created_at)}</span>
              </div>
              <div className="text-stone-600">
                <a className="text-emerald-700 hover:underline" href={`mailto:${l.email}`}>
                  {l.email}
                </a>
                {l.phone && (
                  <>
                    {" · "}
                    <a className="text-emerald-700 hover:underline" href={`tel:${l.phone}`}>
                      {l.phone}
                    </a>
                  </>
                )}
              </div>
              {l.message && <p className="mt-1 whitespace-pre-wrap text-stone-700">{l.message}</p>}
            </div>
            <span className="flex items-center gap-2">
              <Button
                small
                variant={l.status === "new" ? "primary" : "secondary"}
                onClick={async () => {
                  await api(`/api/leads/${l.id}`, { method: "PATCH", json: { status: l.status === "new" ? "handled" : "new" } });
                  await load();
                }}
              >
                {l.status === "new" ? "Mark handled" : "Mark new"}
              </Button>
              <Button
                small
                variant="ghost"
                onClick={async () => {
                  if (!confirm(`Delete the inquiry from ${l.name}?`)) return;
                  await api(`/api/leads/${l.id}`, { method: "DELETE" });
                  await load();
                }}
              >
                Delete
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
