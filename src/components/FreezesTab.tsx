"use client";
import { useState } from "react";
import { AGENCIES_CHECKED, AGENCY_SOURCE, SECONDARY_AGENCIES } from "@/lib/agencies";
import type { Freeze } from "@/lib/types";
import type { TabProps } from "./ClientWorkspace";
import { api, Button, Card, inputClass } from "./ui";

export function FreezesTab({ bundle, reload }: TabProps) {
  const { client, freezes, letters } = bundle;
  const [note, setNote] = useState("");
  const [drafting, setDrafting] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const statusOf = (key: string) => freezes.find((f) => f.agency === key)?.status ?? "todo";
  const done = SECONDARY_AGENCIES.filter((a) => statusOf(a.key) !== "todo").length;

  const post = async (json: object) => {
    await api(`/api/clients/${client.id}/freezes`, { json });
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-stone-600">
          Secondary agencies hold public-record, banking, and identity data that lenders and the big three draw on.
          Freezing them limits who can pull it while disputes are open. Freezes are free; online is fastest, or draft
          a mail-in request.
        </p>
        <span className="text-sm font-medium tabular-nums">
          {done} of {SECONDARY_AGENCIES.length} started
        </span>
      </div>
      {note && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{note}</p>}
      <Card className="divide-y divide-stone-100">
        {SECONDARY_AGENCIES.map((a) => {
          const hasLetter = letters.some((l) => l.type === "freeze_request" && l.recipient_name === a.address.split("\n")[0]);
          return (
            <div key={a.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1 basis-72">
                <div className="font-medium">{a.name}</div>
                <div className="text-sm text-stone-600">{a.what}</div>
                <div className="mt-0.5 text-xs text-stone-500">
                  Phone {a.phone} · {a.address.split("\n").slice(-2).join(", ")}
                </div>
              </div>
              <a href={a.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
                {a.online ? "Freeze online ↗" : "Freeze form & instructions ↗"}
              </a>
              {drafting === a.key ? (
                <form
                  className="flex basis-full flex-wrap items-end gap-2 rounded-lg bg-stone-50 p-3 sm:basis-auto"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await post({ agency: a.key, letter: true, reference });
                    setNote(`Freeze request for ${a.name} added to the Letters tab.`);
                    setDrafting(null);
                    setReference("");
                  }}
                >
                  <label className="text-xs font-medium text-stone-600">
                    Reference number <span className="font-normal text-stone-400">(optional)</span>
                    <input
                      className={`${inputClass} mt-1 !w-44 font-normal`}
                      value={reference}
                      maxLength={40}
                      placeholder="e.g. from a failed online request"
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                  <Button small variant="primary" className="!py-2">
                    Draft letter
                  </Button>
                  <Button small type="button" variant="ghost" className="!py-2" onClick={() => setDrafting(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <Button small onClick={() => setDrafting(a.key)}>
                  {hasLetter ? "Draft another letter" : "Draft mail-in letter"}
                </Button>
              )}
              <select
                aria-label={`Freeze status for ${a.name}`}
                className={`${inputClass} !w-36`}
                value={statusOf(a.key)}
                onChange={(e) => post({ agency: a.key, status: e.target.value as Freeze["status"] })}
              >
                <option value="todo">Not started</option>
                <option value="requested">Requested</option>
                <option value="frozen">Frozen ✓</option>
              </select>
            </div>
          );
        })}
      </Card>
      <p className="text-xs text-stone-500">
        If an agency can&apos;t verify someone online, it usually shows a reference number and asks for a written request. Use
        &ldquo;Draft mail-in letter&rdquo; and enter that number so the agency can match the letter to the attempt. Links, phone numbers and addresses were checked on each agency&apos;s own site in {AGENCIES_CHECKED} and against the{" "}
        <a href={AGENCY_SOURCE} target="_blank" rel="noreferrer" className="underline">
          CFPB&apos;s list of consumer reporting companies
        </a>
        . Agencies move and merge, so confirm the address on the agency&apos;s page before mailing; the recipient block on every
        letter is editable.
      </p>
    </div>
  );
}
