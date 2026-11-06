import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewStage, reviewError } from "./review.ts";
import type { Item } from "./types";
const item = { creditor: "AFFIRM", category: "charge_off", review_stage: "unreviewed", payment_status: "unconfirmed", evidence_notes: "" } as Item;
test("unknown payment defaults to gathering evidence, mortgage to hold", () => {
  assert.equal(reviewStage(item), "gather");
  assert.equal(reviewStage({ ...item, creditor: "PLANET HOME LENDING" }), "hold");
  assert.equal(reviewStage({ ...item, creditor: "PLANET HOME LENDING", review_stage: "ready" }), "ready");
});
test("ready requires evidence; any held account blocks a batch", () => {
  assert.ok(reviewError([item]));
  assert.ok(reviewError([{ ...item, review_stage: "ready" }]));
  const ready = { ...item, review_stage: "ready", evidence_notes: "Statement dated June 30: payment credited June 27." } as Item;
  assert.equal(reviewError([ready]), null);
  assert.ok(reviewError([ready, { ...ready, review_stage: "hold" }]));
});
