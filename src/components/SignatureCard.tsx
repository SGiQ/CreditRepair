"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { ClientBundle } from "@/lib/types";
import { SignaturePad } from "./SignaturePad";
import { api, Button, Card, ErrorNote, fmtDate } from "./ui";

/** Client portal: save a signature once, then approve letters individually. */
export function SignatureCard({ bundle, reload }: { bundle: ClientBundle; reload: () => Promise<void> }) {
  const { client, signature } = bundle;
  const [png, setPng] = useState("");
  const [consent, setConsent] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      await api(`/api/clients/${client.id}/signature`, { json: { image: png, consent } });
      setReplacing(false);
      setPng("");
      setConsent(false);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm("Remove your signature? Letters you approved that haven't been mailed yet will need approving again.")) return;
    await api(`/api/clients/${client.id}/signature`, { method: "DELETE" });
    await reload();
  }

  return (
    <Card id="signature" className="scroll-mt-6 p-5">
      <h2 className="font-semibold">Your signature</h2>
      <p className="mt-1 text-sm text-stone-600">
        Save your signature once. It is only added to a letter when you press &ldquo;Approve &amp; sign&rdquo; on that
        letter, so your specialist can send it by certified mail for you.
      </p>
      {signature.onFile && !replacing ? (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          {signature.image && <img src={signature.image} alt="Your saved signature" className="h-20 rounded-lg border border-stone-200 bg-white px-3" />}
          <div className="text-sm">
            <p className="text-stone-600">Saved {fmtDate(signature.at)}</p>
            <div className="mt-2 flex gap-2">
              <Button small onClick={() => setReplacing(true)}>
                Replace
              </Button>
              <Button small variant="ghost" onClick={remove}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 max-w-md space-y-3">
          <SignaturePad onChange={setPng} />
          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I authorize my specialist to place this signature on the letters I approve and to mail those letters on my behalf.</span>
          </label>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2">
            <Button variant="primary" disabled={!png || !consent} onClick={save}>
              Save signature
            </Button>
            {replacing && (
              <Button variant="ghost" onClick={() => setReplacing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
