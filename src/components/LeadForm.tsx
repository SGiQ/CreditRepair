"use client";
import { useState } from "react";
import { api, Button, ErrorNote, Field, inputClass } from "./ui";

export function LeadForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }) });

  if (sent) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-semibold">Thanks, {f.name.split(" ")[0]}. We got your message.</p>
        <p className="mt-1">We&apos;ll reply to {f.email} within one business day.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("/api/leads", { json: f });
          setSent(true);
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name" required autoComplete="name" {...bind("name")} />
        <Field label="Email" type="email" required autoComplete="email" {...bind("email")} />
      </div>
      <Field label="Phone (optional)" type="tel" autoComplete="tel" {...bind("phone")} />
      <label className="block text-xs font-medium text-stone-600">
        What&apos;s going on with your credit? (optional)
        <textarea className={`${inputClass} mt-1 font-normal text-stone-900`} rows={3} maxLength={2000} {...bind("message")} />
      </label>
      {/* Spam trap: hidden from people, filled in by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden {...bind("website")} />
      <ErrorNote>{error}</ErrorNote>
      <Button variant="primary" className="w-full sm:w-auto" disabled={busy}>
        {busy ? "Sending…" : "Request a consultation"}
      </Button>
      <p className="text-xs text-stone-500">We only use this to reply to you.</p>
    </form>
  );
}
