"use client";
import { useState } from "react";
import { BUREAUS, LETTER_TYPES, TIER_LABEL, type Item, type Plan, type PlanTier } from "@/lib/types";
import { api, Badge, Button, Card, ErrorNote, fmtDate, inputClass, type Tone } from "./ui";

const TIER_TONE: Record<PlanTier, Tone> = { best: "green", partial: "amber", low: "stone" };
const TIER_INTRO: Record<PlanTier, string> = {
  best: "Specific, provable errors. These have the best chance of being removed or fixed.",
  partial: "Real errors in how they're reported, but the negative item itself is likely accurate. Expect corrections rather than removal.",
  low: "Reported accurately. Disputing these rarely works; the route shown is the realistic one.",
};

/** The plan report, shared by the specialist's Plan tab and the client portal. */
export function PlanReport({
  plan,
  items,
  clientId,
  role,
  reload,
}: {
  plan: Plan;
  items: Item[];
  clientId: number;
  role: "admin" | "client";
  reload: () => Promise<void>;
}) {
  const data = plan.data!;
  const byId = new Map(items.map((i) => [i.id, i]));
  const tiers = (["best", "partial", "low"] as PlanTier[]).map((t) => ({ t, rows: data.tiers.filter((x) => x.tier === t && byId.has(x.item_id)) }));
  const [answers, setAnswers] = useState<Record<string, string>>(plan.answers);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <p className="leading-relaxed text-stone-800">{data.overview}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          {tiers.map(({ t, rows }) => (
            <div key={t} className="rounded-lg bg-stone-50 p-3">
              <div className="text-2xl font-semibold tabular-nums">{rows.length}</div>
              <div className="text-xs text-stone-600">{TIER_LABEL[t]}</div>
            </div>
          ))}
        </div>
      </Card>

      {data.cautions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-5">
          <h3 className="font-semibold text-amber-900">Before you start</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {data.cautions.map((c, n) => (
              <li key={n}>{c}</li>
            ))}
          </ul>
        </Card>
      )}

      {data.questions.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold">{role === "client" ? "Questions for you" : "Questions to confirm with the client"}</h3>
          <p className="mt-1 text-sm text-stone-600">
            {role === "client"
              ? "Your answers decide which items can be disputed. Answer what you can."
              : "The client can answer these in their portal. Refresh the plan after answers come in."}
          </p>
          <ol className="mt-3 space-y-3">
            {data.questions.map((q, n) => (
              <li key={n} className="text-sm">
                <p className="font-medium">
                  {n + 1}. {q.question}
                </p>
                <p className="text-xs text-stone-500">{q.why}</p>
                <textarea
                  className={`${inputClass} mt-1.5`}
                  rows={2}
                  value={answers[String(n)] ?? ""}
                  onChange={(e) => {
                    setSaved(false);
                    setAnswers({ ...answers, [String(n)]: e.target.value });
                  }}
                  placeholder={role === "client" ? "Your answer" : "Answer (from the client)"}
                />
              </li>
            ))}
          </ol>
          <ErrorNote>{error}</ErrorNote>
          <div className="mt-3 flex items-center gap-3">
            <Button
              small
              variant="primary"
              onClick={async () => {
                setError("");
                try {
                  await api(`/api/clients/${clientId}/plan/answers`, { json: { answers } });
                  setSaved(true);
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save answers
            </Button>
            {saved && <span className="text-xs text-emerald-800">{role === "client" ? "Saved. Your specialist has been notified." : "Saved."}</span>}
          </div>
        </Card>
      )}

      {tiers.map(
        ({ t, rows }) =>
          rows.length > 0 && (
            <section key={t}>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{TIER_LABEL[t]}</h3>
                <Badge tone={TIER_TONE[t]}>{rows.length}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-stone-600">{TIER_INTRO[t]}</p>
              <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                {rows.map((r) => {
                  const i = byId.get(r.item_id)!;
                  return (
                    <li key={r.item_id} className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
                      <div className="font-medium">{r.headline}</div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {i.creditor}
                        {i.bureaus.length ? ` · ${BUREAUS.filter((b) => i.bureaus.includes(b)).join(", ")}` : ""}
                        {i.balance ? ` · ${i.balance}` : ""}
                      </div>
                      <p className="mt-2 leading-relaxed text-stone-700">{r.why}</p>
                      <p className="mt-2 text-xs">
                        <span className="font-semibold text-stone-700">Expected outcome: </span>
                        <span className="text-stone-700">{r.outcome}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
      )}

      <Card className="p-5">
        <h3 className="font-semibold">What to expect</h3>
        <dl className="mt-3 space-y-3 text-sm">
          {data.expect.map((e, n) => (
            <div key={n}>
              <dt className="font-medium">{e.title}</dt>
              <dd className="mt-0.5 leading-relaxed text-stone-700">{e.detail}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section>
        <h3 className="font-semibold">The plan, round by round</h3>
        <div className="mt-3 space-y-3">
          {data.rounds.map((r) => (
            <RoundCard key={r.round} round={r} drafted={plan.drafted_rounds.includes(r.round)} byId={byId} clientId={clientId} role={role} reload={reload} />
          ))}
        </div>
      </section>

      <p className="text-xs text-stone-500">
        Plan made {fmtDate(plan.created_at)}. It is an assessment, not a guarantee: bureaus and creditors decide each dispute, and
        accurate information can legally stay on a report.
      </p>
    </div>
  );
}

function RoundCard({
  round: r,
  drafted,
  byId,
  clientId,
  role,
  reload,
}: {
  round: NonNullable<Plan["data"]>["rounds"][number];
  drafted: boolean;
  byId: Map<number, Item>;
  clientId: number;
  role: "admin" | "client";
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">
            Round {r.round}: {r.title}
          </div>
          <div className="text-xs text-stone-500">{r.timing}</div>
        </div>
        {role === "admin" && (
          <Button
            small
            variant={drafted ? "secondary" : "primary"}
            disabled={busy || !r.actions.length}
            onClick={async () => {
              if (drafted && !confirm(`Round ${r.round}'s letters were already drafted. Draft them again?`)) return;
              setBusy(true);
              setError("");
              try {
                const res = await api<{ started: number; skipped: string[] }>(`/api/clients/${clientId}/plan/draft`, { json: { round: r.round } });
                setResult(`${res.started} ${res.started === 1 ? "letter is" : "letters are"} being drafted on the Letters tab.${res.skipped.length ? ` Skipped: ${res.skipped.join("; ")}` : ""}`);
                await reload();
              } catch (e) {
                setError((e as Error).message);
              }
              setBusy(false);
            }}
          >
            {busy ? "Drafting…" : drafted ? `Draft Round ${r.round} again` : `Draft Round ${r.round} letters`}
          </Button>
        )}
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {r.actions.map((a, n) => (
          <li key={n} className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="font-medium">{LETTER_TYPES[a.letter_type]?.label ?? a.letter_type}</span>
            {a.bureaus.length > 0 && <span className="text-stone-500"> → {a.bureaus.join(", ")}</span>}
            <span className="block text-xs text-stone-600">
              {a.item_ids
                .map((id) => byId.get(id)?.creditor)
                .filter(Boolean)
                .join(" · ")}
            </span>
            {role === "admin" && a.note && <span className="mt-0.5 block text-xs text-stone-500">{a.note}</span>}
          </li>
        ))}
      </ul>
      {result && <p className="mt-2 text-xs text-emerald-800">{result}</p>}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
