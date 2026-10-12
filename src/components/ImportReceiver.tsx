"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MONITORING_PROVIDERS, type MonitoringProvider } from "@/lib/types";
import { api, Button, ErrorNote, Spinner } from "./ui";

/** Message the bookmark sends once this window says it's ready. */
interface Handoff {
  type: "cr-import";
  url: string;
  title: string;
  html: string;
}

interface Received {
  host: string;
  title: string;
  html: string;
  /** The page came from the service we expected. */
  trusted: boolean;
  bytes: number;
}

/**
 * The window that hands the page over: the one that opened us via the bookmark. In development only, a parent frame
 * also counts, so the flow can be exercised from an iframe without a real monitoring site.
 */
function senderWindow(): Window | null {
  if (window.opener) return window.opener as Window;
  if (process.env.NODE_ENV !== "production" && window.parent !== window) return window.parent;
  return null;
}

const HIDDEN = '[hidden],[aria-hidden="true"],.ng-hide,.hidden,.hide,.d-none,.sr-only,.visually-hidden';
const UNWRAP = new Set(["span", "a", "font", "u", "label", "small", "sup", "sub"]);

/**
 * Keeps what a reader would see of the report page and drops the rest: scripts, styles, menus, hidden Angular
 * templates, attributes. Table structure survives so the three bureau columns stay aligned for the analysis.
 */
function cleanReportHtml(raw: string): { html: string; title: string } {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const title = doc.title.trim();
  doc.querySelectorAll("script,style,svg,noscript,iframe,link,meta,canvas,video,audio,button,select,textarea,template,nav,header,footer").forEach((n) => n.remove());
  doc.querySelectorAll(HIDDEN).forEach((n) => n.remove());
  doc.querySelectorAll("[style]").forEach((n) => {
    const style = (n.getAttribute("style") || "").replace(/\s/g, "").toLowerCase();
    if (/display:none|visibility:hidden/.test(style)) n.remove();
  });
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    if (tag === "img") {
      el.replaceWith(el.getAttribute("alt") ? doc.createTextNode(` ${el.getAttribute("alt")} `) : "");
      continue;
    }
    if (tag === "input") {
      const value = (el as HTMLInputElement).value;
      el.replaceWith(value && !/^(password|hidden|submit|button)$/.test((el as HTMLInputElement).type) ? doc.createTextNode(value) : "");
      continue;
    }
    for (const a of Array.from(el.attributes)) if (a.name !== "colspan" && a.name !== "rowspan") el.removeAttribute(a.name);
    if (UNWRAP.has(tag)) el.replaceWith(...Array.from(el.childNodes));
  }
  let html = doc.body.innerHTML.replace(/\s+/g, " ");
  // Empty wrappers left behind by removed content, innermost first. Table cells stay even when empty: a blank
  // bureau column is information, and dropping the cell would shift the next bureau's value into its place.
  const empty = /<(div|p|thead|tbody|table|ul|ol|li|section|article|main|h[1-6]|b|strong|em|i|dl|dt|dd)>\s*<\/\1>/g;
  for (let i = 0; i < 20 && empty.test(html); i++) html = html.replace(empty, "");
  html = html.replace(/> </g, ">\n<");
  return { html: `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${title}</title></head><body>\n${html}\n</body></html>\n`, title };
}

