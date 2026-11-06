"use client";
import { PAYMENT_LABELS, REVIEW_LABELS, reviewStage, evidenceChecklist, reviewError } from "@/lib/review";
import { Fragment, useState } from "react";
import { BUREAUS, CATEGORY_LABEL, ITEM_STATUSES, STATUS_LABEL, type Item, type ItemStatus } from "@/lib/types";
import type { TabProps } from "./ClientWorkspace";
import { DuplicatesPanel } from "./DuplicatesPanel";
import { api, Badge, Button, Card, inputClass, type Tone } from "./ui";

export const STATUS_TONE: Record<ItemStatus, Tone> = {
  identified: "stone",
  disputed: "blue",
  awaiting_response: "amber",
  verified: "red",
  updated: "green",
  deleted: "green",
};
const STRENGTH_TONE: Record<Item["strength"], Tone> = { strong: "green", moderate: "amber", weak: "stone" };

export function ItemsTab({ bundle, reload, onDraft }: TabProps & { onDraft: (ids: number[]) => void }) {
  const { items } = bundle;
  const [open, setOpen] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState("all");
  const [bureau, setBureau] = useState("all");

  const shown = items.filter(
    (i) => (status === "all" || i.status === status) && (bureau === "all" || i.bureaus.includes(bureau as never)),
  );
  const patch = async (id: number, json: Partial<Item>) => {
    await api(`/api/items/${id}`, { method: "PATCH", json });
    await reload();
  };
  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const selectable = shown.filter(i => !reviewError([i]));
  const selectedIds = items.filter(i => checked.has(i.id) && !reviewError([i])).map(i => i.id);
  const allChecked = selectable.length > 0 && selectable.every((i) => checked.has(i.id));

  if (!items.length) {
    return (
      <Card className="px-6 py-14 text-center">
        <p className="font-medium">No negative items yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-stone-600">
          Upload a credit report on the Overview tab. Each negative, inaccurate, or unverified account will appear here
          with the laws that apply, the strongest dispute angle, and next steps.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-semibold">Your evidence-first plan</h2>
        <p className="mt-1 text-sm text-stone-600">Start with Self and Affirm records, then the collection bill and auto-loan accounting. Mortgage accounts start on hold. Open an account below to record payment status, supporting documents and the specific issue before marking it ready.</p>
        <p className="mt-2 text-sm">{items.filter(i => reviewStage(i) === "gather").length} gathering evidence · {items.filter(i => reviewStage(i) === "ready").length} reviewed · {items.filter(i => reviewStage(i) === "hold").length} on hold</p>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputClass} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className={`${inputClass} !w-auto`} value={bureau} onChange={(e) => setBureau(e.target.value)} aria-label="Filter by bureau">
          <option value="all">All bureaus</option>
          {BUREAUS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <span className="text-sm text-stone-500">
          {shown.length} of {items.length}
        </span>
        <DuplicatesPanel clientId={bundle.client.id} items={items} reload={reload} />
        <Button variant="primary" className="ml-auto" disabled={!selectedIds.length} onClick={() => onDraft(selectedIds)}>
          Draft letters for {selectedIds.length || "selected"} →
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="w-10 py-2.5 pl-4">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  onChange={() => setChecked(allChecked ? new Set() : new Set(selectable.map((i) => i.id)))}
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Bureaus</th>
              <th className="px-3 py-2.5 text-right font-medium">Balance</th>
              <th className="px-3 py-2.5 font-medium">Dispute</th>
              <th className="px-3 py-2.5 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {shown.map((i) => (
              <Fragment key={i.id}>
                <tr className={open === i.id ? "bg-stone-50" : "hover:bg-stone-50"}>
                  <td className="py-3 pl-4">
                    <input type="checkbox" aria-label={`Select ${i.creditor}`} disabled={Boolean(reviewError([i]))} checked={checked.has(i.id) && !reviewError([i])} onChange={() => toggle(i.id)} />
                  </td>
                  <td className="px-3 py-3">
                    <button className="text-left" onClick={() => setOpen(open === i.id ? null : i.id)} aria-expanded={open === i.id}>
                      <span className="font-medium hover:underline">{i.creditor}</span>
                      {i.identity_theft && <span className="ml-2 text-xs font-medium text-red-700">ID theft</span>}
                      <span className="block font-mono text-xs text-stone-500">{i.account_number || "—"}</span>
                      <span className="block text-xs text-stone-600">{REVIEW_LABELS[reviewStage(i)]} · {PAYMENT_LABELS[i.payment_status || "unconfirmed"]}</span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-stone-700">{CATEGORY_LABEL[i.category] ?? i.category}</td>
                  <td className="px-3 py-3">
                    <span className="flex gap-1">
                      {BUREAUS.map((b) => (
                        <span
                          key={b}
                          title={`${b}${i.bureaus.includes(b) ? "" : " (not reporting)"}`}
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                            i.bureaus.includes(b) ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-300"
                          }`}
                        >
                          {b.slice(0, 2).toUpperCase()}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{i.balance || "—"}</td>
                  <td className="px-3 py-3">
                    <Badge tone={STRENGTH_TONE[i.strength]}>{i.strength}</Badge>
                  </td>
                  <td className="px-3 py-3 pr-4">
                    <select
                      aria-label={`Status of ${i.creditor}`}
                      value={i.status}
                      onChange={(e) => patch(i.id, { status: e.target.value as ItemStatus })}
                      className={`rounded-full border-0 py-1 pl-2.5 pr-1 text-xs font-medium ${
                        { stone: "bg-stone-100 text-stone-700", blue: "bg-sky-100 text-sky-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", green: "bg-emerald-100 text-emerald-800" }[
                          STATUS_TONE[i.status]
                        ]
                      }`}
                    >
                      {ITEM_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
                {open === i.id && (
                  <tr className="bg-stone-50">
                    <td />
                    <td colSpan={6} className="px-3 pb-5 pr-4">
                      <ItemDetail item={i} patch={patch} reload={reload} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ItemDetail({
  item: i,
  patch,
  reload,
}: {
  item: Item;
  patch: (id: number, json: Partial<Item>) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [notes, setNotes] = useState(i.notes);
  const [payment, setPayment] = useState(i.payment_status || "unconfirmed");
  const [stage, setStage] = useState(reviewStage(i));
  const [evidence, setEvidence] = useState(i.evidence_notes || "");
  const [reviewMessage, setReviewMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function saveReview() {
    setSaving(true);
    setReviewMessage("");
    try {
      await patch(i.id, { payment_status: payment, review_stage: stage, evidence_notes: evidence });
      setReviewMessage("Review saved.");
    } catch (e) {
      setReviewMessage(e instanceof Error ? e.message : "Could not save review.");
    } finally { setSaving(false); }
  }
  const h = "text-xs font-semibold uppercase tracking-wide text-stone-500";

  async function flagTheft(on: boolean) {
    if (
      on &&
      !confirm(
        "Only flag this if the client states the account is the result of identity theft. It unlocks a sworn affidavit signed under penalty of perjury.",
      )
    )
      return;
    await patch(i.id, { identity_theft: on });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4 lg:col-span-2">
        <h3 className="font-semibold">Account review</h3>
        <p className="text-sm text-stone-600">{evidenceChecklist(i)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Payment status you confirmed
            <select className={inputClass} value={payment} onChange={e => setPayment(e.target.value as typeof payment)}>
              {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">Next step
            <select className={inputClass} value={stage} onChange={e => setStage(e.target.value as typeof stage)}>
              {Object.entries(REVIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">Evidence reviewed and proposed request
          <textarea className={inputClass} rows={4} maxLength={12000} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Document/date, bureau and month, reported value, what your records show, and what correction or voluntary request you want. List anything still unknown." />
        </label>
        <p className="text-xs text-stone-500">Record document references here; this field does not upload attachments. Ready means you reviewed the facts, not that removal is guaranteed. Payment status may remain unconfirmed if it is unrelated to the specific issue.</p>
        <Button disabled={saving || (stage === "ready" && !evidence.trim())} onClick={saveReview}>{saving ? "Saving…" : "Save review"}</Button>
        <p role="status" className="text-sm">{reviewMessage}</p>
      </section>
      <div className="space-y-4">
        <div>
          <h3 className={h}>As reported</h3>
          <p className="mt-1 text-stone-700">{i.reported_status || "—"}</p>
          <p className="mt-1 text-xs text-stone-500">
            {[
              i.original_creditor && `Original creditor: ${i.original_creditor}`,
              i.date_opened && `Opened ${i.date_opened}`,
              i.date_of_first_delinquency && `First delinquency ${i.date_of_first_delinquency}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div>
          <h3 className={h}>Findings to verify</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-stone-700">
            {i.issues.map((x, n) => (
              <li key={n}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className={h}>Laws that apply</h3>
          <ul className="mt-1 space-y-1.5">
            {i.laws.map((l, n) => (
              <li key={n} className="text-stone-700">
                <span className="font-medium text-stone-900">{l.citation}</span> — {l.why}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Strongest dispute angle</h3>
          <p className="mt-1 text-stone-800">{i.dispute_angle}</p>
        </div>
        <div>
          <h3 className={h}>Next steps</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-stone-700">
            {i.next_steps.map((x, n) => (
              <li key={n}>{x}</li>
            ))}
          </ol>
        </div>
        <div>
          <label className={h} htmlFor={`notes-${i.id}`}>
            Notes (the agent reads these when drafting)
          </label>
          <textarea
            id={`notes-${i.id}`}
            className={`${inputClass} mt-1`}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== i.notes && patch(i.id, { notes })}
            placeholder="e.g. Client paid this in March 2023 and has the receipt."
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={i.identity_theft} onChange={(e) => flagTheft(e.target.checked)} />
            Client reports this as identity theft
          </label>
          <button
            className="text-xs text-stone-400 hover:text-red-700"
            onClick={async () => {
              if (!confirm(`Remove ${i.creditor} from tracking?`)) return;
              await api(`/api/items/${i.id}`, { method: "DELETE" });
              await reload();
            }}
          >
            Remove item
          </button>
        </div>
      </div>
    </div>
  );
}
