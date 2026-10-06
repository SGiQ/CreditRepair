"use client";
import { useState } from "react";
import { SECONDARY_AGENCIES } from "@/lib/agencies";
import type { Freeze } from "@/lib/types";
import type { TabProps } from "./ClientWorkspace";
import { api, Button, Card, inputClass } from "./ui";

export function FreezesTab({ bundle, reload }: TabProps) {
  const { client, freezes, letters } = bundle;
  const [note, setNote] = useState("");
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
              </div>
              <a href={a.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
                Freeze online ↗
              </a>
              <Button
                small
                onClick={async () => {
                  await post({ agency: a.key, letter: true });
                  setNote(`Freeze request for ${a.name} added to the Letters tab.`);
                }}
              >
                {hasLetter ? "Draft another letter" : "Draft mail-in letter"}
              </Button>
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
        Agency mailing addresses change. Confirm the address on the agency&apos;s site before mailing — the recipient block
        on every letter is editable.
      </p>
    </div>
  );
}
