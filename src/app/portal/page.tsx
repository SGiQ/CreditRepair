import { redirect } from "next/navigation";
import { ClientPortal } from "@/components/ClientPortal";
import { currentUser } from "@/lib/auth";

export default async function PortalPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "client" || !user.client_id) redirect("/");
  return <ClientPortal id={user.client_id} />;
}
