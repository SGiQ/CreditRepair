"use client";
import { useState } from "react";
import { currentStep, type Step } from "@/lib/steps";
import { Button, Card } from "./ui";

/**
 * Numbered walkthrough. `compact` shows only the current step with the rest behind a toggle
 * (specialist's file view); otherwise the whole list is shown (client portal).
 */
export function StepGuide({
  steps,
  onAction,
  compact,
  heading,
}: {
  steps: Step[];
  onAction: (step: Step) => void;
  compact?: boolean;
  heading: string;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const current = currentStep(steps);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = current === -1;
  const shown = expanded ? steps : allDone ? [] : [steps[current]];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{heading}</h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="tabular-nums text-stone-500">
            {doneCount} of {steps.length} done
          </span>
          {compact && (
            <button className="font-medium text-emerald-700 hover:underline" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
              {expanded ? "Show current step only" : "Show all steps"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {steps.map((s, n) => (
          <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.done ? "bg-emerald-600" : n === current ? "bg-emerald-300" : "bg-stone-200"}`} />
        ))}
      </div>

      {allDone && !expanded && <p className="mt-4 text-sm text-stone-700">Every step is complete. Nothing left to do on this file.</p>}

      <ol className="mt-4 space-y-1">
        {shown.map((s) => {
          const n = steps.indexOf(s);
          const isCurrent = n === current;
          return (
            <li key={s.key} className={`flex gap-3 rounded-lg p-3 ${isCurrent ? "bg-emerald-50 ring-1 ring-emerald-200" : ""}`} aria-current={isCurrent ? "step" : undefined}>
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-emerald-600 text-white" : isCurrent ? "bg-emerald-700 text-white" : "border border-stone-300 text-stone-500"
                }`}
              >
                {s.done ? "✓" : n + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className={`font-medium ${s.done ? "text-stone-500" : "text-stone-900"}`}>{s.title}</span>
                  {s.done && <span className="text-xs text-stone-500">Done</span>}
                  {s.skipped && <span className="text-xs text-stone-500">Skipped</span>}
                  {isCurrent && <span className="text-xs font-semibold text-emerald-800">{s.waiting ? "In progress — nothing to do yet" : "Next step"}</span>}
                </div>
                {(isCurrent || (!s.done && expanded)) && <p className="mt-1 text-sm leading-relaxed text-stone-600">{s.detail}</p>}
                {s.cta && s.target && (isCurrent ? !s.waiting : s.skipped) && (
                  <Button small variant={isCurrent ? "primary" : "secondary"} className="mt-2.5" onClick={() => onAction(s)}>
                    {s.cta} →
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
