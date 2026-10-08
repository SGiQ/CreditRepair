"use client";
import { useEffect, useState } from "react";
import { BUREAUS, canMail, CATEGORY_LABEL, CFPB_URL, hasReplyClock, LETTER_TYPES, type Bureau, type ClientBundle, type Item, type Letter, type LetterType } from "@/lib/types";
import type { TabProps } from "./ClientWorkspace";
import { daysLeft } from "./OverviewTab";
import { api, Badge, Button, Card, ErrorNote, Field, fmtDate, inputClass, linkButton, Spinner } from "./ui";

type DraftType = Exclude<LetterType, "freeze_request">;
const DRAFT_TYPES = (Object.keys(LETTER_TYPES) as LetterType[]).filter((t): t is DraftType => t !== "freeze_request");
const STAGES = ["Dispute", "Follow-up", "Escalation", "Affidavit"];

/** Which open items each letter type is normally written about. */
const DEFAULT_PICK: Record<DraftType, (i: Item) => boolean> = {
  bureau_dispute: (i) => !["inquiry", "personal_info"].includes(i.category) && ["identified", "disputed"].includes(i.status),
  debt_validation: (i) => i.category === "collection",
  furnisher_dispute: (i) => ["charge_off", "late_payment", "repossession", "foreclosure"].includes(i.category),
  inquiry_removal: (i) => i.category === "inquiry",
  personal_info: (i) => i.category === "personal_info",
  method_of_verification: (i) => i.status === "verified",
  no_response: (i) => i.status === "awaiting_response",
  final_notice: (i) => i.status === "verified" || i.status === "awaiting_response",
  cfpb_complaint: (i) => i.status === "verified" || i.status === "awaiting_response",
  identity_theft_affidavit: (i) => i.identity_theft,
};

