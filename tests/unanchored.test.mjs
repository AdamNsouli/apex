import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  route,
  initialControl,
  switchPayback,
  thinkingMode,
} from "../plugins/apex/core/router.mjs";
import { joinCatalogue, aaModels } from "../plugins/apex/core/catalogue.mjs";
import { replay } from "../scripts/replay.mjs";

// Synthetic data shaped like a real three-model family: a small, a middle and a big
// model, each at five efforts, with different extra thinking flags (the small one can
// turn thinking off, the middle one can think between tools). All three think
// adaptively, which is what the engine asks for.
const LEVELS = ["low", "medium", "high", "xhigh", "max"];
const FAMILY = {
  small: {
    thinking: {
      adaptive: { supported: true },
      disabled: { supported: true },
      between_tools: { supported: false },
    },
    prices: [0.1, 0.5, 0.01, 0.125],
    rows: [
      [29, 0.02, 9],
      [34, 0.05, 10],
      [38, 0.08, 22],
      [41, 0.12, 58],
      [43, 0.21, 318],
    ],
  },
  mid: {
    thinking: {
      adaptive: { supported: true },
      disabled: { supported: false },
      between_tools: { supported: true },
    },
    prices: [2, 10, 0.1, 2.5],
    rows: [
      [36, 0.35, 6],
      [41, 0.48, 6],
      [47, 0.88, 14],
      [52, 2.0, 31],
      [56, 5.5, 360],
    ],
  },
  big: {
    thinking: {
      adaptive: { supported: true },
      disabled: { supported: false },
      between_tools: { supported: false },
    },
    prices: [5, 25, 0.5, 6.25],
    rows: [
      [42, 0.55, 11],
      [51, 1.34, 18],
      [54, 1.82, 30],
      [56, 3.46, 113],
      [58, 5.98, 609],
    ],
  },
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const world = (ids = Object.keys(FAMILY)) => {
  const runtime = ids.map((id) => ({
    id,
    name: id,
    efforts: LEVELS,
    effortSupported: true,
    context: 1000000,
    outputCap: 64000,
    capabilities: {},
    thinking: FAMILY[id].thinking,
  }));
  const aa = ids.flatMap((id) =>
    FAMILY[id].rows.flatMap((r, i) =>
      aaModels({
        intelligence_index_version: 4.3,
        data: [
          {
            id: id + i,
            name: id + " (" + cap(LEVELS[i]) + ")",
            slug: LEVELS[i] === "max" ? id : id + "-" + LEVELS[i],
            model_creator: { name: "Anthropic" },
            evaluations: { artificial_analysis_intelligence_index: r[0] },
            pricing: {
              price_1m_input_tokens: FAMILY[id].prices[0],
              price_1m_output_tokens: FAMILY[id].prices[1],
              price_1m_cache_hit_tokens: FAMILY[id].prices[2],
              price_1m_cache_write_tokens: FAMILY[id].prices[3],
            },
            performance: { median_end_to_end_response_time_seconds: r[2] },
            benchmark_cost_per_task_usd: r[1],
          },
        ],
      }).map((a) => ({ ...a, benchmarkCostPerTask: r[1] })),
    ),
  );
  return joinCatalogue(runtime, aa, [], ids);
};
const NOW = 2000000000000;
const decide = ({
  models = world(),
  intent = {},
  original = { model: "big", effort: "max" },
  mode = "balanced",
  inputTokens = 20000,
  lastModel = null,
  lastEffort,
  stepsOnModel = 2,
  fetchedAt = NOW - 3600000,
} = {}) =>
  route({
    original,
    control: { ...initialControl(), mode, backend: "subscription" },
    intent: {
      task: "general",
      risk: "normal",
      difficulty: "standard",
      failures: 0,
      ...intent,
    },
    models,
    fetchedAt,
    now: NOW,
    inputTokens,
    lastModel,
    lastEffort,
    stepsOnModel,
  });
const at = (r) => r.pair.model + "/" + r.pair.effort;

test("all three models count as one thinking mode, so they can share a chat", () => {
  const models = world();
  assert.ok(models.every((m) => m.routable));
  assert.deepEqual(new Set(models.map(thinkingMode)), new Set(["adaptive"]));
});

test("a chat started on the big model moves to another model when that is better value", () => {
  // Starting on big/max, a quick task with a short context goes to the mid model.
  const r = decide({ intent: { difficulty: "simple" } });
  assert.equal(r.pair.model, "mid");
  // Starting on the small model, a hard task moves up to the big one.
  const up = decide({
    intent: { difficulty: "complex" },
    original: { model: "small", effort: "medium" },
  });
  assert.equal(up.pair.model, "big");
});

test("a pair the benchmarks do not name no longer freezes routing", () => {
  // No effort set: the model's own default, which no benchmark row names.
  const r = decide({
    original: { model: "big" },
    intent: { difficulty: "simple" },
  });
  assert.notEqual(r.reason, "baseline_evidence_unknown");
  assert.equal(r.pair.model, "mid");
});

test("on a very long chat a cheaper model that cannot repay the cache write is skipped", () => {
  // 900k tokens held by big: moving to mid writes all of it again, which five
  // cheaper requests cannot repay, so the cheapest acceptable big effort is kept.
  const r = decide({
    intent: { difficulty: "simple" },
    inputTokens: 900000,
    lastModel: "big",
    lastEffort: "max",
  });
  assert.equal(r.pair.model, "big");
  assert.equal(r.reason, "switch_does_not_pay_back");
  assert.equal(at(r), "big/low");
});

test("the cache payback sum: one cache write against five cheaper requests", () => {
  const rec = (prices) => ({ record: { evidence: { prices } } });
  const winner = {
    ...rec({ cacheRead: 0.1, cacheWrite: 2.5 }),
    costPerTaskUsd: 0.5,
    rawScore: 41,
    latencyMs: 6000,
  };
  const stay = {
    ...rec({ cacheRead: 0.5, cacheWrite: 6.25 }),
    costPerTaskUsd: 0.55,
    rawScore: 42,
    latencyMs: 11000,
  };
  const small = switchPayback(winner, stay, 10000);
  // stay: 5 x (0.55 + 0.01 x 0.5) = 2.775; move: 5 x (0.5 + 0.01 x 0.1) + 0.01 x 2.4 = 2.529
  assert.ok(Math.abs(small.stayUsd - 2.775) < 1e-9);
  assert.ok(Math.abs(small.moveUsd - 2.529) < 1e-9);
  assert.equal(small.pays, true);
  assert.equal(switchPayback(winner, stay, 900000).pays, false);
  // Sports judges the wait, High Quality the score.
  assert.equal(switchPayback(winner, stay, 900000, "speed").pays, true);
  assert.equal(switchPayback(winner, stay, 10000, "score").pays, false);
  // Missing prices never count as free.
  assert.equal(switchPayback({ ...winner, record: {} }, stay, 10000), null);
});

test("a risky task stays on a strong pair even though routing is no longer held at the start", () => {
  const r = decide({
    intent: { risk: "high" },
    original: { model: "small", effort: "low" },
  });
  assert.equal(r.tier, "critical");
  assert.ok(r.ranked[0].shareOfBest >= 0.97);
});

test("data older than three days still may not drop below the starting pair", () => {
  const r = decide({
    intent: { difficulty: "simple" },
    fetchedAt: NOW - 4 * 86400000,
  });
  assert.equal(at(r), "big/max");
});

test("the replay runs offline over the example prompts and reports each mode", async () => {
  const prompts = JSON.parse(
    await readFile(
      new URL("./fixtures/replay-prompts.example.json", import.meta.url),
      "utf8",
    ),
  ).prompts;
  const models = world();
  const runtime = models
    .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
    .map(
      ({
        id,
        name,
        efforts,
        effortSupported,
        context,
        outputCap,
        capabilities,
        thinking,
      }) => ({
        id,
        name,
        efforts,
        effortSupported,
        context,
        outputCap,
        capabilities,
        thinking,
      }),
    );
  const store = {
    catalogue: {
      runtime,
      aa: { fetchedAt: NOW, models: models.map((m) => m.evidence) },
    },
    control: { mappings: [], verifiedIds: ["small", "mid", "big"] },
  };
  const results = await replay({
    prompts,
    store,
    coreDir: new URL("../plugins/apex/core", import.meta.url).pathname,
    starts: [{ model: "big", effort: "max" }],
  });
  assert.deepEqual(
    results.map((r) => r.mode),
    ["eco", "balanced", "sports", "quality"],
  );
  const balanced = results.find((r) => r.mode === "balanced");
  assert.equal(balanced.prompts, prompts.length);
  assert.ok(balanced.modelMoved > 0, "balanced moves off the starting model");
  assert.ok(balanced.usageVsStart < 1, "balanced uses less than always-max");
  const quality = results.find((r) => r.mode === "quality");
  assert.equal(quality.underserved, 0);
});
