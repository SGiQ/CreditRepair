"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientForm } from "@/components/ClientForm";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { DashboardSummary } from "@/components/DashboardSummary";
import { LeadsCard } from "@/components/LeadsCard";
import { api, Badge, Button, Card } from "@/components/ui";
import type { Client } from "@/lib/types";

type Row = Client & { item_count: number; resolved_count: number; awaiting_count: number };

export function ClientsHome() {
  const router = useRouter();
  const [clients, setClients] = useState<Row[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api<Row[]>("/api/clients").then(setClients);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-600">Every client&apos;s file at a glance, and what needs doing next.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
      <LeadsCard />

      <DashboardSummary />

      <div id="clients" className="flex scroll-mt-6 items-end justify-between gap-4 pt-2">
        <h2 className="text-lg font-semibold tracking-tight">Clients</h2>
        {!adding && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            New client
          </Button>
        )}
      </div>

      {adding && (
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">New client</h2>
          <ClientForm onSaved={(id) => router.push(`/clients/${id}`)} onCancel={() => setAdding(false)} />
        </Card>
      )}

      {clients && !clients.length && !adding && (
        <Card className="px-6 py-14 text-center">
          <p className="font-medium">No clients yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-600">
            Add your first client, then upload their credit report to get an account-by-account dispute plan.
          </p>
          <Button variant="primary" className="mt-5" onClick={() => setAdding(true)}>
            Add a client
          </Button>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {clients?.map((c) => {
          const pct = c.item_count ? Math.round((c.resolved_count / c.item_count) * 100) : 0;
          return (
            <Link key={c.id} href={`/clients/${c.id}`} className="group">
              <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{c.name}</h3>
                  {c.awaiting_count > 0 && <Badge tone="amber">{c.awaiting_count} awaiting reply</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-stone-500">{[c.city, c.state].filter(Boolean).join(", ") || "No address yet"}</p>
                <div className="mt-5 flex items-baseline justify-between text-sm">
                  <span className="text-stone-600">
                    {c.item_count ? `${c.resolved_count} of ${c.item_count} items resolved` : "No report analyzed yet"}
                  </span>
                  {c.item_count > 0 && <span className="font-medium tabular-nums">{pct}%</span>}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
        </div>

        <DashboardSidebar />
      </div>
    </div>
  );
}
