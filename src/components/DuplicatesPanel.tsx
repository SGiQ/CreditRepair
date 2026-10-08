"use client";
import { useState } from "react";
import { CATEGORY_LABEL, STATUS_LABEL, type Item } from "@/lib/types";
import { api, Button, Card, ErrorNote, Spinner } from "./ui";

interface Group {
  item_ids: number[];
  reason: string;
}

/** "Check for duplicates": proposes groups of the same account; the specialist reviews and merges each. */
export function DuplicatesPanel({ clientId, items, reload }: { clientId: number; items: Item[]; reload: () => Promise<void> }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [picked, setPicked] = useState<Record<number, Set<number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const byId = new Map(items.map((i) => [i.id, i]));

  async function check() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await api<{ groups: Group[]; agentChecked: boolean; note: string }>(`/api/clients/${clientId}/duplicates`);
      setGroups(r.groups);
      setPicked(Object.fromEntries(r.groups.map((g, n) => [n, new Set(g.item_ids)])));
      if (!r.agentChecked) setNote("Only the rule-based check ran (the AI agent isn't connected), so name variants like WFBNA vs Wells Fargo won't be caught.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function merge(n: number) {
    const ids = [...(picked[n] ?? [])];
    if (ids.length < 2) return setError("Tick at least two items to merge.");
    if (!confirm(`Merge ${ids.length} items into one? Bureaus, issues and notes are combined and letters stay linked. This can't be undone.`)) return;
    setError("");
    try {
      await api(`/api/clients/${clientId}/duplicates`, { json: { ids } });
      setGroups((gs) => gs?.filter((_, i) => i !== n) ?? null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!groups) {
    return (
      <Button small onClick={check} disabled={busy}>
        {busy ? <Spinner /> : null} {busy ? "Checking…" : "Check for duplicates"}
      </Button>
    );
  }

  return (
    <Card className="basis-full p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Possible duplicates</h3>
        <span className="flex gap-2">
          <Button small onClick={check} disabled={busy}>
            {busy ? "Checking…" : "Check again"}
          </Button>
          <Button small variant="ghost" onClick={() => setGroups(null)}>
            Close
          </Button>
        </span>
      </div>
      {note && <p className="mt-1 text-xs text-amber-700">{note}</p>}
      <ErrorNote>{error}</ErrorNote>
      {!groups.length && <p className="mt-2 text-sm text-stone-600">No duplicates found. Each item looks like a separate account.</p>}
      <div className="mt-3 space-y-3">
        {groups.map((g, n) => (
          <div key={g.item_ids.join("-")} className="rounded-lg border border-stone-200 p-3">
            <p className="text-sm text-stone-700">{g.reason}</p>
            <ul className="mt-2 space-y-1">
              {g.item_ids.map((id) => {
                const i = byId.get(id);
                if (!i) return null;
                return (
                  <li key={id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={picked[n]?.has(id) ?? false}
                        onChange={() =>
                          setPicked((p) => {
                            const s = new Set(p[n]);
                            if (!s.delete(id)) s.add(id);
                            return { ...p, [n]: s };
                          })
                        }
                      />
                      <span>
                        <span className="font-medium">{i.creditor}</span>
                        <span className="text-stone-500">
                          {" "}
                          · {i.account_number || "no account #"} · {CATEGORY_LABEL[i.category] ?? i.category} ·{" "}
                          {i.bureaus.map((b) => b.slice(0, 2).toUpperCase()).join(" ")} · {STATUS_LABEL[i.status]}
                          {i.notes ? " · has notes" : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button small variant="primary" onClick={() => merge(n)}>
                Merge ticked items
              </Button>
              <Button small variant="ghost" onClick={() => setGroups((gs) => gs?.filter((_, i) => i !== n) ?? null)}>
                Not duplicates
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
