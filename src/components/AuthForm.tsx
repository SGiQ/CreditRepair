"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Button, Card, ErrorNote, Field } from "./ui";

/** Shared by sign-in, first-run setup, and invite acceptance. */
export function AuthForm({
  title,
  intro,
  endpoint,
  submitLabel,
  fixedEmail,
  newPassword,
  forgotLink,
}: {
  title: string;
  intro: string;
  endpoint: string;
  submitLabel: string;
  fixedEmail?: string;
  newPassword?: boolean;
  forgotLink?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(fixedEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword && password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    try {
      const { role } = await api<{ role: string }>(endpoint, { json: { email, password } });
      router.replace(role === "admin" ? "/" : "/portal");
      // Re-render the server layout so the header picks up the new session.
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto mt-10 w-full max-w-sm p-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-stone-600">{intro}</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          required
          readOnly={Boolean(fixedEmail)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label={newPassword ? "Choose a password (10+ characters)" : "Password"}
          type="password"
          autoComplete={newPassword ? "new-password" : "current-password"}
          minLength={newPassword ? 10 : undefined}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {newPassword && (
          <Field label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
        <ErrorNote>{error}</ErrorNote>
        <Button variant="primary" className="w-full" disabled={busy}>
          {submitLabel}
        </Button>
        {forgotLink && (
          <p className="text-center text-sm">
            <Link href="/forgot" className="font-medium text-emerald-700 hover:underline">
              Forgot your password?
            </Link>
          </p>
        )}
      </form>
    </Card>
  );
}
