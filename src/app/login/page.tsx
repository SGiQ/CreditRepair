import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser, hasAdmin } from "@/lib/auth";

export default async function LoginPage() {
  if (!hasAdmin()) redirect("/setup");
  const user = await currentUser();
  if (user) redirect(user.role === "admin" ? "/" : "/portal");
  return <AuthForm title="Sign in" intro="Use the email and password for your account." endpoint="/api/auth/login" submitLabel="Sign in" forgotLink />;
}
