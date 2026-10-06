"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { hasReplyClock, LETTER_TYPES } from "@/lib/types";
import { ClientForm } from "./ClientForm";
import type { TabProps } from "./ClientWorkspace";
import { PortalAccessCard } from "./PortalAccessCard";
import { ReportUpload } from "./ReportUpload";
import { ScoreCard } from "./ScoreCard";
import { api, Badge, Button, Card, fmtDate } from "./ui";

const DAY = 86_400_000;
/** Recipients get 30 days from receipt: count from the confirmed delivery date when there is one, else the mailing date. */
export function daysLeft(l: { sent_at: string; delivered_at?: string }) {
  const due = new Date(`${l.delivered_at || l.sent_at}T12:00:00`).getTime() + 30 * DAY;
  return { due: new Date(due).toISOString().slice(0, 10), left: Math.ceil((due - Date.now()) / DAY) };
}

export function OverviewTab({ bundle, reload, goTo }: TabProps & { goTo: (tab: string) => void }) {
  const { client, items, letters, reports } = bundle;
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const resolved = items.filter((i) => i.status === "deleted" || i.status === "updated").length;
  const active = items.filter((i) => i.status === "disputed" || i.status === "awaiting_response").length;
  const verified = items.filter((i) => i.status === "verified").length;
  const pct = items.length ? Math.round((resolved / items.length) * 100) : 0;
  const pending = letters
    .filter((l) => l.status === "sent" && !l.response && l.sent_at && hasReplyClock(l.type))
    .map((l) => ({ l, ...daysLeft(l) }))
    .sort((a, b) => a.left - b.left);

  async function removeClient() {
    if (!confirm(`Permanently delete ${client.name} and all of their reports, items, and letters?`)) return;
    await api(`/api/clients/${client.id}`, { method: "DELETE" });
    router.push("/");
  }

  const stats = [
    { label: "Negative items", value: items.length },
    { label: "In dispute", value: active },
    { label: "Verified — needs follow-up", value: verified },
    { label: "Deleted or corrected", value: resolved },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-semibold tabular-nums tracking-tight">{s.value}</div>
              <div className="mt-0.5 text-xs text-stone-500">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-medium tabular-nums">{pct}% resolved</span>
        </div>
      </Card>

      <ScoreCard clientId={client.id} scores={bundle.scores} reload={reload} role="admin" />

      <div className="grid gap-6 lg:grid-cols-2">
        <ReportUpload
          clientId={client.id}
          reports={reports}
          reload={reload}
          canRemove
          intro="Upload the client's report (PDF from annualcreditreport.com or a monitoring service). The agent reads every account and builds the dispute plan."
          onReview={() => goTo("Negative items")}
        />

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Response deadlines</h2>
            <p className="mt-1 text-sm text-stone-600">Sent letters still waiting on an answer. Recipients have 30 days.</p>
            {!pending.length && <p className="mt-4 text-sm text-stone-500">Nothing outstanding. Mark a letter as sent to start its clock.</p>}
            <ul className="mt-3 divide-y divide-stone-100">
              {pending.map(({ l, due, left }) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.recipient_name}</div>
                    <div className="text-xs text-stone-500">
                      {LETTER_TYPES[l.type]?.label} · sent {fmtDate(l.sent_at)} · due {fmtDate(due)}
                    </div>
                  </div>
                  <Badge tone={left < 0 ? "red" : left <= 7 ? "amber" : "stone"}>
                    {left < 0 ? `${-left} days overdue` : `${left} days left`}
                  </Badge>
                </li>
              ))}
            </ul>
            {pending.some((p) => p.left < 0) && (
              <button onClick={() => goTo("Letters")} className="mt-3 text-sm font-medium text-emerald-700 hover:underline">
                Draft a no-response follow-up →
              </button>
            )}
          </Card>

          <PortalAccessCard bundle={bundle} reload={reload} />

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Client details</h2>
              {!editing && (
                <Button small onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
            </div>
            {editing ? (
              <div className="mt-4">
                <ClientForm
                  client={client}
                  onCancel={() => setEditing(false)}
                  onSaved={async () => {
                    await reload();
                    setEditing(false);
                  }}
                />
              </div>
            ) : (
              <>
                <dl className="mt-3 space-y-1 text-sm text-stone-700">
                  <div>{[client.address1, client.address2].filter(Boolean).join(", ") || <span className="text-amber-700">No mailing address — letters need one</span>}</div>
                  <div>{[client.city, client.state].filter(Boolean).join(", ")} {client.zip}</div>
                  <div className="text-stone-500">
                    {client.dob && `DOB ${client.dob}`} {client.ssn_last4 && ` · SSN ••• •• ${client.ssn_last4}`}
                  </div>
                  <div className="text-stone-500">{[client.phone, client.email].filter(Boolean).join(" · ")}</div>
                </dl>
                <button onClick={removeClient} className="mt-4 text-xs text-stone-400 hover:text-red-700">
                  Delete this client
                </button>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
