import Link from "next/link";
import { ResetForm } from "@/components/PasswordResetForms";
import { Card } from "@/components/ui";
import { findResetToken } from "@/lib/auth";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = findResetToken(token);
  if (!found) {
    return (
      <Card className="mx-auto mt-10 w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
        <p className="mt-1 text-sm text-stone-600">
          Reset links work once and expire after an hour.{" "}
          <Link href="/forgot" className="font-medium text-emerald-700 hover:underline">
            Request a new one
          </Link>
          , or ask your specialist for a reset link.
        </p>
      </Card>
    );
  }
  return <ResetForm token={token} email={found.email} />;
}
