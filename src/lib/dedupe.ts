// Rules for recognising the same account across reports. Bureaus print creditor names differently
// (truncated, with or without "LLC") and mask account numbers differently (Equifax often shows the
// last four digits, TransUnion and Experian the first several), so matching is deliberately cautious:
// two items match only when nothing about them contradicts it.

import type { Item, ItemStatus } from "./types";

const STOP = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|na|n\.a|ltd|the|of)\b/g;

export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(STOP, " ")
    .replace(/[^a-z0-9]/g, "");
}

/** Truncated names ("PLANET HOME LENDING, L") still match the full name. */
export function namesMatch(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 6 && long.startsWith(short);
}

interface Visible {
  prefix: string;
  suffix: string;
}

/** Splits a masked account number into the digits shown at the start and at the end. */
function visible(acct: string): Visible {
  const s = acct.toUpperCase().replace(/[\s-]/g, "");
  const masked = /[*X#•]/;
  const firstMask = s.search(masked);
  if (firstMask === -1) return { prefix: s.replace(/[^A-Z0-9]/g, ""), suffix: "" };
  let lastMask = firstMask;
  for (let i = s.length - 1; i >= 0; i--) if (masked.test(s[i])) { lastMask = i; break; }
  return { prefix: s.slice(0, firstMask).replace(/[^A-Z0-9]/g, ""), suffix: s.slice(lastMask + 1).replace(/[^A-Z0-9]/g, "") };
}

/**
 * False only when the visible parts actually disagree. An "ends in 4603" number and a
 * "starts with 571910" number can't be compared, so they don't rule a match out.
 */
export function accountsCompatible(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return true;
  // Several numbers in one field ("1XXXX (TU/EXP); 142406XXX (EQF)"): compatible if any pair is.
  const as = a.split(/[;,/]|\(.*?\)/).map((x) => x.trim()).filter(Boolean);
  const bs = b.split(/[;,/]|\(.*?\)/).map((x) => x.trim()).filter(Boolean);
  if (as.length > 1 || bs.length > 1) return as.some((x) => bs.some((y) => accountsCompatible(x, y)));
  const x = visible(a);
  const y = visible(b);
  const n = Math.min(x.prefix.length, y.prefix.length);
  if (n >= 2 && x.prefix.slice(0, n) !== y.prefix.slice(0, n)) return false;
  const m = Math.min(x.suffix.length, y.suffix.length);
  if (m >= 2 && x.suffix.slice(-m) !== y.suffix.slice(-m)) return false;
  return true;
}

/** Rule-based backstop for the agent's own matching. Personal-information items are left to the agent. */
export function sameAccount(a: Pick<Item, "creditor" | "account_number" | "category">, b: Pick<Item, "creditor" | "account_number" | "category">): boolean {
  if (a.category !== b.category || a.category === "personal_info") return false;
  if (!namesMatch(a.creditor, b.creditor)) return false;
  if (a.category === "inquiry") return true;
  // Without an account number on either side, many accounts from one lender would collapse into one.
  if (!a.account_number.trim() && !b.account_number.trim()) return false;
  return accountsCompatible(a.account_number, b.account_number);
}

const ACTIVE: ItemStatus[] = ["awaiting_response", "verified", "disputed", "identified"];

/** When copies disagree, keep the one with the most work in progress; "resolved" only if every copy is resolved. */
export function mergedStatus(statuses: ItemStatus[]): ItemStatus {
  for (const s of ACTIVE) if (statuses.includes(s)) return s;
  return statuses.includes("deleted") ? "deleted" : "updated";
}

export const uniqueStrings = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase().replace(/\s+/g, " ").trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
