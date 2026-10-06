import { redirect } from "next/navigation";
import { AccountsAdmin } from "@/components/AccountsAdmin";
import { currentUser } from "@/lib/auth";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/portal");
  return <AccountsAdmin />;
}
