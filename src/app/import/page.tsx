import Link from "next/link";
import { ImportReceiver } from "@/components/ImportReceiver";
import { currentUser } from "@/lib/auth";
import { getClient } from "@/lib/store";
import { MONITORING_PROVIDERS, type MonitoringProvider } from "@/lib/types";

/**
 * Landing window for the "Send report" bookmark: the member's browser opens it from their monitoring site's
 * report page and hands the page over with postMessage. The window confirms, uploads it to the right client's
 * file, and starts the analysis. Sign-in is checked here; nothing is accepted for a file the viewer can't reach.
 */
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ client?: string; from?: string }> }) {
  const { client: clientParam, from } = await searchParams;
  const provider: MonitoringProvider = from && from in MONITORING_PROVIDERS ? (from as MonitoringProvider) : "identityiq";
  const user = await currentUser();

  const note = (title: string, body: string, link?: { href: string; label: string }) => (
    <div className="mx-auto max-w-md rounded-xl border border-stone-200 bg-white p-6">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p>
      {link && (
        <Link href={link.href} className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
          {link.label}
        </Link>
      )}
    </div>
  );

  if (!user) {
    return note(
      "Sign in first",
      "Sign in to Credit Repair Desk in another tab, then go back to your report and click the bookmark again.",
      { href: "/login", label: "Sign in" },
    );
  }
  const clientId = user.role === "client" ? user.client_id : Number(clientParam);
  const client = clientId ? getClient(clientId) : undefined;
  if (!client) {
    return note(
      "Which client?",
      "This bookmark isn't tied to a client. Open the client's file and drag the bookmark from their Import card so reports land in the right place.",
      { href: "/", label: "Go to the dashboard" },
    );
  }
  return (
    <ImportReceiver
      clientId={client.id}
      clientName={client.name}
      provider={provider}
      returnTo={user.role === "client" ? "/portal#reports" : `/clients/${client.id}`}
      own={user.role === "client"}
    />
  );
}
