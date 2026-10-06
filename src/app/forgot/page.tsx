import { redirect } from "next/navigation";
import { ForgotForm } from "@/components/PasswordResetForms";
import { currentUser } from "@/lib/auth";

export default async function ForgotPage() {
  const user = await currentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/portal");
  return <ForgotForm />;
}
