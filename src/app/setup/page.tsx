import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { hasAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (hasAdmin()) redirect("/login");
  return (
    <AuthForm
      title="Create your specialist account"
      intro="This is the one account that manages every client's file. Clients get their own logins by invite."
      endpoint="/api/auth/setup"
      submitLabel="Create account"
      newPassword
    />
  );
}
