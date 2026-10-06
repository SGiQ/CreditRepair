"use client";
import { useState } from "react";
import type { TabProps } from "./ClientWorkspace";
import { api, Badge, Button, Card, ErrorNote, inputClass } from "./ui";

/** Lets the specialist give a client their own login via a one-time invite link. */
export function PortalAccessCard({ bundle, reload }: TabProps) {
  const { client, access } = bundle;
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  if (!access) return null;

  async function act(action: "invite" | "revoke") {
    setError("");
    setCopied(false);
    try {
      const res = await api<{ token?: string }>(`/api/clients/${client.id}/access`, { json: { action } });
      setLink(res.token ? `${window.location.origin}/invite/${res.token}` : "");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Client login</h2>
        {access.status === "active" && <Badge tone="green">Active</Badge>}
        {access.status === "invited" && <Badge tone="amber">Invite sent</Badge>}
        {access.status === "none" && <Badge>No login</Badge>}
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {access.status === "active"
          ? `${client.name.split(" ")[0]} signs in as ${access.email} to upload reports, follow progress, and download letters.`
          : "Give this client their own login so they can upload reports, follow progress, and download their letters. They only ever see their own file."}
      </p>

      {link && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">Send this link to {access.email || client.email}</p>
          <div className="mt-2 flex gap-2">
            <input readOnly className={`${inputClass} font-mono !text-xs`} value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
            <Button
              small
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-emerald-900/80">Works once, expires in 7 days, and is only shown now. They choose their own password.</p>
        </div>
      )}

      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {access.status !== "active" && (
          <Button small variant={access.status === "none" ? "primary" : "secondary"} onClick={() => act("invite")}>
            {access.status === "none" ? "Create invite link" : "Create a new link"}
          </Button>
        )}
        {access.status !== "none" && (
          <button
            className="text-xs text-stone-400 hover:text-red-700"
            onClick={() => {
              if (confirm(access.status === "active" ? `Remove ${client.name}'s login? They will be signed out and can no longer access their file.` : "Cancel the open invite?")) act("revoke");
            }}
          >
            {access.status === "active" ? "Remove login" : "Cancel invite"}
          </button>
        )}
      </div>
    </Card>
  );
}
