import test from "node:test";
import assert from "node:assert/strict";
import {
  guidanceForModel,
  guidanceStatus,
  guidanceText,
} from "../plugins/apex/core/anthropic-guidance.mjs";
import {
  route,
  initialControl,
  switchPayback,
} from "../plugins/apex/core/router.mjs";
import { freezeDecision } from "../plugins/apex/core/receipt.mjs";
import { createCompanion } from "../plugins/apex/companion/server.mjs";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const record = (effort, score, cost, extra = {}) => ({
  runtimeId: "synthetic",
  effort,
  routable: true,
  context: 1000000,
  outputCap: 1000,
  thinking: { adaptive: { supported: true } },
  evidence: {
    slug: `synthetic-${effort}`,
    benchmarkVersion: "fixture",
    scores: { general: score },
    benchmarkCostPerTask: cost,
    latencyMs: 1000,
    prices: { input: 1, output: 1, cacheRead: 0.1, cacheWrite: 10, ...extra },
  },
});
const options = () => ({
  original: { model: "synthetic", effort: "high" },
  control: { ...initialControl(), backend: "subscription", mode: "balanced" },
  intent: {
    task: "general",
    risk: "normal",
    difficulty: "standard",
    failures: 0,
  },
  models: [record("high", 40, 1), record("low", 40, 0.99)],
  fetchedAt: NOW,
  now: NOW,
  inputTokens: 900000,
});

test("a marginal effort change cannot pretend a large cached prefix is free", () => {
  const result = route(options());
  assert.equal(result.pair.effort, "high");
  assert.equal(result.reason, "effort_change_does_not_pay_back");
  assert.equal(result.cacheAssessment.rewrite, true);
  assert.ok(result.cacheAssessment.moveUsd > result.cacheAssessment.stayUsd);
});
test("a useful effort reduction still pays on a short context", () => {
  assert.equal(route({ ...options(), inputTokens: 100 }).pair.effort, "low");
});
test("only an explicitly verified per-message transport skips the effort rewrite", () => {
  assert.equal(
    route({ ...options(), effortCacheMode: "per_message" }).pair.effort,
    "low",
  );
  for (const effortCacheMode of ["top_level", "unknown", "invalid"]) {
    assert.equal(route({ ...options(), effortCacheMode }).pair.effort, "high");
  }
});
test("missing rewrite prices keep an eligible cached effort, never treating it as zero", () => {
  const args = options();
  args.models[1].evidence.prices.cacheWrite = null;
  assert.equal(route(args).reason, "effort_change_cost_unknown");
});
test("cache protection cannot trap a required quality escalation or override a manual pin", () => {
  const args = options();
  args.models = [record("high", 10, 0.01), record("max", 40, 2)];
  args.intent.risk = "high";
  assert.equal(route(args).pair.effort, "max");
  assert.equal(route({ ...args, pinned: true }).pair.effort, "high");
});
test("an existing eligible effort cannot suppress a selected benchmark capability improvement", () => {
  const args = options();
  args.models = [record("high", 40, 1), record("xhigh", 40.1, 1)];
  const result = route(args);
  assert.equal(result.pair.effort, "xhigh");
  assert.equal(result.cacheAssessment.pays, false);
  assert.equal(result.cacheAssessment.qualityImprovementProtected, true);
});
test("Max Power once still selects a measured strongest eligible effort", () => {
  const args = options();
  args.control.mode = "best_once";
  args.models.push(record("max", 80, 100));
  assert.equal(route(args).pair.effort, "max");
});
test("both alternatives pay their actual transition cost; per-message cannot erase a model switch", () => {
  const make = (model, effort) => ({
    model,
    effort,
    rawScore: 50,
    costPerTaskUsd: 1,
    record: { evidence: { prices: { cacheRead: 0.1, cacheWrite: 10 } } },
  });
  const result = switchPayback(
    make("other", "low"),
    make("cached", "medium"),
    900000,
    "value",
    0.15,
    { cachePair: { model: "cached", effort: "high" } },
  );
  assert.equal(result.moveUsd, result.stayUsd);
  const changed = switchPayback(
    make("other", "low"),
    make("cached", "high"),
    900000,
    "value",
    0.15,
    {
      cachePair: { model: "cached", effort: "high" },
      effortCacheMode: "per_message",
    },
  );
  assert.equal(changed.rewrite, true);
  assert.ok(changed.moveUsd > changed.stayUsd);
});
test("official profiles distinguish API defaults and valid ways to reduce upfront thinking", () => {
  assert.equal(guidanceForModel("claude-opus-5-5").apiDefaultEffort, "medium");
  assert.equal(guidanceForModel("claude-opus-5-5").thinking.alwaysOn, true);
  assert.equal(guidanceForModel("claude-sonnet-5-5").apiDefaultEffort, "high");
  assert.equal(
    guidanceForModel("claude-sonnet-5-5").thinking.withoutUpfront,
    "between_tools",
  );
  assert.equal(
    guidanceForModel("claude-haiku-5-5").thinking.withoutUpfrontMax,
    "high",
  );
  assert.equal(guidanceForModel("unknown-provider-alias"), null);
  assert.equal(guidanceForModel("__proto__"), null);
});
test("guidance stays dated, detects an overdue review and does not confirm or enable models", () => {
  assert.equal(guidanceStatus(NOW).stale, false);
  assert.equal(guidanceStatus(NOW + 31 * 86400000).stale, true);
  assert.equal(guidanceStatus(null).stale, true);
  const ids = ["claude-haiku-5-5"],
    before = [...ids];
  const out = guidanceText({
    model: "claude-fable-5-2",
    verifiedIds: ids,
    now: NOW,
  });
  assert.match(out, /User-confirmed: no/);
  assert.match(
    out,
    /https:\/\/platform.claude.com\/docs\/en\/build-with-claude\/effort/,
  );
  assert.deepEqual(ids, before);
});
test("historical receipts freeze both benchmark evidence and the advice/cache assumptions used", () => {
  const args = options();
  args.models[0].runtimeId = "claude-opus-5-5";
  const pair = { model: "claude-opus-5-5", effort: "high" };
  const snap = freezeDecision({
    original: pair,
    decision: { pair, reason: "fixture", effortCacheMode: "unknown" },
    models: args.models,
    task: "general",
    fetchedAt: NOW,
    now: NOW,
  });
  assert.equal(snap.modelGuidance.reviewedAt, "2026-11-23");
  assert.equal(snap.modelGuidance.apiDefaultEffort, "medium");
  assert.equal(snap.effortCacheMode, "unknown");
  assert.ok(Object.isFrozen(snap.modelGuidance.thinking));
  assert.equal(snap.accountCharge, null);
});
test("the actual companion serves the guidance module needed by the receipt import", async () => {
  const server = await createCompanion({ aaKey: null });
  try {
    const res = await fetch(new URL("/anthropic-guidance.mjs", server.url));
    assert.equal(res.status, 200);
    assert.match(await res.text(), /GUIDANCE_REVIEWED_AT/);
  } finally {
    await server.close();
  }
});
