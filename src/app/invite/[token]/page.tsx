import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Card } from "@/components/ui";
import { get } from "@/lib/db";
import { hashToken } from "@/lib/auth";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = get<{ email: string; name: string }>(
    `SELECT i.email, c.name FROM invites i JOIN clients c ON c.id = i.client_id
     WHERE i.token_hash = ? AND i.expires_at > datetime('now')`,
    hashToken(token),
  );
  if (!invite) {
    return (
      <Card className="mx-auto mt-10 w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
        <p className="mt-1 text-sm text-stone-600">
          Invite links work once and expire after 7 days. Ask your specialist for a new one, or{" "}
          <Link href="/login" className="font-medium text-emerald-700 hover:underline">
            sign in
          </Link>{" "}
          if you already set a password.
        </p>
      </Card>
    );
  }
  return (
    <AuthForm
      title={`Welcome, ${invite.name.split(" ")[0]}`}
      intro="Set a password to open your credit file. You'll be able to upload reports, follow progress, and download your letters."
      endpoint={`/api/invites/${token}`}
      submitLabel="Create my login"
      fixedEmail={invite.email}
      newPassword
    />
  );
}
