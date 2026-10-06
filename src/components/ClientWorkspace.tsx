"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminSteps } from "@/lib/steps";
import type { ClientBundle } from "@/lib/types";
import { AdvisorTab } from "./AdvisorTab";
import { FreezesTab } from "./FreezesTab";
import { ItemsTab } from "./ItemsTab";
import { LettersTab } from "./LettersTab";
import { OverviewTab } from "./OverviewTab";
import { StepGuide } from "./StepGuide";
import { api, ErrorNote } from "./ui";

const TABS = ["Overview", "Negative items", "Letters", "Freezes", "Advisor"] as const;
type Tab = (typeof TABS)[number];

export interface TabProps {
  bundle: ClientBundle;
  reload: () => Promise<void>;
}

export function ClientWorkspace({ id }: { id: number }) {
  const [bundle, setBundle] = useState<ClientBundle | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");
  // Items handed from the items table to the letter generator.
  const [picked, setPicked] = useState<number[] | null>(null);

  const reload = useCallback(async () => {
    try {
      setBundle(await api<ClientBundle>(`/api/clients/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    api<ClientBundle>(`/api/clients/${id}`)
      .then(setBundle)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  // Poll while background work is running; in mail demo mode also while simulated mail is "in transit".
  const working =
    bundle?.reports.some((r) => r.status === "analyzing") ||
    bundle?.letters.some((l) => l.status === "generating" || (bundle.mail.mode === "demo" && l.mail_id && l.status === "sent" && !l.delivered_at));
  useEffect(() => {
    if (!working) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [working, reload]);

  if (error && !bundle) return <ErrorNote>{error}</ErrorNote>;
  if (!bundle) return <p className="text-sm text-stone-500">Loading…</p>;

  const { client, items, letters } = bundle;
  const counts: Partial<Record<Tab, number>> = { "Negative items": items.length, Letters: letters.length };
  const props = { bundle, reload };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">
          ← All clients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{client.name}</h1>
      </div>

      {!bundle.hasApiKey && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Connect the AI agent:</strong> create a file named <code className="font-mono">.env.local</code> in the
          project folder containing <code className="font-mono">ANTHROPIC_API_KEY=your-key</code>, then restart the app.
          Report analysis, letter drafting, and the advisor need it; tracking and downloads work without it.
        </p>
      )}

      <StepGuide compact heading="Where this file stands" steps={adminSteps(bundle)} onAction={(step) => setTab(step.target as Tab)} />

      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium ${
              tab === t ? "border-emerald-700 text-emerald-800" : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            {t}
            {counts[t] ? <span className="ml-1.5 text-xs tabular-nums text-stone-400">{counts[t]}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "Overview" && <OverviewTab {...props} goTo={(t) => setTab(t as Tab)} />}
      {tab === "Negative items" && (
        <ItemsTab
          {...props}
          onDraft={(ids) => {
            setPicked(ids);
            setTab("Letters");
          }}
        />
      )}
      {tab === "Letters" && <LettersTab {...props} picked={picked} />}
      {tab === "Freezes" && <FreezesTab {...props} />}
      {tab === "Advisor" && <AdvisorTab {...props} />}
    </div>
  );
}
