"use client";
import { useState } from "react";
import type { Client } from "@/lib/types";
import { api, Button, ErrorNote, Field } from "./ui";

const EMPTY = { name: "", address1: "", address2: "", city: "", state: "", zip: "", dob: "", ssn_last4: "", phone: "", email: "" };

export function ClientForm({
  client,
  onSaved,
  onCancel,
}: {
  client?: Client;
  onSaved: (id: number) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...(client ?? {}) }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof EMPTY) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (client) {
        await api(`/api/clients/${client.id}`, { method: "PATCH", json: f });
        onSaved(client.id);
      } else {
        const { id } = await api<{ id: number }>("/api/clients", { json: f });
        onSaved(id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Field label="Full legal name" required className="col-span-2 sm:col-span-3" {...bind("name")} />
        <Field label="Date of birth" placeholder="MM/DD/YYYY" className="sm:col-span-2" {...bind("dob")} />
        <Field label="SSN (last 4 only)" maxLength={4} inputMode="numeric" pattern="\d{4}" {...bind("ssn_last4")} />
        <Field label="Street address" className="col-span-2 sm:col-span-4" {...bind("address1")} />
        <Field label="Apt / unit" className="col-span-2" {...bind("address2")} />
        <Field label="City" className="col-span-2 sm:col-span-3" {...bind("city")} />
        <Field label="State" maxLength={2} {...bind("state")} />
        <Field label="ZIP" className="sm:col-span-2" {...bind("zip")} />
        <Field label="Phone" className="sm:col-span-3" {...bind("phone")} />
        <Field label="Email" type="email" className="sm:col-span-3" {...bind("email")} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy}>
          {client ? "Save changes" : "Add client"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
