"use client";
import { useState } from "react";
import { SECONDARY_AGENCIES } from "@/lib/agencies";
import type { Freeze } from "@/lib/types";
import { api, Badge, Button, Card, ErrorNote, fmtDate, inputClass } from "./ui";

/** Client portal: freeze each secondary agency online, then record the confirmation here. */
export function ClientFreezes({ clientId, freezes, reload }: { clientId: number; freezes: Freeze[]; reload: () => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  const frozen = SECONDARY_AGENCIES.filter((a) => freezes.find((f) => f.agency === a.key)?.status === "frozen").length;

  return (
    <Card id="freezes" className="scroll-mt-6">
      <div className="px-5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Security freezes</h2>
          <span className="text-sm tabular-nums text-stone-500">
            {frozen} of {SECONDARY_AGENCIES.length} frozen
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          These smaller credit agencies hold data lenders also check. Freezing them is free. Use each agency&apos;s link, and when
          they confirm the freeze (on screen or by letter), record it here so your specialist knows.
        </p>
      </div>
      <ul className="mt-3 divide-y divide-stone-100">
        {SECONDARY_AGENCIES.map((a) => {
          const f = freezes.find((x) => x.agency === a.key);
          return (
            <li key={a.key} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="min-w-0 flex-1 basis-48 font-medium">{a.name}</span>
                {f?.status === "frozen" ? (
                  <Badge tone="green">Frozen{f.confirmed_on ? ` ${fmtDate(f.confirmed_on)}` : ""}</Badge>
                ) : f?.status === "requested" ? (
                  <Badge tone="amber">Requested</Badge>
                ) : (
                  <Badge>Not yet</Badge>
                )}
                <a href={a.url} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">
                  {a.online ? "Freeze online ↗" : "Freeze form ↗"}
                </a>
                {open !== a.key && (
                  <Button small onClick={() => setOpen(a.key)}>
                    {f?.confirmed_on ? "Update confirmation" : "I froze it — add confirmation"}
                  </Button>
                )}
              </div>
              {f?.confirmed_on && open !== a.key && (
                <p className="mt-1 text-xs text-stone-500">
                  Confirmed {fmtDate(f.confirmed_on)}
                  {f.confirmation_number ? ` · Confirmation # ${f.confirmation_number}` : ""}
                  {f.doc_name ? " · Letter on file" : ""}
                </p>
              )}
              {open === a.key && (
                <ConfirmForm
                  url={`/api/clients/${clientId}/freezes/${a.key}`}
                  initialDate={f?.confirmed_on}
                  initialNumber={f?.confirmation_number}
                  onDone={async () => {
                    setOpen(null);
                    await reload();
                  }}
                  onCancel={() => setOpen(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ConfirmForm({
  url,
  initialDate,
  initialNumber,
  onDone,
  onCancel,
}: {
  url: string;
  initialDate?: string;
  initialNumber?: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [date, setDate] = useState(initialDate || today);
  const [number, setNumber] = useState(initialNumber ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-2 space-y-2 rounded-lg bg-stone-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const body = new FormData();
          body.append("confirmed_on", date);
          body.append("confirmation_number", number);
          if (file) body.append("file", file);
          await api(url, { method: "POST", body });
          await onDone();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-stone-600">
          Date the freeze was placed
          <input type="date" required max={today} className={`${inputClass} mt-1 !w-40 font-normal`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Confirmation number <span className="font-normal text-stone-400">(if shown)</span>
          <input className={`${inputClass} mt-1 !w-44 font-normal`} maxLength={60} value={number} onChange={(e) => setNumber(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Confirmation letter or screenshot <span className="font-normal text-stone-400">(optional)</span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="mt-1 block text-xs font-normal" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <p className="text-xs text-amber-800">
        Never type your freeze PIN here, and keep it somewhere safe. If your letter shows the PIN, cover it before taking the
        photo or scan. Only your specialist can open uploaded letters.
      </p>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button small variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button small type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
