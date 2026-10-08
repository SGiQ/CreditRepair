"use client";
import { useState, type ReactNode } from "react";
import { currentStep, type KeyDate, type Step } from "@/lib/steps";
import { Button } from "./ui";

/**
 * Sticky checklist beside the page: overall progress, the one thing to do next (with what to expect),
 * key dates, and every step. On narrow screens it sits above the page with the full list collapsed.
 */
export function ProgressSidebar({
  title,
  steps,
  dates,
  onAction,
  doneLabel = "Every step is complete. 🎉",
  children,
}: {
  title: string;
  steps: Step[];
  dates: KeyDate[];
  onAction: (step: Step) => void;
  /** Shown in place of "Next up" once every required step is done. */
  doneLabel?: ReactNode;
  /** Extra content under the key dates (e.g. today's priorities on the dashboard). */
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  // Required steps first; optional ones are only suggested after those are done.
  const required = currentStep(steps.filter((s) => !s.optional));
  const current =
    required !== -1 ? steps.indexOf(steps.filter((s) => !s.optional)[required]) : steps.findIndex((s) => s.optional && !s.done && !s.skipped);
  const counted = steps.filter((s) => !s.skipped && !s.optional);
  const done = counted.filter((s) => s.done).length;
  const pct = counted.length ? Math.round((done / counted.length) * 100) : 0;
  const next = current === -1 ? null : steps[current];

  return (
    <aside className="order-first rounded-xl border border-stone-200 bg-white p-5 lg:sticky lg:top-6 lg:order-none lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="flex items-center gap-4">
        <Ring pct={pct} />
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-stone-500">
            {done} of {counted.length} steps done
          </p>
        </div>
      </div>

      {next ? (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3.5 ring-1 ring-emerald-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{next.waiting ? "In progress" : next.optional ? "Optional next step" : "Next up"}</p>
          <p className="mt-1 font-semibold text-stone-900">{next.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-stone-700">{next.detail}</p>
          {next.expect && (
            <p className="mt-2 border-t border-emerald-200/70 pt-2 text-xs leading-relaxed text-stone-600">
              <span className="font-semibold text-stone-700">What to expect: </span>
              {next.expect}
            </p>
          )}
          {next.cta && next.target && !next.waiting && (
            <Button small variant="primary" className="mt-3 w-full" onClick={() => onAction(next)}>
              {next.cta} →
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3.5 text-sm text-emerald-900 ring-1 ring-emerald-200">{doneLabel}</div>
      )}

      {dates.length > 0 && (
        <dl className="mt-4 space-y-1.5 text-sm">
          {dates.map((d) => (
            <div key={d.label} className="flex justify-between gap-3">
              <dt className="text-stone-500">{d.label}</dt>
              <dd className={`text-right font-medium tabular-nums ${d.tone === "red" ? "text-red-700" : d.tone === "amber" ? "text-amber-700" : "text-stone-800"}`}>
                {d.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {children}

      <button className="mt-4 text-sm font-medium text-emerald-700 hover:underline lg:hidden" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        {expanded ? "Hide all steps" : "Show all steps"}
      </button>
      <ol className={`${expanded ? "" : "hidden"} mt-4 space-y-0.5 border-t border-stone-100 pt-3 lg:block`}>
        {steps.map((s, n) => {
          const isCurrent = n === current;
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={!s.target || s.done}
                title={!s.target && !s.done ? s.detail : undefined}
                onClick={() => onAction(s)}
                className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-sm disabled:cursor-default ${isCurrent ? "bg-stone-100" : "enabled:hover:bg-stone-50"}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                    s.done ? "bg-emerald-600 text-white" : isCurrent ? "bg-emerald-700 text-white" : s.skipped ? "bg-stone-200 text-stone-500" : "border border-stone-300 text-stone-500"
                  }`}
                  aria-hidden
                >
                  {s.done ? "✓" : s.skipped ? "–" : n + 1}
                </span>
                <span className={s.done ? "text-stone-400 line-through decoration-stone-300" : isCurrent ? "font-medium text-stone-900" : "text-stone-600"}>
                  {s.title}
                  {s.skipped && <span className="ml-1 text-xs text-stone-400 no-underline">(skipped)</span>}
                  {s.optional && !s.done && <span className="ml-1 text-xs text-stone-400">(optional)</span>}
                  <span className="sr-only">{s.done ? " — done" : isCurrent ? " — current step" : ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" role="img" aria-label={`${pct}% complete`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e7e5e4" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="#047857"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 32 32)"
        className="transition-all duration-500"
      />
      <text x="32" y="36.5" textAnchor="middle" className="fill-stone-900 text-[13px] font-semibold">
        {pct}%
      </text>
    </svg>
  );
}