export function LettersTab({ bundle, reload, picked }: TabProps & { picked: number[] | null }) {
  const { client, items, letters } = bundle;
  const open = items.filter((i) => i.status !== "deleted" && i.status !== "updated");
  const pick = (t: DraftType) => new Set(open.filter(DEFAULT_PICK[t]).map((i) => i.id));

  const [type, setType] = useState<DraftType>("bureau_dispute");
  const [sel, setSel] = useState<Set<number>>(() => (picked?.length ? new Set(picked) : pick("bureau_dispute")));
  const [bureaus, setBureaus] = useState<Set<Bureau>>(new Set(BUREAUS));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const spec = LETTER_TYPES[type];
  const perBureau = spec.to === "bureau" || spec.to === "cfpb";
  const chosen = open.filter((i) => sel.has(i.id) && (type !== "identity_theft_affidavit" || i.identity_theft));
  const count = perBureau ? BUREAUS.filter((b) => bureaus.has(b) && chosen.some((i) => i.bureaus.includes(b))).length : chosen.length;
  const ready = letters.filter((l) => l.status === "draft" || l.status === "sent");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/clients/${client.id}/letters`, { json: { type, itemIds: [...sel], bureaus: [...bureaus] } });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const flip = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (!next.delete(v)) next.add(v);
    return next;
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="h-fit space-y-4 p-5">
        <h2 className="font-semibold">Draft letters</h2>
        <label className="block text-xs font-medium text-stone-600">
          Letter type
          <select
            className={`${inputClass} mt-1 font-normal text-stone-900`}
            value={type}
            onChange={(e) => {
              const t = e.target.value as DraftType;
              setType(t);
              setSel(pick(t));
            }}
          >
            {STAGES.map((stage) => (
              <optgroup key={stage} label={stage}>
                {DRAFT_TYPES.filter((t) => LETTER_TYPES[t].stage === stage).map((t) => (
                  <option key={t} value={t}>
                    {LETTER_TYPES[t].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="text-sm text-stone-600">{spec.desc}</p>

        {perBureau && (
          <fieldset>
            <legend className="text-xs font-medium text-stone-600">Send to</legend>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {BUREAUS.map((b) => (
                <label key={b} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={bureaus.has(b)} onChange={() => setBureaus(flip(bureaus, b))} />
                  {b}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-stone-500">All three at once, or untick to work one bureau at a time.</p>
          </fieldset>
        )}

        <fieldset>
          <legend className="flex w-full items-center justify-between text-xs font-medium text-stone-600">
            <span>Items to include ({sel.size})</span>
            <button type="button" className="text-emerald-700 hover:underline" onClick={() => setSel(sel.size ? new Set() : new Set(open.map((i) => i.id)))}>
              {sel.size ? "Clear" : "Select all"}
            </button>
          </legend>
          <div className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-stone-200 p-1.5">
            {!open.length && <p className="p-2 text-sm text-stone-500">No open items. Upload a report first.</p>}
            {open.map((i) => {
              const blocked = type === "identity_theft_affidavit" && !i.identity_theft;
              return (
                <label key={i.id} className={`flex items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-stone-50 ${blocked ? "opacity-40" : ""}`}>
                  <input type="checkbox" className="mt-1" disabled={blocked} checked={sel.has(i.id) && !blocked} onChange={() => setSel(flip(sel, i.id))} />
                  <span className="min-w-0">
                    <span className="block truncate">{i.creditor}</span>
                    <span className="block text-xs text-stone-500">
                      {CATEGORY_LABEL[i.category]} · {i.bureaus.map((b) => b.slice(0, 2).toUpperCase()).join(" ")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {type === "identity_theft_affidavit" && (
            <p className="mt-1.5 text-xs text-stone-500">Only items flagged as identity theft on the Negative items tab can be included.</p>
          )}
        </fieldset>

        <ErrorNote>{error}</ErrorNote>
        <Button variant="primary" className="w-full" disabled={busy || !count} onClick={generate}>
          {busy ? <Spinner /> : null}
          {count ? `Draft ${count} ${count === 1 ? "document" : "documents"}` : "Nothing to draft"}
        </Button>
        {!client.address1 && <p className="text-xs text-amber-700">Add the client&apos;s mailing address on the Overview tab so it prints on the letters.</p>}
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Letters & affidavits</h2>
          {ready.length > 0 && (
            <div className="flex gap-2">
              <a className={linkButton(false)} href={`/api/clients/${client.id}/letters/zip?format=pdf`}>
                Download all · PDF
              </a>
              <a className={linkButton(false)} href={`/api/clients/${client.id}/letters/zip?format=docx`}>
                Download all · Word
              </a>
            </div>
          )}
        </div>
        {bundle.mail.mode !== "live" && (
          <p className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
            {bundle.mail.mode === "off" && (
              <>
                <strong>Certified-mail sending is off.</strong> Add <code className="font-mono">LOB_API_KEY</code> to{" "}
                <code className="font-mono">.env.local</code> to mail approved letters from here. Until then, download and mail them.
              </>
            )}
            {bundle.mail.mode === "test" && (
              <>
                <strong>Lob test key in use.</strong> Sends are checked by Lob but nothing is printed, mailed or billed. Switch to
                your live key to mail for real.
              </>
            )}
            {bundle.mail.mode === "demo" && (
              <>
                <strong>Mail demo mode.</strong> Sends are simulated and &ldquo;deliver&rdquo; in about two minutes. Nothing is
                mailed or billed.
              </>
            )}
          </p>
        )}
        {!letters.length && (
          <Card className="px-6 py-12 text-center text-sm text-stone-600">
            Nothing drafted yet. Choose a letter type and items, and the agent writes one for each recipient.
          </Card>
        )}
        {letters.map((l) => (
          <LetterCard key={`${l.id}-${l.status}`} letter={l} bundle={bundle} reload={reload} />
        ))}
      </div>
    </div>
  );
}

function LetterCard({ letter: l, bundle, reload }: { letter: Letter; bundle: ClientBundle; reload: () => Promise<void> }) {
  const { items, mail, access, client, notifications = [], payments } = bundle;
  const feeOn = payments.feeCents > 0;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const emailed = notifications.filter((n) => n.letter_id === l.id && n.kind.startsWith("delivered"));
  const first = client.name.split(" ")[0];
  const mailable = mail.enabled && l.status === "draft" && canMail(l.type);
  const isCfpb = l.type === "cfpb_complaint";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(l);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const covered = items.filter((i) => l.item_ids.includes(i.id));
  const dirty = (["recipient_name", "recipient_address", "subject", "body"] as const).some((k) => draft[k] !== l[k]);
  const deadline = l.status === "sent" && l.sent_at && hasReplyClock(l.type) ? daysLeft(l) : null;

  const patch = async (json: Partial<Letter>) => {
    await api(`/api/letters/${l.id}`, { method: "PATCH", json });
    await reload();
  };
  const remove = async () => {
    if (!confirm(`Delete this ${LETTER_TYPES[l.type]?.label ?? "letter"} to ${l.recipient_name}?`)) return;
    await api(`/api/letters/${l.id}`, { method: "DELETE" });
    await reload();
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{l.recipient_name}</span>
            {l.status === "generating" && (
              <Badge tone="blue">
                <span className="mr-1.5 flex">
                  <Spinner />
                </span>
                Drafting
              </Badge>
            )}
            {l.status === "draft" && <Badge>Draft</Badge>}
            {l.status === "sent" && <Badge tone="green">{isCfpb ? "Filed" : "Sent"} {fmtDate(l.sent_at)}</Badge>}
            {l.status === "error" && <Badge tone="red">Failed</Badge>}
            {deadline && !l.response && (
              <Badge tone={deadline.left < 0 ? "red" : deadline.left <= 7 ? "amber" : "stone"}>
                {deadline.left < 0 ? `${-deadline.left} days overdue` : `Reply due ${fmtDate(deadline.due)}`}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-sm text-stone-600">
            {LETTER_TYPES[l.type]?.label ?? l.type} · Round {l.round}
            {covered.length > 0 && ` · ${covered.map((i) => i.creditor).join(", ")}`}
          </div>
          {l.status === "error" && <p className="mt-1 text-sm text-red-700">{l.error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(l.status === "draft" || l.status === "sent") && (
            <>
              <Button
                small
                onClick={() => {
                  // Start the editor from the letter as it is now: it may have been opened while still being written.
                  if (!open) setDraft(l);
                  setOpen(!open);
                }}
                aria-expanded={open}
              >
                {open ? "Close" : "Review & edit"}
              </Button>
              <a className={linkButton()} href={`/api/letters/${l.id}/download?format=pdf`}>
                PDF
              </a>
              <a className={linkButton()} href={`/api/letters/${l.id}/download?format=docx`}>
                Word
              </a>
            </>
          )}
          {l.status === "draft" && (
            <Button small variant={mailable && l.signed_at ? "secondary" : "primary"} onClick={() => patch({ status: "sent" })}>
              {isCfpb ? "Mark filed" : "Mark sent"}
            </Button>
          )}
          {mailable && l.signed_at && !sending && (
            <Button small variant="primary" onClick={() => setSending(true)}>
              Send certified mail
            </Button>
          )}
          <Button small variant="ghost" onClick={remove} aria-label="Delete letter">
            Delete
          </Button>
        </div>
      </div>

      {isCfpb && l.status === "draft" && (
        <p className="mt-2 text-xs text-stone-500">
          Not mailed: {first} pastes this into the form at{" "}
          <a className="text-emerald-700 hover:underline" href={CFPB_URL} target="_blank" rel="noreferrer">
            consumerfinance.gov/complaint ↗
          </a>{" "}
          and files it themselves. It shows in their login with filing instructions. Mark it filed once they have.
        </p>
      )}
      {mailable && !l.signed_at && (
        <p className="mt-2 text-xs text-stone-500">
          To send from the app: {access?.status === "active" ? `waiting for ${first} to approve and sign this letter in their login.` : `${first} needs a client login to approve and sign it (Overview tab → Client login).`}
        </p>
      )}
      {mailable && l.signed_at && !sending && (
        <p className="mt-2 text-xs text-emerald-800">
          Approved and signed by {first} on {fmtDate(l.signed_at)}.
          {l.payment_status === "paid" && ` Mailing fee ${money(l.paid_cents)} paid ${fmtDate(l.paid_at)}.`}
          {l.payment_status !== "paid" && l.delivery_choice === "self" && ` ${first} chose to print and mail it themselves.`}
          {l.payment_status !== "paid" && l.delivery_choice === "service" && feeOn && ` ${first} chose certified mail; the ${money(payments.feeCents)} fee is unpaid.`}
          {l.payment_status !== "paid" && l.delivery_choice === "" && feeOn && ` Waiting for ${first} to choose self-mail or pay the ${money(payments.feeCents)} fee.`}
          {l.mail_test && l.mail_id ? " A test send was accepted; nothing was mailed." : ""}
        </p>
      )}
      {sending && <SendPanel letter={l} mode={mail.mode} feeCents={payments.feeCents} onClose={() => setSending(false)} reload={reload} />}

      {l.mail_id && l.status === "sent" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <span className="font-medium">Certified mail</span>
          {l.mail_test && <Badge tone="amber">Simulated — not mailed</Badge>}
          <span className="text-stone-700">{l.delivered_at ? `Delivered ${fmtDate(l.delivered_at)}` : l.mail_status || "Processing"}</span>
          {l.mail_tracking &&
            (l.mail_test ? (
              <span className="font-mono text-xs text-stone-500">{l.mail_tracking}</span>
            ) : (
              <a className="font-mono text-xs text-emerald-700 hover:underline" target="_blank" rel="noreferrer" href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(l.mail_tracking)}`}>
                {l.mail_tracking} ↗
              </a>
            ))}
          {!l.delivered_at && l.mail_expected && <span className="text-xs text-stone-500">expected {fmtDate(l.mail_expected)}</span>}
          {l.mail_preview && (
            <a className="text-xs text-emerald-700 hover:underline" target="_blank" rel="noreferrer" href={l.mail_preview}>
              Printed proof ↗
            </a>
          )}
          {l.delivered_at && emailed.length > 0 && (
            <span className="text-xs text-stone-500" title={emailed.map((n) => `${n.recipient}: ${n.status}`).join("\n")}>
              · {emailed.some((n) => n.status === "failed") ? "Some delivery emails failed" : `Delivery ${emailed.length === 1 ? "email" : "emails"} ${emailed[0].status === "logged" ? "logged (demo)" : "sent"} to ${emailed.map((n) => n.recipient).join(", ")}`}
            </span>
          )}
          {!l.delivered_at && (
            <button
              className="ml-auto text-xs text-stone-500 hover:text-stone-900"
              onClick={async () => {
                await api(`/api/letters/${l.id}/tracking`, { json: {} }).catch(() => {});
                await reload();
              }}
            >
              Refresh tracking
            </button>
          )}
        </div>
      )}

      {l.status === "sent" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-100 pt-3 text-sm">
          <label className="flex items-center gap-2 text-stone-600">
            {isCfpb ? "Filed" : "Mailed"}
            <input type="date" className={`${inputClass} !w-auto !py-1`} value={l.sent_at} onChange={(e) => e.target.value && patch({ sent_at: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-stone-600">
            Outcome
            <select className={`${inputClass} !w-auto !py-1`} value={l.response} onChange={(e) => patch({ response: e.target.value as Letter["response"] })}>
              <option value="">Waiting…</option>
              <option value="deleted">{isCfpb ? "Company deleted the items" : "Items deleted"}</option>
              <option value="updated">Items corrected</option>
              <option value="verified">Came back verified</option>
              <option value="no_response">No response</option>
            </select>
          </label>
          <button className="text-xs text-stone-400 hover:text-stone-700" onClick={() => patch({ status: "draft" })}>
            {isCfpb ? "Undo filed" : "Undo sent"}
          </button>
          {l.response && <span className="text-xs text-stone-500">Update each item&apos;s status on the Negative items tab to match.</span>}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recipient" value={draft.recipient_name} onChange={(e) => setDraft({ ...draft, recipient_name: e.target.value })} />
            <Field label="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </div>
          {l.type !== "cfpb_complaint" && (
            <label className="block text-xs font-medium text-stone-600">
              Recipient mailing address
              <textarea
                className={`${inputClass} mt-1 font-normal text-stone-900`}
                rows={3}
                value={draft.recipient_address}
                onChange={(e) => setDraft({ ...draft, recipient_address: e.target.value })}
              />
            </label>
          )}
          <label className="block text-xs font-medium text-stone-600">
            Body
            <textarea
              className={`${inputClass} mt-1 font-serif text-[15px] font-normal leading-relaxed text-stone-900`}
              rows={18}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          {l.enclosures.length > 0 && (
            <p className="text-sm text-stone-600">
              <span className="font-medium text-stone-800">Enclose:</span> {l.enclosures.join("; ")}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              disabled={!dirty || saving}
              onClick={async () => {
                setSaving(true);
                await patch({
                  recipient_name: draft.recipient_name,
                  recipient_address: draft.recipient_address,
                  subject: draft.subject,
                  body: draft.body,
                });
                setSaving(false);
              }}
            >
              Save edits
            </Button>
            <a className={linkButton(false)} href={`/api/letters/${l.id}/download?format=pdf&inline`} target="_blank" rel="noreferrer">
              Preview PDF ↗
            </a>
            {dirty && (
            <span className="text-xs text-amber-700">
              Unsaved changes — save before downloading.{l.signed_at ? ` Saving removes ${first}'s approval; they will need to approve the new text.` : ""}
            </span>
          )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Checks the letter with the server, shows exactly what will go out, and only sends on an explicit confirm. */
function SendPanel({ letter: l, mode, feeCents, onClose, reload }: { letter: Letter; mode: ClientBundle["mail"]["mode"]; feeCents: number; onClose: () => void; reload: () => Promise<void> }) {
  const feeDue = feeCents > 0 && l.payment_status !== "paid";
  const [waive, setWaive] = useState(false);
  type Check = { pages: number; to: { name: string; company?: string; line1: string; line2?: string; city: string; state: string; zip: string } };
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Check>(`/api/letters/${l.id}/mail`, { json: { preview: true } })
      .then(setCheck)
      .catch((e: Error) => setError(e.message));
  }, [l.id]);

  async function send() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/letters/${l.id}/mail`, { json: { returnReceipt: receipt, waiveFee: waive } });
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <p className="font-medium">Send by USPS Certified Mail</p>
      {check && (
        <>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-stone-500">Mailing to</div>
              <address className="not-italic leading-snug text-stone-800">
                {[check.to.name, check.to.company, check.to.line1, check.to.line2].filter(Boolean).map((x) => (
                  <span key={x} className="block">
                    {x}
                  </span>
                ))}
                {check.to.city}, {check.to.state} {check.to.zip}
              </address>
            </div>
            <div className="text-stone-700">
              <div className="text-xs font-medium text-stone-500">What goes out</div>
              {check.pages} {check.pages === 1 ? "page" : "pages"}, black and white, single-sided, signed, plus the certified-mail cover sheet. The return address is the client&apos;s.
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={receipt} onChange={(e) => setReceipt(e.target.checked)} />
            Add electronic return receipt (recipient&apos;s signature; costs extra)
          </label>
          {feeDue && (
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
              <input type="checkbox" className="mt-0.5" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
              <span>
                The client hasn&apos;t paid the ${(feeCents / 100).toFixed(2)} mailing fee. Send anyway without charging them.
              </span>
            </label>
          )}
          {feeCents > 0 && l.payment_status === "paid" && <p className="text-xs text-emerald-800">Mailing fee ${(l.paid_cents / 100).toFixed(2)} received.</p>}
          <p className="text-xs text-stone-700">
            {mode === "live" && "This prints and mails a real letter. Lob bills your account at your plan's certified-mail rate, and it can't be recalled from here once sent."}
            {mode === "test" && "Test key: Lob checks the request and makes a proof, but nothing is printed, mailed or billed. The letter stays a draft."}
            {mode === "demo" && "Demo mode: this is simulated. Nothing is mailed or billed."}
          </p>
        </>
      )}
      {!check && !error && <p className="text-stone-600">Checking the letter and addresses…</p>}
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button small variant="primary" disabled={!check || busy || (feeDue && !waive)} onClick={send}>
          {busy ? <Spinner /> : null}
          {mode === "live" ? "Mail it now" : mode === "test" ? "Run test send" : "Simulate send"}
        </Button>
        <Button small variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
