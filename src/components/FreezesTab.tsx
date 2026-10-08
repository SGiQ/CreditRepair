"use client";
import { useState } from "react";
import { AGENCIES_CHECKED, AGENCY_SOURCE, SECONDARY_AGENCIES } from "@/lib/agencies";
import type { Freeze } from "@/lib/types";
import type { TabProps } from "./ClientWorkspace";
import { api, Button, Card, ErrorNote, fmtDate, inputClass } from "./ui";

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
              <Confirmation clientId={client.id} agency={a.key} freeze={freezes.find((f) => f.agency === a.key)} reload={reload} />
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

/** Proof that a freeze took effect: date, confirmation number and the agency's letter. */
function Confirmation({
  clientId,
  agency,
  freeze,
  reload,
}: {
  clientId: number;
  agency: string;
  freeze?: Freeze;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(freeze?.confirmed_on || new Date().toLocaleDateString("en-CA"));
  const [number, setNumber] = useState(freeze?.confirmation_number ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/clients/${clientId}/freezes/${agency}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("confirmed_on", date);
      body.append("confirmation_number", number);
      if (file) body.append("file", file);
      await api(url, { method: "POST", body });
      setEditing(false);
      setFile(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  if (editing) {
    return (
      <form onSubmit={save} className="basis-full space-y-2 rounded-lg bg-stone-50 p-3 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-stone-600">
            Freeze placed on
            <input type="date" required max={new Date().toLocaleDateString("en-CA")} className={`${inputClass} mt-1 !w-40 font-normal`} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-stone-600">
            Confirmation number <span className="font-normal text-stone-400">(optional)</span>
            <input className={`${inputClass} mt-1 !w-48 font-normal`} maxLength={60} value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-stone-600">
            Confirmation letter <span className="font-normal text-stone-400">(PDF or photo, optional)</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="mt-1 block text-xs font-normal" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <p className="text-xs text-amber-800">
          Don&apos;t type the freeze PIN anywhere here. Confirmation letters usually print it: cover it before scanning, or know the
          stored letter will include it. Stored letters are visible to admins only, never in the client portal.
        </p>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          <Button small variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save confirmation"}
          </Button>
          <Button small type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  if (freeze?.confirmed_on) {
    return (
      <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <span className="font-medium">✓ Freeze confirmed {fmtDate(freeze.confirmed_on)}</span>
        {freeze.confirmation_number && <span className="text-emerald-800">Confirmation # {freeze.confirmation_number}</span>}
        {freeze.added_by === "client" && <span className="text-xs text-emerald-800/80">Added by client</span>}
        {freeze.doc_name ? (
          <a href={url} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">
            View letter ↗
          </a>
        ) : (
          <span className="text-xs text-emerald-800/70">No letter attached</span>
        )}
        <span className="ml-auto flex gap-3 text-xs">
          <button type="button" className="text-emerald-800 hover:underline" onClick={() => setEditing(true)}>
            {freeze.doc_name ? "Edit" : "Edit or attach letter"}
          </button>
          <button
            type="button"
            className="text-stone-500 hover:text-red-700"
            onClick={async () => {
              if (!confirm("Remove this confirmation and delete the stored letter? The agency stays marked as frozen.")) return;
              await api(url, { method: "DELETE" });
              await reload();
            }}
          >
            Remove
          </button>
        </span>
      </div>
    );
  }

  return (
    <button type="button" className="basis-full text-left text-xs font-medium text-emerald-700 hover:underline" onClick={() => setEditing(true)}>
      + Add freeze confirmation (date, confirmation number, letter)
    </button>
  );
}
