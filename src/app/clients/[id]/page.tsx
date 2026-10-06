import { redirect } from "next/navigation";
import { ClientWorkspace } from "@/components/ClientWorkspace";
import { currentUser } from "@/lib/auth";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/portal");
  return <ClientWorkspace id={Number((await params).id)} />;
}
