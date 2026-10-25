import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectPair,
  tierFor,
  TIERS,
  MODES,
} from "../plugins/apex/core/scoring.mjs";
import { route, initialControl } from "../plugins/apex/core/router.mjs";
import {
  aaModels,
  joinCatalogue,
  describeRefresh,
} from "../plugins/apex/core/catalogue.mjs";
import { present } from "../plugins/apex/core/presentation.mjs";

// All data here is synthetic. The point is that no model name appears in the policy:
// the picks follow from the numbers, so changed numbers change the picks.
const pair = (model, rawScore, costPerTaskUsd, seconds, extra = {}) => ({
  model,
  effort: "high",
  rawScore,
  benchmarkVersion: "synthetic",
  costPerTaskUsd,
  costUpperUsd: 1,
  latencyMs: seconds == null ? null : seconds * 1000,
  ...extra,
});
const ladder = () => [
  pair("cheap", 40, 0.1, 5),
  pair("mid", 55, 1, 15),
  pair("strong", 66, 2, 50),
  pair("stronger", 68, 3, 100),
  pair("top", 72, 6, 400),
];
const pick = (candidates, mode, tier) =>
  selectPair(candidates, mode, "none|high", { tier });

test("each tier takes the cheapest pair that reaches its share of the best score in time", () => {
  assert.equal(pick(ladder(), "balanced", "quick").selected.model, "mid");
  assert.equal(pick(ladder(), "balanced", "everyday").selected.model, "strong");
  assert.equal(pick(ladder(), "balanced", "hard").selected.model, "stronger");
});

test("when no acceptable pair is quick enough the wait limit is relaxed and the fastest wins", () => {
  const r = pick(ladder(), "balanced", "critical");
  assert.equal(r.selected.model, "top");
  assert.equal(r.target.relaxed, true);
  const slow = [pair("a", 60, 1, 300), pair("b", 62, 5, 100)];
  assert.equal(pick(slow, "balanced", "quick").selected.model, "b");
});

test("High Quality takes the strongest score and Sports the fastest near it", () => {
  assert.equal(pick(ladder(), "quality", "quick").selected.model, "top");
  const near = [...ladder(), pair("swift", 70, 4, 30)];
  assert.equal(pick(near, "sports", "quick").selected.model, "swift");
});

test("Eco asks for a lower share of the best score than Balanced", () => {
  // lean reaches 81% of the best score: enough for Eco (78%), not for Balanced (88%).
  const c = [
    pair("lean", 58, 0.5, 10),
    pair("full", 66, 2, 30),
    pair("top", 72, 6, 90),
  ];
  assert.equal(pick(c, "balanced", "everyday").selected.model, "full");
  assert.equal(pick(c, "eco", "everyday").selected.model, "lean");
});

test("a pair that is dearer and no better is never chosen", () => {
  const withDominated = [...ladder(), pair("wasteful", 66, 9, 300)];
  for (const mode of ["eco", "balanced"])
    for (const tier of ["quick", "everyday", "hard", "critical"])
      assert.notEqual(
        pick(withDominated, mode, tier).selected.model,
        "wasteful",
      );
});

test("a pair without a measured cost is not ranked; none at all holds", () => {
  const c = [...ladder(), pair("unpriced", 66, null, 1)];
  const r = pick(c, "balanced", "everyday");
  assert.equal(r.selected.model, "strong");
  assert.ok(!r.ranked.some((p) => p.model === "unpriced"));
  assert.deepEqual(pick([pair("x", 1, null, 1)], "balanced", "everyday"), {
    kind: "hold",
    reason: "cost_evidence_missing",
  });
});

test("a missing latency cannot show a pair is too slow", () => {
  const c = [...ladder(), pair("unknown-speed", 66, 1.5, null)];
  assert.equal(pick(c, "balanced", "everyday").selected.model, "unknown-speed");
});

test("exact ties keep the current pair", () => {
  const c = [pair("a", 60, 1, 10), pair("b", 60, 1, 10)];
  assert.equal(selectPair(c, "balanced", "b|high").selected.model, "b");
  assert.equal(selectPair(c, "balanced", "a|high").selected.model, "a");
});

test("ranked pairs carry their share of the best score", () => {
  const r = pick(ladder(), "balanced", "critical");
  assert.ok(r.ranked.every((p) => p.shareOfBest >= TIERS.critical.share));
  const everyday = pick(ladder(), "balanced", "everyday");
  assert.deepEqual(
    everyday.ranked.map((p) => p.model),
    ["strong"],
  );
  assert.equal(everyday.ranked[0].shareOfBest, 66 / 72);
});

