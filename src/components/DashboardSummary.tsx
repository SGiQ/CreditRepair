"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ITEM_STATUSES, STATUS_LABEL } from "@/lib/types";
import { api, Card } from "./ui";

interface Dashboard {
  totals: { clients: number; items: number; resolved: number; open: number; awaiting: number; overdue: number; portal_logins: number };
  statuses: Record<string, number>;
  score_change: number | null;
  score_clients: number;
  attention: { client_id: number; client: string; text: string; tone: "red" | "amber" | "stone" }[];
}

const DOT = { red: "bg-red-600", amber: "bg-amber-500", stone: "bg-stone-400" };
const TONE_LABEL = { red: "Urgent", amber: "Soon", stone: "To do" };

/** Cross-client numbers, the worklist, and where every item sits in the pipeline. */
export function DashboardSummary() {
  const [d, setD] = useState<Dashboard | null>(null);
  useEffect(() => {
    api<Dashboard>("/api/dashboard").then(setD).catch(() => {});
  }, []);
  if (!d || !d.totals.clients) return null;

  const t = d.totals;
  const pct = t.items ? Math.round((t.resolved / t.items) * 100) : 0;
  const tiles = [
    { label: "Clients", value: t.clients as number | string, sub: `${t.portal_logins} with a portal login` },
    { label: "Open negative items", value: t.open, sub: `${t.items} tracked in total` },
    { label: "Deleted or corrected", value: t.resolved, sub: `${pct}% of all items` },
    {
      label: "Avg. score change",
      value: d.score_change === null ? "—" : `${d.score_change > 0 ? "+" : ""}${d.score_change}`,
      sub: d.score_change === null ? "Needs 2+ readings for a client" : `per bureau and model, across ${d.score_clients} ${d.score_clients === 1 ? "client" : "clients"}`,
    },
    { label: "Letters awaiting reply", value: t.awaiting, sub: t.overdue ? `${t.overdue} past the 30-day deadline` : "None overdue", alert: t.overdue > 0 },
  ];
  const max = Math.max(1, ...ITEM_STATUSES.map((s) => d.statuses[s] ?? 0));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-5">
            <div className="text-xs font-medium text-stone-500">{tile.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{tile.value}</div>
            <div className={`mt-1 text-xs ${tile.alert ? "font-medium text-red-700" : "text-stone-500"}`}>
              {tile.alert && <span aria-hidden>▲ </span>}
              {tile.sub}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <h2 className="px-5 pt-5 font-semibold">Needs attention</h2>
          {!d.attention.length && <p className="px-5 pb-5 pt-2 text-sm text-stone-500">All caught up. Nothing is overdue or waiting on you.</p>}
          <ul className="mt-2 divide-y divide-stone-100">
            {d.attention.slice(0, 8).map((a, n) => (
              <li key={n}>
                <Link href={`/clients/${a.client_id}`} className="flex items-start gap-3 px-5 py-3 text-sm hover:bg-stone-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.tone]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.client}</span>
                    <span className="block text-stone-600">{a.text}</span>
                  </span>
                  <span className="shrink-0 text-xs text-stone-500">{TONE_LABEL[a.tone]}</span>
                </Link>
              </li>
            ))}
          </ul>
          {d.attention.length > 8 && <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">+ {d.attention.length - 8} more across your clients</p>}
        </Card>

        <Card className="h-fit p-5">
          <h2 className="font-semibold">Items by stage</h2>
          <p className="mt-1 text-xs text-stone-500">Every tracked item across all clients</p>
          <dl className="mt-4 space-y-2.5">
            {ITEM_STATUSES.map((s) => {
              const n = d.statuses[s] ?? 0;
              return (
                <div key={s} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-sm" title={`${STATUS_LABEL[s]}: ${n} of ${t.items}`}>
                  <dt className="truncate text-stone-600">{STATUS_LABEL[s]}</dt>
                  <dd className="h-3">
                    <div className="h-full rounded-r bg-emerald-700" style={{ width: `${(n / max) * 100}%`, minWidth: n ? 3 : 0 }} />
                  </dd>
                  <dd className="text-right font-medium tabular-nums">{n}</dd>
                </div>
              );
            })}
          </dl>
        </Card>
      </div>
    </div>
  );
}
