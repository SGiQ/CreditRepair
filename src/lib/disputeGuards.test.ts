import { test } from "node:test";
import assert from "node:assert/strict";
import { followUpError } from "./disputeGuards.ts";
import type { Letter } from "./types";
const now = Date.parse("2026-11-06");
const base = { id: 1, type: "bureau_dispute", status: "sent", mail_test: false, recipient_name: "Equifax", item_ids: [1], sent_at: "2026-07-01", delivered_at: "2026-07-05", response: "" } as Letter;
const check = (changes: Partial<Letter> = {}, type: Letter["type"] = "no_response") => followUpError(type, [1], "Equifax", [{ ...base, ...changes }], now);
test("requires confirmed receipt and conservative waiting period", () => {
  assert.ok(check({ delivered_at: "" }));
  assert.ok(check({ delivered_at: "2026-10-20" }));
  assert.equal(check(), null);
});
test("rejects simulated mail, wrong recipient and completed investigations", () => {
  assert.ok(check({ mail_test: true }));
  assert.ok(check({ recipient_name: "Experian" }));
  assert.ok(check({ response: "verified" }));
});
test("verification procedure requires a verified result", () => {
  assert.ok(check({}, "method_of_verification"));
  assert.equal(check({ response: "verified" }, "method_of_verification"), null);
});
test("a newer dispute supersedes an older eligible one", () => {
  assert.ok(followUpError("no_response", [1], "Equifax", [base, { ...base, id: 2, sent_at: "2026-11-01", delivered_at: "" }], now));
});
