import { all, db, run } from "./db";
import { mergedStatus, uniqueStrings } from "./dedupe";
import { getItems, toLetter } from "./store";
import type { Item, Law } from "./types";
import type { KnownItem } from "./agent";

const STRENGTH = { weak: 0, moderate: 1, strong: 2 } as const;

export const knownItems = (clientId: number): KnownItem[] =>
  getItems(clientId).map((i) => ({
    id: i.id,
    creditor: i.creditor,
    original_creditor: i.original_creditor,
    account_number: i.account_number,
    category: i.category,
    bureaus: i.bureaus,
    balance: i.balance,
    date_opened: i.date_opened,
    reported_status: i.reported_status,
  }));

const lawsUnion = (lists: Law[][]) => {
  const seen = new Set<string>();
  return lists.flat().filter((l) => {
    const k = l.citation.toLowerCase().replace(/\s+/g, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Folds `dupes` into `keep`: bureaus, issues and laws are combined, the most advanced status and the
 * strongest dispute rating win, notes are joined, and every letter that pointed at a duplicate now points
 * at the kept item. Runs in one transaction.
 */
export function mergeInto(keep: Item, dupes: Item[]) {
  if (!dupes.length) return;
  const group = [keep, ...dupes];
  const strongest = group.reduce((a, b) => (STRENGTH[b.strength] > STRENGTH[a.strength] ? b : a));
  const firstNonEmpty = (k: keyof Item) => (group.map((i) => String(i[k] ?? "")).find((v) => v.trim()) ?? "");
  const dupeIds = new Set(dupes.map((d) => d.id));

  db().exec("BEGIN");
  try {
    run(
      `UPDATE items SET bureaus = ?, issues = ?, laws = ?, next_steps = ?, status = ?, strength = ?, dispute_angle = ?, notes = ?,
         creditor_address = ?, original_creditor = ?, account_number = ?, balance = ?, date_opened = ?, date_of_first_delinquency = ?,
         identity_theft = ?, updated_at = datetime('now') WHERE id = ?`,
      JSON.stringify([...new Set(group.flatMap((i) => i.bureaus))]),
      JSON.stringify(uniqueStrings(group.flatMap((i) => i.issues)).slice(0, 12)),
      JSON.stringify(lawsUnion(group.map((i) => i.laws)).slice(0, 8)),
      JSON.stringify(strongest.next_steps),
      mergedStatus(group.map((i) => i.status)),
      strongest.strength,
      strongest.dispute_angle,
      uniqueStrings(group.map((i) => i.notes)).join("\n\n"),
      firstNonEmpty("creditor_address"),
      firstNonEmpty("original_creditor"),
      // Keep every distinct form: each bureau masks the number differently, and letters should quote the bureau's version.
      uniqueStrings(group.flatMap((i) => i.account_number.split(" / "))).join(" / ").slice(0, 200),
      firstNonEmpty("balance"),
      firstNonEmpty("date_opened"),
      firstNonEmpty("date_of_first_delinquency"),
      group.some((i) => i.identity_theft) ? 1 : 0,
      keep.id,
    );
    // Keep letter history attached to the surviving item.
    for (const row of all("SELECT * FROM letters WHERE client_id = ?", keep.client_id)) {
      const l = toLetter(row);
      if (!l.item_ids.some((id) => dupeIds.has(id))) continue;
      const ids = [...new Set(l.item_ids.map((id) => (dupeIds.has(id) ? keep.id : id)))];
      run("UPDATE letters SET item_ids = ? WHERE id = ?", JSON.stringify(ids), l.id);
    }
    for (const d of dupes) run("DELETE FROM items WHERE id = ?", d.id);
    db().exec("COMMIT");
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
}

/** Merges the given items of one client into the oldest of them. Returns the surviving id. */
export function mergeItems(clientId: number, ids: number[]): number {
  const items = getItems(clientId).filter((i) => ids.includes(i.id));
  if (items.length < 2) throw new Error("Pick at least two items from this client's file.");
  const [keep, ...dupes] = items.sort((a, b) => a.id - b.id);
  mergeInto(keep, dupes);
  return keep.id;
}