test("invalid inputs are rejected loudly", () => {
  assert.throws(() => selectPair(ladder(), "nope", "x"), /Invalid mode/);
  assert.throws(() => pick(ladder(), "balanced", "nope"), /Invalid tier/);
  assert.throws(
    () => pick([pair("a", 1, -1, 1)], "balanced", "everyday"),
    /Invalid estimate/,
  );
  assert.ok(!Object.hasOwn(MODES, "toString"));
});

test("the tier follows the classified intent", () => {
  assert.equal(tierFor({ difficulty: "simple", risk: "normal" }), "quick");
  assert.equal(tierFor({ difficulty: "standard", risk: "normal" }), "everyday");
  assert.equal(tierFor({ difficulty: "complex", risk: "normal" }), "hard");
  assert.equal(tierFor({ difficulty: "standard", risk: "high" }), "critical");
  assert.equal(
    tierFor({ difficulty: "standard", risk: "unknown" }),
    "everyday",
  );
  assert.equal(tierFor({ difficulty: "complex", risk: "high" }), "critical");
  assert.equal(
    tierFor({ difficulty: "standard", risk: "normal", failures: 2 }),
    "critical",
  );
});

// ---- the whole route, from benchmark records to a choice -------------------------
const LEVELS = ["low", "medium", "high", "xhigh", "max"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const runtimeModel = (id) => ({
  id,
  name: id,
  efforts: LEVELS,
  effortSupported: true,
  context: 1000000,
  outputCap: 1000,
  capabilities: {},
  thinking: { adaptive: { supported: true } },
});
// rows: [general score, USD per task, median seconds] for low..max
const records = (id, rows, extra = {}) =>
  rows.flatMap((r, i) =>
    aaModels({
      intelligence_index_version: 4.3,
      data: [
        {
          id: id + i,
          name: id + " (" + cap(LEVELS[i]) + ")",
          slug: LEVELS[i] === "max" ? id : id + "-" + LEVELS[i],
          model_creator: { name: "Anthropic" },
          evaluations: {
            artificial_analysis_intelligence_index: r[0],
            ...(extra.legal
              ? { artificial_analysis_legal_index: extra.legal[i] }
              : {}),
          },
          pricing: {
            price_1m_input_tokens: 1,
            price_1m_output_tokens: 2,
            price_1m_cache_hit_tokens: 0.1,
            price_1m_cache_write_tokens: 1.25,
          },
          performance: { median_end_to_end_response_time_seconds: r[2] },
          artificial_analysis_intelligence_index_cost: {
            cost_per_task: { total_cost: r[1] },
          },
        },
      ],
    }),
  );
const ALPHA = [
  [30, 0.2, 4],
  [40, 0.4, 6],
  [50, 0.9, 15],
  [56, 2, 40],
  [58, 4, 300],
];
const BETA = [
  [42, 0.5, 12],
  [52, 1.2, 25],
  [56, 1.8, 50],
  [60, 3.5, 130],
  [62, 6, 600],
];
const GAMMA = [
  [40, 0.2, 5],
  [57, 0.7, 20],
  [60, 1, 40],
  [61, 2, 90],
  [62, 3.5, 300],
];
const world = (ids, confirmed = ids, extra = {}) => {
  const table = { alpha: ALPHA, beta: BETA, gamma: GAMMA };
  const aa = ids.flatMap((id) => records(id, table[id], extra[id] ?? {}));
  return joinCatalogue(ids.map(runtimeModel), aa, [], confirmed);
};
const decide = (
  models,
  intent,
  original = { model: "alpha", effort: "medium" },
  mode = "balanced",
) =>
  route({
    original,
    control: {
      ...initialControl(),
      mode,
      backend: "subscription",
      verifiedIds: ["alpha", "beta", "gamma"],
    },
    intent: {
      task: "general",
      risk: "normal",
      difficulty: "standard",
      failures: 0,
      ...intent,
    },
    models,
    fetchedAt: 1000000000,
    now: 1000000000,
    inputTokens: 1000,
  });
const at = (r) => r.pair.model + "/" + r.pair.effort;

test("routing follows the numbers and needs no per-model setup", () => {
  const models = world(["alpha", "beta"]);
  assert.ok(models.every((m) => m.routable && m.mappingSource === "auto"));
  assert.equal(at(decide(models, { difficulty: "simple" })), "alpha/high");
  assert.equal(at(decide(models, {})), "beta/high");
  const r = decide(models, {});
  assert.equal(r.reason, "balanced_policy");
  assert.equal(r.tier, "everyday");
  assert.equal(r.scoreBasis, "general");
});

test("a new model that earns its place is used once its access is confirmed, and not before", () => {
  const before = decide(world(["alpha", "beta"]), {});
  assert.equal(at(before), "beta/high");
  const unconfirmed = decide(
    world(["alpha", "beta", "gamma"], ["alpha", "beta"]),
    {},
  );
  assert.equal(at(unconfirmed), "beta/high");
  const confirmed = decide(world(["alpha", "beta", "gamma"]), {});
  assert.equal(at(confirmed), "gamma/medium");
});

test("changed benchmark numbers change the pick on the next refresh", () => {
  const cheaper = records("beta", [
    [42, 0.5, 12],
    [52, 1.2, 25],
    [56, 0.8, 50],
    [60, 3.5, 130],
    [62, 6, 600],
  ]);
  const aa = [...records("alpha", ALPHA), ...cheaper];
  const models = joinCatalogue(
    ["alpha", "beta"].map(runtimeModel),
    aa,
    [],
    ["alpha", "beta"],
  );
  assert.equal(at(decide(models, {})), "beta/high");
  const slower = records("beta", [
    [42, 0.5, 12],
    [52, 1.2, 25],
    [56, 1.8, 200],
    [60, 3.5, 130],
    [62, 6, 600],
  ]);
  const models2 = joinCatalogue(
    ["alpha", "beta"].map(runtimeModel),
    [...records("alpha", ALPHA), ...slower],
    [],
    ["alpha", "beta"],
  );
  assert.equal(at(decide(models2, {})), "alpha/xhigh");
});

test("a risky task is held to the critical tier, not to the pair the chat started on", () => {
  const models = world(["alpha", "beta"]);
  const r = decide(
    models,
    { risk: "high" },
    { model: "beta", effort: "xhigh" },
  );
  assert.equal(r.tier, "critical");
  assert.ok(r.ranked[0].shareOfBest >= TIERS.critical.share);
  assert.equal(at(r), "beta/max");
});

test("an unclear request keeps the everyday tier and the native pair, not a stronger one", () => {
  const models = world(["alpha", "beta"]);
  const r = decide(
    models,
    { risk: "unknown" },
    { model: "beta", effort: "high" },
  );
  assert.equal(r.tier, "everyday");
  assert.equal(at(r), "beta/high");
});

test("an index for the task is used only when every compared pair has it", () => {
  const legal = [10, 20, 30, 40, 50];
  const all = world(["alpha", "beta"], undefined, {
    alpha: { legal },
    beta: { legal },
  });
  assert.equal(decide(all, { task: "legal" }).scoreBasis, "legal");
  const some = world(["alpha", "beta"], undefined, { alpha: { legal } });
  assert.equal(decide(some, { task: "legal" }).scoreBasis, "general");
});

test("a change of effort alone skips the cache payback; a change of model still needs it", () => {
  const models = world(["alpha", "beta"]);
  // beta/xhigh -> beta/high is a downgrade within one model: allowed.
  assert.equal(
    at(decide(models, {}, { model: "beta", effort: "xhigh" })),
    "beta/high",
  );
  // beta/max -> alpha/xhigh would be a downgrade to another model at the same token
  // prices, which cannot pay back re-storing the conversation.
  const r = decide(
    world(["alpha"]),
    { difficulty: "simple" },
    { model: "alpha", effort: "max" },
  );
  assert.equal(at(r), "alpha/high");
});

test("data without cost per task keeps the native pair", () => {
  const stripped = world(["alpha", "beta"]).map((m) => ({
    ...m,
    evidence: { ...m.evidence, benchmarkCostPerTask: null },
  }));
  const r = decide(stripped, {});
  assert.equal(r.reason, "cost_evidence_missing");
  assert.equal(at(r), "alpha/medium");
});

// ---- automatic mapping -----------------------------------------------------------
test("effort variants join by themselves for confirmed models; your own mappings stay the whole truth", () => {
  const aa = records("alpha", ALPHA);
  const confirmed = joinCatalogue([runtimeModel("alpha")], aa, [], ["alpha"]);
  assert.equal(confirmed.length, 5);
  assert.ok(confirmed.every((m) => m.routable));
  assert.deepEqual(
    confirmed.map((m) => m.effort),
    LEVELS,
  );
  const unconfirmed = joinCatalogue([runtimeModel("alpha")], aa, [], []);
  assert.ok(unconfirmed.every((m) => !m.routable));
  assert.ok(
    unconfirmed.every((m) => m.exclusions.includes("account_not_confirmed")),
  );
  const own = joinCatalogue(
    [runtimeModel("alpha")],
    aa,
    [{ runtimeId: "alpha", aaSlug: "alpha-high", effort: "high" }],
    ["alpha"],
  );
  assert.deepEqual(
    own.map((m) => [m.effort, m.mappingSource]),
    [["high", "user"]],
  );
});

test("a record whose own name states another effort is not joined as that level", () => {
  const aa = records("alpha", ALPHA).map((a) =>
    a.slug === "alpha-medium"
      ? { ...a, name: "alpha (High)", effort: "high" }
      : a,
  );
  const joined = joinCatalogue([runtimeModel("alpha")], aa, [], ["alpha"]);
  assert.ok(!joined.some((m) => m.effort === "medium"));
});

// ---- what a refresh changed ------------------------------------------------------
const snap = (ids, aaRows) => ({
  runtime: ids.map((id) => ({ id })),
  aa: { models: aaRows },
});
test("a refresh reports new and dropped models, new variants and real changes for confirmed models", () => {
  const was = snap(
    ["alpha", "beta"],
    [...records("alpha", ALPHA), ...records("beta", BETA)],
  );
  const changed = records("alpha", ALPHA).map((a) =>
    a.slug === "alpha-high"
      ? {
          ...a,
          scores: { ...a.scores, general: 53 },
          benchmarkCostPerTask: 1.5,
        }
      : a.slug === "alpha-low"
        ? { ...a, scores: { ...a.scores, general: 30.2 } }
        : a,
  );
  const is = snap(["alpha", "gamma"], [...changed, ...records("gamma", GAMMA)]);
  const d = describeRefresh(was, is, ["alpha"], 123);
  assert.deepEqual(d.newModels, ["gamma"]);
  assert.deepEqual(d.droppedModels, ["beta"]);
  assert.equal(d.at, 123);
  assert.deepEqual(
    d.changedEvidence.map((c) => c.slug),
    ["alpha-high"],
  );
  assert.ok(
    d.changedEvidence[0].changes.some((c) => c.startsWith("general 50")),
  );
  assert.ok(
    d.changedEvidence[0].changes.some((c) => c.startsWith("cost per task")),
  );
});

test("the first discovery reports nothing as new, and an unchanged refresh reports nothing", () => {
  const rows = records("alpha", ALPHA);
  const first = describeRefresh(
    { runtime: [], aa: null },
    snap(["alpha"], rows),
    ["alpha"],
  );
  assert.deepEqual(
    [
      first.newModels,
      first.droppedModels,
      first.newEvidence,
      first.changedEvidence,
    ],
    [[], [], [], []],
  );
  const same = describeRefresh(snap(["alpha"], rows), snap(["alpha"], rows), [
    "alpha",
  ]);
  assert.deepEqual(
    [
      same.newModels,
      same.droppedModels,
      same.newEvidence,
      same.changedEvidence,
    ],
    [[], [], [], []],
  );
});

test("a new effort variant of a confirmed model is reported", () => {
  const rows = records("alpha", ALPHA);
  const d = describeRefresh(
    snap(
      ["alpha"],
      rows.filter((a) => a.slug !== "alpha-xhigh"),
    ),
    snap(["alpha"], rows),
    ["alpha"],
  );
  assert.deepEqual(d.newEvidence, ["alpha-xhigh"]);
});

test("the new-model notice names the models and the command, then goes away", () => {
  const base = {
    control: { verifiedIds: ["alpha"] },
    runtime: [{ id: "gamma", name: "Gamma 1" }],
    changes: { at: 1000, newModels: ["gamma"] },
    connected: true,
    now: 2000,
  };
  const p = present(base, { now: 2000 });
  assert.match(p.notice, /Gamma 1/);
  assert.match(p.notice, /\/apex confirm-models gamma/);
  assert.equal(
    present(
      { ...base, control: { verifiedIds: ["alpha", "gamma"] } },
      { now: 2000 },
    ).notice,
    null,
  );
  assert.equal(present(base, { now: 1000 + 8 * 86400000 }).notice, null);
});
