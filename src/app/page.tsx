import { redirect } from "next/navigation";
import { ClientsHome } from "@/components/ClientsHome";
import { Landing } from "@/components/Landing";
import { currentUser, hasAdmin } from "@/lib/auth";

export default async function Home() {
  if (!hasAdmin()) redirect("/setup");
  const user = await currentUser();
  // Signed-out visitors get the public landing page; signed-in users go straight to their workspace.
  if (!user) return <Landing />;
  if (user.role !== "admin") redirect("/portal");
  return <ClientsHome />;
}
