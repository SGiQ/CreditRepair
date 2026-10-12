"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MONITORING_PROVIDERS, type MonitoringProvider, type Report } from "@/lib/types";
import { Button, Card, fmtDate } from "./ui";

/**
 * The bookmark that sends a monitoring site's report page to /import. It runs in the member's own signed-in
 * browser, so it works wherever the site works and the app never sees their login. Kept tiny and generic: the
 * page is cleaned on our side (ImportReceiver), so the bookmark rarely needs replacing.
 */
export function bookmarklet(origin: string, clientId: number, provider: MonitoringProvider): string {
  const target = `${origin}/import?client=${clientId}&from=${provider}`;
  const code = `(()=>{const a=${JSON.stringify(origin)},w=window.open(${JSON.stringify(target)},"crimport","width=560,height=700,popup=yes");if(!w){alert("Please allow pop-ups for this site, then click the bookmark again.");return}let s=false;const h=e=>{if(e.source!==w||e.data!=="cr-import-ready"||s)return;s=true;removeEventListener("message",h);w.postMessage({type:"cr-import",url:location.href,title:document.title,html:"<!DOCTYPE html>"+document.documentElement.outerHTML},a)};addEventListener("message",h)})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function ImportCard({
  clientId,
  clientName,
  reports,
  role,
}: {
  clientId: number;
  clientName: string;
  reports: Report[];
  role: "admin" | "client";
}) {
  const provider: MonitoringProvider = "identityiq";
  const info = MONITORING_PROVIDERS[provider];
  const link = useRef<HTMLAnchorElement>(null);
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const href = origin ? bookmarklet(origin, clientId, provider) : "";
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const first = clientName.split(" ")[0];
  const last = reports.find((r) => r.source === provider && r.status !== "error");

  // Set outside React so the javascript: URL isn't rewritten.
  useEffect(() => {
    if (href) link.current?.setAttribute("href", href);
  }, [href]);

  const label = `Send report to Credit Repair Desk`;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Import from {info.label}</h2>
        {last && <span className="text-xs text-stone-500">Last import {fmtDate(last.uploaded_at)}</span>}
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {role === "client"
          ? `If you use ${info.label}, send your 3-bureau report straight from their site — no download needed. Your ${info.label} login stays with you.`
          : `${first} can send their ${info.label} report from their own browser with one click; so can you, if they've signed in to ${info.label} for you. The app never holds their ${info.label} login.`}
      </p>

      <ol className="mt-4 space-y-3 text-sm text-stone-700">
        <li className="flex gap-3">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold">1</span>
          <div className="min-w-0">
            <div>On a computer, drag this button to your browser&apos;s bookmarks bar:</div>
            <a
              ref={link}
              href="#"
              draggable
              onClick={(e) => e.preventDefault()}
              title="Drag me to your bookmarks bar"
              className="mt-2 inline-flex cursor-grab items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 shadow-sm active:cursor-grabbing"
            >
              <span aria-hidden>★</span> {label}
            </a>
            <div className="mt-1.5 text-xs text-stone-500">
              Bookmarks bar hidden? Press Ctrl+Shift+B (⌘+Shift+B on Mac).{" "}
              <button className="font-medium text-emerald-700 hover:underline" onClick={() => setShowCode((v) => !v)}>
                {showCode ? "Hide the manual way" : "Can't drag it?"}
              </button>
            </div>
            {showCode && (
              <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
                Add any bookmark, name it &ldquo;{label}&rdquo;, and paste this as its address:
                <div className="mt-2 flex gap-2">
                  <input readOnly value={href} onFocus={(e) => e.target.select()} className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 font-mono text-[11px]" aria-label="Bookmark address" />
                  <Button
                    small
                    onClick={async () => {
                      await navigator.clipboard.writeText(href);
                      setCopied(true);
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold">2</span>
          <div>
            <a href={info.site} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">
              Open {info.label}
            </a>
            . {info.where}
          </div>
        </li>
        <li className="flex gap-3">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold">3</span>
          <div>
            Click the bookmark. A small window shows what it picked up; press <span className="font-medium">Import this report</span> and the analysis starts.
          </div>
        </li>
      </ol>
      <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500">
        Can&apos;t use the bookmark (on a phone, say)? In {info.label}, print the report and choose &ldquo;Save as PDF&rdquo;, then upload that file above.
      </p>
    </Card>
  );
}