export function ImportReceiver({
  clientId,
  clientName,
  provider,
  returnTo,
  own,
}: {
  clientId: number;
  clientName: string;
  provider: MonitoringProvider;
  returnTo: string;
  /** True when the signed-in person is the client themself. */
  own: boolean;
}) {
  const info = MONITORING_PROVIDERS[provider];
  // null while rendering on the server; then whether a bookmark opened this window.
  const opened = useSyncExternalStore(() => () => {}, () => Boolean(senderWindow()), () => null);
  const [received, setReceived] = useState<Received | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done">("idle");
  const [error, setError] = useState("");
  const got = useRef(false);

  useEffect(() => {
    const opener = senderWindow();
    if (!opener) return;
    const onMessage = (e: MessageEvent<Partial<Handoff>>) => {
      if (e.source !== opener || got.current) return;
      const d = e.data;
      if (!d || d.type !== "cr-import" || typeof d.html !== "string") return;
      got.current = true;
      let host = "";
      try {
        host = new URL(e.origin).hostname;
      } catch {
        host = e.origin;
      }
      try {
        const { html, title } = cleanReportHtml(d.html);
        setReceived({
          host,
          title: title || String(d.title || ""),
          html,
          trusted: info.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
          bytes: new Blob([html]).size,
        });
      } catch (err) {
        setError(`Couldn't read the page: ${(err as Error).message}`);
      }
    };
    window.addEventListener("message", onMessage);
    // Tell the bookmark we're listening (it only answers this exact signal).
    opener.postMessage("cr-import-ready", "*");
    return () => window.removeEventListener("message", onMessage);
  }, [info.hosts]);

  async function upload() {
    if (!received) return;
    setState("uploading");
    setError("");
    try {
      const date = new Date().toISOString().slice(0, 10);
      const body = new FormData();
      body.append("file", new File([received.html], `${info.label} report ${date}.html`, { type: "text/html" }));
      body.append("source", provider);
      await api(`/api/clients/${clientId}/reports`, { method: "POST", body });
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  }

  const who = own ? "your" : `${clientName.split(" ")[0]}'s`;
  const kb = received ? Math.max(1, Math.round(received.bytes / 1024)) : 0;

  return (
    <div className="mx-auto max-w-md rounded-xl border border-stone-200 bg-white p-6">
      <h1 className="text-lg font-semibold tracking-tight">Import from {info.label}</h1>

      {opened === false && (
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-stone-600">
          <p>This window receives reports from the &ldquo;Send report&rdquo; bookmark. Nothing was sent to it.</p>
          <p>
            Open {info.label}, go to {who} credit report, and click the bookmark there. If you don&apos;t have the bookmark yet, it&apos;s on the Import
            card in {own ? "your portal" : "the client's file"}.
          </p>
          <a href={returnTo} className="inline-block font-medium text-emerald-700 hover:underline">
            Back to {own ? "your portal" : "the client's file"}
          </a>
        </div>
      )}

      {opened && !received && !error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-stone-600">
          <Spinner /> Receiving the page from {info.label}…
        </div>
      )}

      {received && state !== "done" && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="font-medium text-stone-900">{received.title || "Untitled page"}</div>
            <div className="mt-0.5 text-xs text-stone-500">
              From {received.host} · {kb} KB after trimming
            </div>
          </div>
          {!received.trusted && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              This page didn&apos;t come from {info.label} ({info.hosts.join(", ")}). Only import it if it really is {who} credit report.
            </p>
          )}
          <p className="text-stone-600">
            This adds the page to {who} file as a credit report and starts the analysis, which takes a few minutes. If the page hadn&apos;t finished
            loading, close this window, wait for the full report to show, and click the bookmark again.
          </p>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex items-center gap-2">
            <Button variant="primary" disabled={state === "uploading"} onClick={upload}>
              {state === "uploading" ? <Spinner /> : null} Import this report
            </Button>
            <Button onClick={() => window.close()}>Cancel</Button>
          </div>
        </div>
      )}

      {!received && error && (
        <div className="mt-3 space-y-3">
          <ErrorNote>{error}</ErrorNote>
          <Button onClick={() => window.close()}>Close</Button>
        </div>
      )}

      {state === "done" && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            Report imported. Every account is being read now; results appear in {own ? "your portal" : "the client's file"} in a few minutes.
          </p>
          <div className="flex items-center gap-2">
            <a href={returnTo} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-transparent bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-800">
              Open {own ? "my portal" : "the file"}
            </a>
            <Button onClick={() => window.close()}>Close this window</Button>
          </div>
        </div>
      )}
    </div>
  );
}
