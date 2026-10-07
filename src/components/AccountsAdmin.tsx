"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, Badge, Button, Card, ErrorNote, Field, fmtDate, inputClass } from "./ui";

interface Notifications {
  email: { enabled: boolean; mode: string; from: string };
  mail: { enabled: boolean; mode: string };
  webhook: boolean;
  recent: { id: number; kind: string; recipient: string; subject: string; status: string; error: string; created_at: string; client_name: string | null; client_id: number | null }[];
}

interface Backups {
  config: { hour: number; encrypted: boolean; remote: string | null; keepDays: number };
  recent: { id: number; created_at: string; filename: string; bytes: number; destination: string; status: string; error: string }[];
}

interface Accounts {
  me: number;
  admins: { id: number; email: string; created_at: string }[];
  clients: { id: number; email: string; created_at: string; client_id: number; name: string }[];
  invites: { client_id: number; name: string; email: string; expires_at: string }[];
}

export function AccountsAdmin() {
  const [data, setData] = useState<Accounts | null>(null);
  const [notes, setNotes] = useState<Notifications | null>(null);
  const [backups, setBackups] = useState<Backups | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const loadBackups = () =>
    api<Backups>("/api/backup")
      .then(setBackups)
      .catch(() => {});
  const [resetLink, setResetLink] = useState<{ id: number; link: string; minutes: number } | null>(null);

  async function makeResetLink(id: number) {
    setError("");
    try {
      const { token, minutes } = await api<{ token: string; minutes: number }>(`/api/accounts/${id}/reset-link`, { json: {} });
      setResetLink({ id, link: `${window.location.origin}/reset/${token}`, minutes });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const resetBox = (id: number) =>
    resetLink?.id === id && (
      <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <p className="font-medium text-emerald-900">Send them this link — it works once, for {resetLink.minutes} minutes, and is only shown now.</p>
        <input readOnly className={`${inputClass} mt-2 font-mono !text-xs`} value={resetLink.link} onFocus={(e) => e.target.select()} aria-label="Reset link" />
      </div>
    );
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api<Accounts>("/api/accounts")
        .then(setData)
        .catch((e: Error) => setError(e.message)),
    [],
  );
  useEffect(() => {
    api<Accounts>("/api/accounts")
      .then(setData)
      .catch((e: Error) => setError(e.message));
    api<Notifications>("/api/notifications")
      .then(setNotes)
      .catch(() => {});
    api<Backups>("/api/backup")
      .then(setBackups)
      .catch(() => {});
  }, []);

  async function remove(id: number, label: string) {
    if (!confirm(`Remove ${label}? They will be signed out and can no longer sign in.`)) return;
    setError("");
    try {
      await api(`/api/accounts/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <p className="text-sm text-stone-500">Loading…</p>;
  const row = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-stone-600">Who can sign in, and what they can see.</p>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="px-5 pt-5">
            <h2 className="font-semibold">Admins</h2>
            <p className="mt-1 text-sm text-stone-600">Admins see every client&apos;s file and can draft, edit, and delete.</p>
          </div>
          <ul className="mt-3 divide-y divide-stone-100 border-t border-stone-100">
            {data.admins.map((a) => (
              <li key={a.id} className={row}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.email}</span>
                  <span className="text-xs text-stone-500">Added {fmtDate(a.created_at)}</span>
                </span>
                {a.id === data.me ? (
                  <Badge tone="green">You</Badge>
                ) : (
                  <span className="flex items-center gap-3">
                    <button className="text-xs text-stone-500 hover:text-stone-900" onClick={() => makeResetLink(a.id)}>
                      Reset link
                    </button>
                    <button className="text-xs text-stone-400 hover:text-red-700" onClick={() => remove(a.id, a.email)}>
                      Remove
                    </button>
                  </span>
                )}
                {resetBox(a.id)}
              </li>
            ))}
          </ul>
          <div className="border-t border-stone-100 p-5">
            <CredentialForm
              title="Add an admin"
              submit="Add admin"
              done="Admin account created. They can sign in now."
              fields={[
                { key: "email", label: "Email", type: "email", autoComplete: "off" },
                { key: "password", label: "Password (10+ characters)", type: "password", autoComplete: "new-password" },
              ]}
              onSubmit={async (v) => {
                await api("/api/accounts", { json: v });
                await load();
              }}
            />
          </div>
        </Card>

        <Card className="h-fit p-5">
          <CredentialForm
            title="Change your password"
            submit="Change password"
            done="Password changed. Other devices have been signed out."
            fields={[
              { key: "current", label: "Current password", type: "password", autoComplete: "current-password" },
              { key: "password", label: "New password (10+ characters)", type: "password", autoComplete: "new-password" },
            ]}
            onSubmit={(v) => api("/api/auth/password", { json: v })}
          />
        </Card>
      </div>

      <Card>
        <div className="px-5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Email notifications</h2>
            {notes && (
              <Badge tone={notes.email.mode === "off" ? "stone" : notes.email.mode === "demo" ? "amber" : "green"}>
                {notes.email.mode === "off" ? "Not configured" : notes.email.mode === "demo" ? "Demo — logged, not sent" : `On via ${notes.email.mode === "smtp" ? "SMTP" : "Resend"}`}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-600">
            When a certified letter is confirmed delivered, the client and every admin get an email with the delivery date and
            the 30-day reply deadline.
            {notes?.email.mode === "off" && (
              <>
                {" "}
                To turn it on, add <code className="font-mono">MAIL_FROM</code> plus either <code className="font-mono">RESEND_API_KEY</code>{" "}
                or <code className="font-mono">SMTP_URL</code> to <code className="font-mono">.env.local</code> and restart.
              </>
            )}
            {notes?.email.from && notes.email.mode !== "off" && <> Sent from {notes.email.from}.</>}
          </p>
        </div>
        {notes?.email.mode !== "off" && <TestEmail onSent={() => api<Notifications>("/api/notifications").then(setNotes).catch(() => {})} />}
        {notes && !notes.recent.length && <p className="px-5 pb-5 pt-3 text-sm text-stone-500">No emails yet.</p>}
        {notes && notes.recent.length > 0 && (
          <ul className="mt-3 divide-y divide-stone-100 border-t border-stone-100">
            {notes.recent.map((n) => (
              <li key={n.id} className={row}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{n.subject}</span>
                  <span className="block truncate text-xs text-stone-500">
                    to {n.recipient} · {fmtDate(n.created_at)}
                    {n.client_id && n.client_name && (
                      <>
                        {" · "}
                        <Link href={`/clients/${n.client_id}`} className="hover:underline">
                          {n.client_name}
                        </Link>
                      </>
                    )}
                    {n.error && <span className="text-red-700"> · {n.error}</span>}
                  </span>
                </span>
                <Badge tone={n.status === "sent" ? "green" : n.status === "logged" ? "amber" : "red"}>
                  {n.status === "sent" ? "Sent" : n.status === "logged" ? "Logged (demo)" : "Failed"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Backups</h2>
          <span className="flex items-center gap-2">
            {backups && (
              <Badge tone={backups.config.remote ? (backups.config.encrypted ? "green" : "amber") : "amber"}>
                {backups.config.remote ? (backups.config.encrypted ? "Nightly, encrypted, off-site" : "Nightly, off-site, not encrypted") : "Nightly, this server only"}
              </Badge>
            )}
            <Button
              small
              disabled={backingUp}
              onClick={async () => {
                setBackingUp(true);
                setError("");
                try {
                  await api("/api/backup", { json: {} });
                } catch (e) {
                  setError((e as Error).message);
                }
                await loadBackups();
                setBackingUp(false);
              }}
            >
              {backingUp ? "Backing up…" : "Back up now"}
            </Button>
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Every night after {backups ? `${backups.config.hour}:00` : "3:00"} server time, the database and uploaded reports are zipped
          and kept here (last 7)
          {backups?.config.remote ? ` and copied to ${backups.config.remote} (kept ${backups.config.keepDays} days)` : ""}.
          {backups && !backups.config.remote && (
            <>
              {" "}
              A copy on the same disk won&apos;t survive losing the server: set <code className="font-mono">BACKUP_S3_BUCKET</code> and its
              keys to send backups off-site.
            </>
          )}
          {backups && !backups.config.encrypted && (
            <>
              {" "}
              Set <code className="font-mono">BACKUP_PASSPHRASE</code> to encrypt them — they contain client data.
            </>
          )}
          {" "}Restore with <code className="font-mono">npm run restore -- &lt;file&gt;</code>.
        </p>
        {backups && backups.recent.length > 0 && (
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {backups.recent.slice(0, 5).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{b.filename}</span>
                  <span className="text-xs text-stone-500">
                    {fmtDate(b.created_at)} · {(b.bytes / 1024).toFixed(0)} KB · {b.destination}
                    {b.error && <span className="text-red-700"> · {b.error}</span>}
                  </span>
                </span>
                <Badge tone={b.status === "ok" ? "green" : "red"}>{b.status === "ok" ? "OK" : "Failed"}</Badge>
              </li>
            ))}
          </ul>
        )}
        {backups && !backups.recent.length && <p className="mt-3 text-sm text-stone-500">No backups yet. The first runs tonight, or press &ldquo;Back up now&rdquo;.</p>}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Mail tracking updates</h2>
          {notes && (
            <Badge tone={notes.mail.mode === "off" ? "stone" : notes.webhook ? "green" : "amber"}>
              {notes.mail.mode === "off" ? "Mail sending off" : notes.webhook ? "Instant (webhook)" : "Checked every 30 min"}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Certified-mail tracking is re-checked every 30 minutes while the app is running. For instant updates, Lob can
          call the app the moment a letter moves. In the Lob dashboard, add a webhook pointing at the URL below, subscribe
          it to the <code className="font-mono">letter.certified.*</code> events, then put its secret in{" "}
          <code className="font-mono">.env.local</code> as <code className="font-mono">LOB_WEBHOOK_SECRET</code> and restart.
        </p>
        <WebhookUrl />
        <p className="mt-2 text-xs text-stone-500">
          Lob must be able to reach the app over the internet, so this only works once it is hosted (or exposed with a
          tunnel). Requests without a valid signature are rejected.
        </p>
      </Card>

      <Card>
        <div className="px-5 pt-5">
          <h2 className="font-semibold">Client logins</h2>
          <p className="mt-1 text-sm text-stone-600">
            Clients only see their own file. Invite a client from the Client login card on their Overview tab. &ldquo;Reset
            link&rdquo; makes a one-time password-reset link for someone who is locked out; with email configured, anyone can
            also use &ldquo;Forgot your password?&rdquo; on the sign-in page.
          </p>
        </div>
        {!data.clients.length && !data.invites.length && <p className="px-5 pb-5 pt-3 text-sm text-stone-500">No client logins yet.</p>}
        <ul className="mt-3 divide-y divide-stone-100 border-t border-stone-100 empty:hidden">
          {data.clients.map((c) => (
            <li key={c.id} className={row}>
              <span className="min-w-0">
                <Link href={`/clients/${c.client_id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <span className="block truncate text-xs text-stone-500">
                  {c.email} · since {fmtDate(c.created_at)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <Badge tone="green">Active</Badge>
                <button className="text-xs text-stone-500 hover:text-stone-900" onClick={() => makeResetLink(c.id)}>
                  Reset link
                </button>
                <button className="text-xs text-stone-400 hover:text-red-700" onClick={() => remove(c.id, `${c.name}'s login`)}>
                  Remove
                </button>
              </span>
              {resetBox(c.id)}
            </li>
          ))}
          {data.invites.map((i) => (
            <li key={`invite-${i.client_id}`} className={row}>
              <span className="min-w-0">
                <Link href={`/clients/${i.client_id}`} className="font-medium hover:underline">
                  {i.name}
                </Link>
                <span className="block truncate text-xs text-stone-500">
                  {i.email} · link expires {fmtDate(i.expires_at)}
                </span>
              </span>
              <Badge tone="amber">Invite sent</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function TestEmail({ onSent }: { onSent: () => void }) {
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mx-5 mt-3 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg("");
        try {
          await api("/api/notifications/test", { json: { to } });
          setMsg(`Sent to ${to}. Check the inbox (and spam folder).`);
          setTo("");
          onSent();
        } catch (err) {
          setMsg((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <Field label="Send a test email to" type="email" required className="w-72" value={to} onChange={(e) => setTo(e.target.value)} />
      <Button small className="!py-2" disabled={busy || !to}>
        {busy ? "Sending…" : "Send test"}
      </Button>
      {msg && <span className="basis-full text-xs text-stone-600">{msg}</span>}
    </form>
  );
}

function WebhookUrl() {
  // Read on the client only; the server doesn't know the public origin.
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/api/webhooks/lob`;
  return (
    <input readOnly className={`${inputClass} mt-3 font-mono !text-xs`} value={url} onFocus={(e) => e.target.select()} aria-label="Webhook URL" />
  );
}

function CredentialForm({
  title,
  submit,
  done,
  fields,
  onSubmit,
}: {
  title: string;
  submit: string;
  done: string;
  fields: { key: string; label: string; type: string; autoComplete: string }[];
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          await onSubmit(values);
          setValues({});
          setSaved(true);
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <h3 className="font-semibold">{title}</h3>
      {fields.map((f) => (
        <Field
          key={f.key}
          label={f.label}
          type={f.type}
          autoComplete={f.autoComplete}
          required
          value={values[f.key] ?? ""}
          onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
        />
      ))}
      <ErrorNote>{error}</ErrorNote>
      {saved && <p className="text-sm text-emerald-800">{done}</p>}
      <Button variant="primary" disabled={busy}>
        {submit}
      </Button>
    </form>
  );
}
