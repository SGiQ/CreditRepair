"use client";
import { useRef, useState } from "react";
import type { Report } from "@/lib/types";
import { api, Badge, Button, Card, ErrorNote, fmtDate, Spinner } from "./ui";

export function ReportUpload({
  clientId,
  reports,
  reload,
  intro,
  canRemove,
  onReview,
}: {
  clientId: number;
  reports: Report[];
  reload: () => Promise<void>;
  intro: string;
  canRemove?: boolean;
  onReview?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/api/clients/${clientId}/reports`, { method: "POST", body });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(id: number, name: string) {
    if (!confirm(`Remove "${name}"? Items from it that have no letters yet are removed too.`)) return;
    await api(`/api/reports/${id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <Card className="h-fit p-5">
      <h2 className="font-semibold">Credit reports</h2>
      <p className="mt-1 text-sm text-stone-600">{intro}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files[0]);
        }}
        className={`mt-4 rounded-lg border-2 border-dashed px-4 py-7 text-center ${
          dragging ? "border-emerald-600 bg-emerald-50" : "border-stone-300"
        }`}
      >
        <input ref={fileRef} type="file" accept=".pdf,.txt,.html,.htm" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <Button variant="primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Spinner /> : null} Upload credit report
        </Button>
        <p className="mt-2 text-xs text-stone-500">or drop a file here · PDF, TXT or HTML · up to 30 MB</p>
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
      <ul className="mt-4 space-y-3">
        {reports.map((r) => (
          <li key={r.id} className="rounded-lg border border-stone-200 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{r.filename}</span>
              <span className="flex shrink-0 items-center gap-2">
                {r.status === "analyzing" && (
                  <Badge tone="blue">
                    <span className="mr-1.5 flex">
                      <Spinner />
                    </span>
                    Analyzing
                  </Badge>
                )}
                {r.status === "done" && <Badge tone="green">Analyzed</Badge>}
                {r.status === "error" && <Badge tone="red">Failed</Badge>}
                {canRemove && (
                  <button onClick={() => remove(r.id, r.filename)} className="text-xs text-stone-400 hover:text-red-700" aria-label={`Remove ${r.filename}`}>
                    Remove
                  </button>
                )}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-stone-500">Uploaded {fmtDate(r.uploaded_at)}</div>
            {r.status === "analyzing" && (
              <p className="mt-2 text-stone-600">Reading every account. Long reports take a few minutes — you can leave this page.</p>
            )}
            {r.status === "error" && <p className="mt-2 text-red-700">{r.error}</p>}
            {r.summary && <p className="mt-2 leading-relaxed text-stone-700">{r.summary}</p>}
            {r.status === "done" && onReview && (
              <button onClick={onReview} className="mt-2 text-sm font-medium text-emerald-700 hover:underline">
                Review the items →
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
