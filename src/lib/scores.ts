import type { Score } from "./types";

/** Common scoring models, offered in the "Add a score" form so entries stay consistent. */
export const SCORE_MODELS = [
  "FICO 8",
  "FICO 9",
  "FICO 10T",
  "FICO 2 (Experian mortgage)",
  "FICO 4 (TransUnion mortgage)",
  "FICO 5 (Equifax mortgage)",
  "FICO Auto 8",
  "FICO Bankcard 8",
  "VantageScore 3.0",
  "VantageScore 4.0",
];

/**
 * Collapses spelling differences so "FICO Score 8", "fico 8" and "FICO8" count as the same model,
 * and "VantageScore 3" matches "VantageScore 3.0". Unlabelled readings form their own group.
 */
export function modelKey(model: string): string {
  const k = model
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/score/g, "")
    .replace(/(\d)\.0\b/g, "$1")
    .replace(/[^a-z0-9.]/g, "");
  return k || "unspecified";
}

export interface ScoreSeries {
  key: string;
  bureau: Score["bureau"];
  /** Label as most recently entered. */
  model: string;
  readings: Score[];
  /** Latest minus first, within this bureau and model only. Null with a single reading. */
  change: number | null;
}

/** One series per bureau + scoring model, readings oldest first. Different models are never compared. */
export function scoreSeries(scores: Score[]): ScoreSeries[] {
  const groups = new Map<string, Score[]>();
  for (const s of [...scores].sort((a, b) => a.as_of.localeCompare(b.as_of) || a.id - b.id)) {
    const key = `${s.bureau}|${modelKey(s.model)}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([key, readings]) => ({
      key,
      bureau: readings[0].bureau,
      model: readings[readings.length - 1].model,
      readings,
      change: readings.length > 1 ? readings[readings.length - 1].score - readings[0].score : null,
    }))
    .sort((a, b) => a.bureau.localeCompare(b.bureau) || b.readings.length - a.readings.length);
}
