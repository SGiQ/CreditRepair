"use client";
import { useState } from "react";
import { BUREAUS, type Bureau, type Score } from "@/lib/types";
import { api, Badge, Button, Card, ErrorNote, fmtDate, inputClass } from "./ui";

/** Latest score per bureau, the change since the first reading, and a small history line. */
export function ScoreCard({
  clientId,
  scores,
  reload,
  role,
}: {
  clientId: number;
  scores: Score[];
  reload: () => Promise<void>;
  role: "admin" | "client";
}) {
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState({ bureau: "Equifax" as Bureau, score: "", model: "", as_of: new Date().toLocaleDateString("en-CA") });
  const [error, setError] = useState("");
  const byBureau = BUREAUS.map((b) => ({ bureau: b, readings: scores.filter((s) => s.bureau === b) })).filter((x) => x.readings.length);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/clients/${clientId}/scores`, { json: form });
      setForm({ ...form, score: "", model: "" });
      setAdding(false);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(s: Score) {
    if (!confirm(`Remove the ${s.bureau} reading of ${s.score} from ${fmtDate(s.as_of)}?`)) return;
    await api(`/api/scores/${s.id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Credit scores</h2>
        {!adding && (
          <Button small onClick={() => setAdding(true)}>
            Add a score
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {role === "client"
          ? "Scores printed on the reports you upload are recorded automatically. You can also type in a score from your bank or monitoring app."
          : "Captured from analyzed reports, or typed in from a monitoring app or lender. The change is measured from the first reading on file."}
      </p>

      {adding && (
        <form onSubmit={save} className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-stone-50 p-3 sm:grid-cols-5">
          <label className="text-xs font-medium text-stone-600">
            Bureau
            <select className={`${inputClass} mt-1 font-normal`} value={form.bureau} onChange={(e) => setForm({ ...form, bureau: e.target.value as Bureau })}>
              {BUREAUS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-stone-600">
            Score
            <input className={`${inputClass} mt-1 font-normal`} type="number" min={300} max={850} required value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-stone-600">
            Model <span className="font-normal text-stone-400">(optional)</span>
            <input className={`${inputClass} mt-1 font-normal`} placeholder="FICO 8" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-stone-600">
            Date checked
            <input className={`${inputClass} mt-1 font-normal`} type="date" required max={new Date().toLocaleDateString("en-CA")} value={form.as_of} onChange={(e) => setForm({ ...form, as_of: e.target.value })} />
          </label>
          <div className="flex items-end gap-2">
            <Button variant="primary" small className="!py-2">
              Save
            </Button>
            <Button type="button" variant="ghost" small className="!py-2" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <div className="col-span-full">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </form>
      )}

      {!byBureau.length && !adding && <p className="mt-4 text-sm text-stone-500">No scores recorded yet.</p>}

      <ul className="mt-4 divide-y divide-stone-100">
        {byBureau.map(({ bureau, readings }) => {
          const first = readings[0];
          const latest = readings[readings.length - 1];
          const delta = latest.score - first.score;
          return (
            <li key={bureau} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
              <div className="w-28">
                <div className="text-sm font-medium">{bureau}</div>
                <div className="text-xs text-stone-500">{latest.model || "score"}</div>
              </div>
              <div className="text-3xl font-semibold tabular-nums tracking-tight">{latest.score}</div>
              <div className="min-w-32 text-xs text-stone-500">
                {readings.length > 1 ? (
                  <>
                    <Badge tone={delta > 0 ? "green" : delta < 0 ? "red" : "stone"}>
                      {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : ""}
                      {delta} pts
                    </Badge>
                    <span className="mt-1 block">since {fmtDate(first.as_of)}</span>
                  </>
                ) : (
                  <span>First reading {fmtDate(latest.as_of)}</span>
                )}
              </div>
              <Sparkline readings={readings} />
            </li>
          );
        })}
      </ul>

      {scores.length > 0 && (
        <div className="mt-2">
          <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Hide readings" : `All ${scores.length} readings`}
          </button>
          {showAll && (
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-stone-500">
                <tr>
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Bureau</th>
                  <th className="py-1 text-right font-medium">Score</th>
                  <th className="py-1 pl-3 font-medium">Model</th>
                  <th className="py-1 pl-3 font-medium">Source</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {[...scores].reverse().map((s) => (
                  <tr key={s.id}>
                    <td className="py-1">{fmtDate(s.as_of)}</td>
                    <td className="py-1">{s.bureau}</td>
                    <td className="py-1 text-right tabular-nums">{s.score}</td>
                    <td className="py-1 pl-3 text-stone-500">{s.model}</td>
                    <td className="py-1 pl-3 text-stone-500">{s.source === "report" ? "From report" : "Typed in"}</td>
                    <td className="py-1 text-right">
                      {(role === "admin" || s.source === "manual") && (
                        <button className="text-stone-400 hover:text-red-700" onClick={() => remove(s)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

/** One bureau's history as a thin line; every point carries its value on hover. */
function Sparkline({ readings }: { readings: Score[] }) {
  const W = 180;
  const H = 40;
  const pad = 6;
  if (readings.length < 2) return <div className="h-10 flex-1" aria-hidden />;
  const lo = Math.min(...readings.map((r) => r.score));
  const hi = Math.max(...readings.map((r) => r.score));
  const span = Math.max(hi - lo, 20);
  const pts = readings.map((r, i) => ({
    x: pad + (i / (readings.length - 1)) * (W - pad * 2),
    y: H - pad - ((r.score - lo) / span) * (H - pad * 2),
    r,
  }));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-none" role="img" aria-label={`${readings[0].bureau} score history`}>
      <polyline fill="none" stroke="#047857" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
      {pts.map((p) => (
        <circle key={p.r.id} cx={p.x} cy={p.y} r={4} fill="#047857" stroke="#fff" strokeWidth="2">
          <title>{`${p.r.score} on ${fmtDate(p.r.as_of)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
