"use client";
import { useState } from "react";
import type { TabProps } from "./ClientWorkspace";
import { PlanReport } from "./PlanView";
import { api, Button, Card, ErrorNote, inputClass, Spinner } from "./ui";

/** Specialist view: set the client's goal, build or refresh the plan, and draft each round. */
export function PlanTab({ bundle, reload }: TabProps) {
  const { client, plan, items } = bundle;
  const [goal, setGoal] = useState(plan?.goal ?? "");
  const [error, setError] = useState("");
  const building = plan?.status === "generating";

  async function build() {
    setError("");
    try {
      await api(`/api/clients/${client.id}/plan`, { json: { goal } });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-semibold">Dispute plan</h2>
        <p className="mt-1 text-sm text-stone-600">
          The agent sorts every item by its real chance of removal, explains what to expect, lists what to confirm with the client,
          and lays out the letters round by round. The client sees a plain-language version in their portal.
        </p>
        <label className="mt-4 block text-xs font-medium text-stone-600">
          Client&apos;s goal and timing <span className="font-normal text-stone-400">(optional, shapes the plan)</span>
          <textarea
            className={`${inputClass} mt-1 font-normal text-stone-900`}
            rows={2}
            maxLength={500}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Applying for a car loan in 3 months; or: Wants the highest score possible, no deadline"
          />
        </label>
        <ErrorNote>{error}</ErrorNote>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={build} disabled={building || !items.length}>
            {building ? <Spinner /> : null}
            {building ? "Building the plan…" : plan?.data ? "Refresh the plan" : "Build the plan"}
          </Button>
          {building && <span className="text-sm text-stone-600">This takes a minute or two. You can leave the page.</span>}
          {!items.length && <span className="text-sm text-stone-500">Upload a credit report first.</span>}
          {plan?.status === "error" && <span className="text-sm text-red-700">{plan.error}</span>}
          {plan?.stale && !building && (
            <span className="text-sm text-amber-700">The file has changed since this plan was made (new results, letters or notes). Refresh it.</span>
          )}
        </div>
      </Card>

      {plan?.data && <PlanReport plan={plan} items={items} clientId={client.id} role="admin" reload={reload} />}
    </div>
  );
}
