"use client";
import { useCallback, useEffect, useState } from "react";
import { clientSteps, keyDates } from "@/lib/steps";
import { BUREAUS, CATEGORY_LABEL, LETTER_TYPES, STATUS_LABEL, canMail, CFPB_URL, type ClientBundle, type ItemStatus, type Letter } from "@/lib/types";
import { STATUS_TONE } from "./ItemsTab";
import { ClientFreezes } from "./ClientFreezes";
import { ReportUpload } from "./ReportUpload";
import { ScoreCard } from "./ScoreCard";
import { SignatureCard } from "./SignatureCard";
import { ProgressSidebar } from "./ProgressSidebar";
import { api, Badge, Button, Card, ErrorNote, fmtDate, inputClass, linkButton } from "./ui";

// Plainer wording than the specialist's working statuses.
const CLIENT_STATUS: Record<ItemStatus, string> = {
  ...STATUS_LABEL,
  identified: "Under review",
  disputed: "Letter ready",
  awaiting_response: "Waiting on reply",
  verified: "Follow-up needed",
};

/** What a signed-in client sees: their own file, read-only apart from uploading reports. */
export function ClientPortal({ id }: { id: number }) {
  const [bundle, setBundle] = useState<ClientBundle | null>(null);
  const [error, setError] = useState("");
  // Set when PayPal sends the client back after paying.
  const [notice] = useState(() => {
    if (typeof window === "undefined") return "";
    const q = new URLSearchParams(window.location.search);
    const p = q.get("payment");
    if (p || q.get("cancelled")) window.history.replaceState(null, "", "/portal");
    return p === "paid" ? "Payment received — your specialist will mail that letter by certified mail." : p === "pending" ? "PayPal hasn't confirmed the payment yet. Use \"check the payment\" on the letter in a moment." : p === "error" || p === "failed" ? "That payment didn't go through. You can try again from the letter." : q.get("cancelled") ? "Payment cancelled. You can pay later or mail the letter yourself." : "";
  });

  const reload = useCallback(async () => {
    try {
      setBundle(await api<ClientBundle>(`/api/clients/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    api<ClientBundle>(`/api/clients/${id}`)
      .then(setBundle)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const analyzing = bundle?.reports.some((r) => r.status === "analyzing");
  useEffect(() => {
    if (!analyzing) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [analyzing, reload]);

  if (error && !bundle) return <ErrorNote>{error}</ErrorNote>;
  if (!bundle) return <p className="text-sm text-stone-500">Loading…</p>;

  const { client, items, letters, reports } = bundle;
  const resolved = items.filter((i) => i.status === "deleted" || i.status === "updated").length;
  const pct = items.length ? Math.round((resolved / items.length) * 100) : 0;
  const toMail = letters.filter((l) => l.status === "draft" && l.type !== "cfpb_complaint");
  const stats = [
    { label: "Items being worked", value: items.length - resolved },
    { label: "Deleted or corrected", value: resolved },
    { label: "Letters to sign & mail", value: toMail.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {client.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-stone-600">Here&apos;s where your credit file stands.</p>
      </div>
      {notice && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
      <Card className="p-5">
        <div className="grid grid-cols-3 gap-5">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-semibold tabular-nums tracking-tight">{s.value}</div>
              <div className="mt-0.5 text-xs text-stone-500">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-medium tabular-nums">{pct}% resolved</span>
        </div>
      </Card>

      <ScoreCard clientId={client.id} scores={bundle.scores} reload={reload} role="client" />

      <div className="grid gap-6 xl:grid-cols-2">
        <div id="reports" className="scroll-mt-6">
        <ReportUpload
          clientId={client.id}
          reports={reports}
          scores={bundle.scores}
          reminders={Boolean(client.report_reminders)}
          reload={reload}
          intro="Upload your latest credit report — a PDF from annualcreditreport.com or your credit monitoring service. New reports every 30–45 days show what changed."
        />
        </div>

        <Card id="letters" className="h-fit scroll-mt-6 p-5">
          <h2 className="font-semibold">Your letters</h2>
          <p className="mt-1 text-sm text-stone-600">
            {bundle.mail.enabled
              ? "Read each letter, then press \u201cApprove & sign\u201d and your specialist will send it by certified mail. Prefer to mail it yourself? Download, print, sign and mail it, then press \u201cI mailed this\u201d."
              : "Download, print, sign, and mail each one — certified mail with a return receipt is best. Keep a copy, then press \u201cI mailed this\u201d so the 30-day reply clock starts."}
          </p>
          {!letters.length && <p className="mt-4 text-sm text-stone-500">No letters yet. They&apos;ll appear here when your specialist has them ready.</p>}
          <ul className="mt-3 divide-y divide-stone-100">
            {letters.map((l) => (
              <LetterRow key={l.id} letter={l} reload={reload} canApprove={bundle.mail.enabled} hasSignature={bundle.signature.onFile} payments={bundle.payments} />
            ))}
          </ul>
          {letters.length > 1 && (
            <a className={`${linkButton(false)} mt-3`} href={`/api/clients/${client.id}/letters/zip?format=pdf`}>
              Download all
            </a>
          )}
        </Card>
      </div>

      {bundle.mail.enabled && <SignatureCard bundle={bundle} reload={reload} />}

      <ClientFreezes clientId={client.id} freezes={bundle.freezes} reload={reload} />

      <Card>
        <h2 className="px-5 pt-5 font-semibold">Accounts we&apos;re working on</h2>
        {!items.length && (
          <p className="px-5 pb-5 pt-2 text-sm text-stone-500">
            Nothing here yet. Upload a credit report and the accounts that can be challenged will be listed.
          </p>
        )}
        <ul className="mt-2 divide-y divide-stone-100">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1 basis-56">
                <div className="font-medium">{i.creditor}</div>
                <div className="text-xs text-stone-500">
                  {CATEGORY_LABEL[i.category] ?? i.category}
                  {i.balance && ` · ${i.balance}`} · {BUREAUS.filter((b) => i.bureaus.includes(b)).join(", ")}
                </div>
              </div>
              <Badge tone={STATUS_TONE[i.status]}>{CLIENT_STATUS[i.status]}</Badge>
            </li>
          ))}
        </ul>
      </Card>
        </div>

        <ProgressSidebar
          title="Your progress"
          steps={clientSteps(bundle)}
          dates={keyDates(bundle, "client")}
          onAction={(step) => document.getElementById(step.target ?? "")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>
    </div>
  );
}

function LetterRow({
  letter: l,
  reload,
  canApprove,
  hasSignature,
  payments,
}: {
  letter: Letter;
  reload: () => Promise<void>;
  canApprove: boolean;
  hasSignature: boolean;
  payments: ClientBundle["payments"];
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [confirming, setConfirming] = useState(false);
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");
  const isCfpb = l.type === "cfpb_complaint";
  const mailable = l.status === "draft";
  const approvable = mailable && canApprove && canMail(l.type) && !l.signed_at;
  // Once approved, the client picks how it gets mailed.
  const choosing = mailable && canApprove && canMail(l.type) && Boolean(l.signed_at);
  const [pay, setPay] = useState<{ approveUrl: string; qr: string; amount: string } | null>(null);
  const [checking, setChecking] = useState(false);

  async function choose(choice: "self" | "service") {
    setError("");
    try {
      await api(`/api/letters/${l.id}/delivery`, { json: { choice } });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function startPayment() {
    setError("");
    try {
      setPay(await api(`/api/letters/${l.id}/payment`, { json: {} }));
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function checkPayment() {
    setChecking(true);
    setError("");
    try {
      const { status } = await api<{ status: string }>(`/api/letters/${l.id}/payment/check`, { json: {} });
      if (status === "pending") setError("PayPal hasn't confirmed the payment yet. Finish the PayPal steps, then check again.");
      if (status === "failed") setError("That payment didn't go through. You can start it again.");
      if (status === "paid") setPay(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
    setChecking(false);
  }
  const feeOn = payments.enabled && payments.feeCents > 0;
  const fee = `$${(payments.feeCents / 100).toFixed(2)}`;

  async function approve() {
    if (!hasSignature) return document.getElementById("signature")?.scrollIntoView({ behavior: "smooth" });
    if (!confirm(`Approve this letter to ${l.recipient_name} and add your signature? Your specialist can then mail it for you.`)) return;
    setError("");
    try {
      await api(`/api/letters/${l.id}/sign`, { json: {} });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function confirmMailed() {
    setError("");
    try {
      await api(`/api/letters/${l.id}/mailed`, { json: { date } });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{l.recipient_name}</div>
          <div className="text-xs text-stone-500">
            {LETTER_TYPES[l.type]?.label ?? l.type}
            {l.status === "sent" && ` · ${isCfpb ? "filed" : "mailed"} ${fmtDate(l.sent_at)}`}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {l.status === "sent" ? (
            <Badge tone="green">{isCfpb ? "Filed" : "Mailed"}</Badge>
          ) : l.signed_at ? (
            <Badge tone="blue">Approved</Badge>
          ) : (
            <Badge tone="amber">{isCfpb ? "File online" : "Needs you"}</Badge>
          )}
          <a className={linkButton()} href={`/api/letters/${l.id}/download?format=pdf`}>
            Download
          </a>
          {approvable && (
            <Button small variant="primary" onClick={approve}>
              {hasSignature ? "Approve & sign" : "Add signature to approve"}
            </Button>
          )}
          {mailable && !canApprove && canMail(l.type) && (
            <Button small disabled title="Certified mailing from the app is coming soon. For now, please print and mail this letter yourself.">
              Mail it for me — coming soon
            </Button>
          )}
          {mailable && !confirming && l.payment_status !== "paid" && l.delivery_choice !== "service" && (
            <Button small variant={approvable || l.signed_at ? "secondary" : "primary"} onClick={() => setConfirming(true)}>
              {isCfpb ? "I filed this" : "I mailed this"}
            </Button>
          )}
        </span>
      </div>
      {isCfpb && l.status === "draft" && (
        <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
          This one isn&apos;t mailed. Download it, open{" "}
          <a className="font-medium text-emerald-700 hover:underline" href={CFPB_URL} target="_blank" rel="noreferrer">
            consumerfinance.gov/complaint ↗
          </a>
          , start a new complaint about credit reporting, and paste the text where it asks what happened. Then press &ldquo;I filed this&rdquo;.
        </p>
      )}
      {choosing && l.payment_status === "paid" && (
        <p className="mt-1.5 text-xs text-emerald-800">
          Paid {`$${(l.paid_cents / 100).toFixed(2)}`} on {fmtDate(l.paid_at)}. Your specialist will send it by certified mail.
        </p>
      )}
      {choosing && l.payment_status !== "paid" && l.delivery_choice === "service" && !feeOn && (
        <p className="mt-1.5 text-xs text-emerald-800">Approved {fmtDate(l.signed_at)}. Your specialist will send it by certified mail.</p>
      )}
      {choosing && l.payment_status !== "paid" && l.delivery_choice === "self" && (
        <p className="mt-1.5 text-xs text-stone-600">
          You chose to mail this yourself: download, print, sign, and send it by certified mail, then press &ldquo;I mailed this&rdquo;.{" "}
          {feeOn && (
            <button className="font-medium text-emerald-700 hover:underline" onClick={() => choose("service")}>
              Changed your mind? Have it mailed for {fee}.
            </button>
          )}
        </p>
      )}
      {choosing && l.payment_status !== "paid" && (l.delivery_choice === "" || (l.delivery_choice === "service" && feeOn)) && (
        <div className="mt-2.5 rounded-lg bg-stone-50 p-3">
          {l.delivery_choice === "" && (
            <>
              <p className="text-sm font-medium">How should this letter be mailed?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button small onClick={() => choose("self")}>
                  I&apos;ll print and mail it myself (free)
                </Button>
                <Button small variant="primary" onClick={() => (feeOn ? startPayment() : choose("service"))}>
                  Mail it for me by certified mail{feeOn ? ` — ${fee}` : ""}
                </Button>
              </div>
            </>
          )}
          {l.delivery_choice === "service" && feeOn && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pay the {fee} mailing fee with PayPal</p>
              {pay ? (
                <div className="flex flex-wrap items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pay.qr} alt="Scan to pay with PayPal on your phone" className="h-36 w-36 rounded border border-stone-200 bg-white" />
                  <div className="space-y-2 text-sm text-stone-600">
                    <p>Scan the code with your phone, or:</p>
                    <a className="inline-flex rounded-md bg-[#0070ba] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#005ea6]" href={pay.approveUrl} target="_blank" rel="noreferrer">
                      Pay {pay.amount} with PayPal ↗
                    </a>
                    <p>
                      When you&apos;re done,{" "}
                      <button className="font-medium text-emerald-700 hover:underline" onClick={checkPayment} disabled={checking}>
                        {checking ? "checking…" : "check the payment"}
                      </button>
                      .
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button small variant="primary" onClick={startPayment}>
                    {l.payment_order_id ? "Continue payment" : `Pay ${fee}`}
                  </Button>
                  {l.payment_order_id && (
                    <Button small onClick={checkPayment} disabled={checking}>
                      {checking ? "Checking…" : "I've paid — check"}
                    </Button>
                  )}
                  <Button small variant="ghost" onClick={() => choose("self")}>
                    Mail it myself instead
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {l.status === "sent" && l.mail_tracking && !l.mail_test && (
        <p className="mt-1.5 text-xs text-stone-500">
          Certified mail {l.mail_tracking}
          {l.delivered_at ? ` · delivered ${fmtDate(l.delivered_at)}` : l.mail_status ? ` · ${l.mail_status}` : ""}
        </p>
      )}
      {error && !confirming && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
      {confirming && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-2.5">
          <label className="flex items-center gap-2 text-stone-700">
            {isCfpb ? "Date filed" : "Date mailed"}
            <input type="date" max={today} className={`${inputClass} !w-auto !py-1`} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <Button small variant="primary" disabled={!date} onClick={confirmMailed}>
            Confirm
          </Button>
          <Button small variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          {error && <span className="text-xs text-red-700">{error}</span>}
        </div>
      )}
    </li>
  );
}
