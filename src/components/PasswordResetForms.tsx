"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Button, Card, ErrorNote, Field } from "./ui";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card className="mx-auto mt-10 w-full max-w-sm p-6">
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      {done ? (
        <p className="mt-2 text-sm text-stone-700">
          If there&apos;s an account for <strong>{email}</strong>, a reset link is on its way. It works for one hour. Check your
          spam folder if it doesn&apos;t arrive.
        </p>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/api/auth/forgot", { json: { email } });
              setDone(true);
            } catch (err) {
              setError((err as Error).message);
            }
            setBusy(false);
          }}
        >
          <p className="text-sm text-stone-600">Enter the email you sign in with and we&apos;ll send a link to choose a new password.</p>
          <Field label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorNote>{error}</ErrorNote>
          <Button variant="primary" className="w-full" disabled={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}

export function ResetForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card className="mx-auto mt-10 w-full max-w-sm p-6">
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-stone-600">For {email}. You&apos;ll be signed out everywhere else.</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) return setError("The two passwords don't match.");
          setBusy(true);
          setError("");
          try {
            const { role } = await api<{ role: string }>(`/api/auth/reset/${token}`, { json: { password } });
            router.replace(role === "admin" ? "/" : "/portal");
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <Field label="New password (10+ characters)" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ErrorNote>{error}</ErrorNote>
        <Button variant="primary" className="w-full" disabled={busy}>
          Set password and sign in
        </Button>
      </form>
    </Card>
  );
}
