import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contextOffer,
  parseContextArg,
  contextSetting,
  CONTEXT_DEFAULT,
} from "../plugins/apex/core/context.mjs";

test("no offer under the threshold, and crossing it offers once", () => {
  let r = contextOffer({ setting: 200000, tokens: 150000 });
  assert.equal(r.offer, null);
  r = contextOffer({ setting: 200000, tokens: 240000, fixedTokens: 74000 });
  assert.match(r.offer.text, /240k tokens on every request/);
  assert.match(r.offer.text, /fresh chat starts near 74k \(3\.2× less/);
  assert.equal(r.armedAt, 340000);
  // The next turn at a similar size does not repeat it.
  const again = contextOffer({
    setting: 200000,
    tokens: 260000,
    armedAt: r.armedAt,
  });
  assert.equal(again.offer, null);
  // 100k more and it offers again.
  assert.ok(
    contextOffer({ setting: 200000, tokens: 345000, armedAt: r.armedAt }).offer,
  );
});

test("a compaction (context back under the threshold) re-arms", () => {
  const r = contextOffer({ setting: 200000, tokens: 90000, armedAt: 340000 });
  assert.equal(r.armedAt, null);
});

test("never offers while agents run, after an interrupted turn, or when off", () => {
  assert.equal(
    contextOffer({ setting: 200000, tokens: 300000, busy: true }).offer,
    null,
  );
  assert.equal(
    contextOffer({ setting: 200000, tokens: 300000, reason: "aborted" }).offer,
    null,
  );
  assert.equal(contextOffer({ setting: "off", tokens: 900000 }).offer, null);
});

test("without a fixed-load reading the text leaves the comparison out", () => {
  const r = contextOffer({ setting: 200000, tokens: 210000 });
  assert.doesNotMatch(r.offer.text, /fresh chat/);
});

test("command arguments parse to a bounded setting", () => {
  assert.equal(parseContextArg("off"), "off");
  assert.equal(parseContextArg("on"), CONTEXT_DEFAULT);
  assert.equal(parseContextArg("150k"), 150000);
  assert.equal(parseContextArg("250000"), 250000);
  assert.equal(parseContextArg("10k"), null);
  assert.equal(parseContextArg("lots"), null);
  assert.equal(contextSetting(undefined), CONTEXT_DEFAULT);
  assert.equal(contextSetting(12), CONTEXT_DEFAULT);
});
