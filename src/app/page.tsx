import { redirect } from "next/navigation";
import { ClientsHome } from "@/components/ClientsHome";
import { currentUser, hasAdmin } from "@/lib/auth";

export default async function Home() {
  if (!hasAdmin()) redirect("/setup");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/portal");
  return <ClientsHome />;
}
