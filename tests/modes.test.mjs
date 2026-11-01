import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectPair,
  MODES,
  modeName,
  migrateMode,
} from "../plugins/apex/core/scoring.mjs";
import {
  ULTRACODE_TIERS,
  applyControl,
  initialControl,
  agentPlan,
  wantsFanOut,
  fanOutNote,
  switchPayback,
} from "../plugins/apex/core/router.mjs";
import {
  MODES as LABELS,
  REASONS,
  modeSpec,
} from "../plugins/apex/core/presentation.mjs";

// Synthetic pairs only. Best score 100; the names say what each pair is.
const pair = (model, rawScore, costPerTaskUsd, seconds) => ({
  model,
  effort: "high",
  rawScore,
  benchmarkVersion: "synthetic",
  costPerTaskUsd,
  costUpperUsd: 1,
  latencyMs: seconds * 1000,
});
const field = () => [
  pair("dear-top", 100, 10, 60),
  pair("near-fast", 96, 8, 5),
  pair("mid", 85, 2, 30),
  pair("cheap-slow", 65, 0.2, 400),
  pair("cheap-fast", 62, 0.35, 8),
  pair("fast-weak", 45, 3, 1),
  pair("unpriced", 70, null, 2),
];
const pick = (mode, tier, c = field()) =>
  selectPair(c, mode, "none|high", { tier }).selected.model;

test("there are exactly six modes, each with a label and a reason", () => {
  const names = [
    "balanced",
    "cost_efficient",
    "time_efficient",
    "max_power",
    "max_speed",
    "max_power_speed",
  ];
  assert.deepEqual(Object.keys(MODES), names);
  assert.deepEqual(Object.keys(LABELS), names);
  assert.deepEqual(
    names.map((m) => LABELS[m].label),
    [
      "Balanced",
      "Cost Efficient",
      "Time Efficient",
      "Max Power",
      "Max Speed",
      "Max Power + Speed",
    ],
  );
  for (const m of names) assert.ok(REASONS[m + "_policy"], m);
});

test("Balanced keeps the 0.8 value rule: floor, wait limit, most score for the usage", () => {
  // cheap-slow is over the floor but too slow; mid gives the most value.
  assert.equal(pick("balanced", "everyday"), "mid");
});

test("Cost Efficient picks the cheapest pair over the floor, however slow", () => {
  assert.equal(pick("cost_efficient", "everyday"), "cheap-slow");
  const r = selectPair(field(), "cost_efficient", "x", { tier: "everyday" });
  assert.equal(r.target.waitS, Infinity);
  // Same cost: the higher score, then the faster.
  const tie = [pair("a", 70, 1, 50), pair("b", 80, 1, 90), pair("c", 80, 1, 9)];
  assert.equal(pick("cost_efficient", "everyday", tie), "c");
});

test("Time Efficient caps its cost at 3x what Balanced would pay", () => {
  const r = selectPair(field(), "time_efficient", "x", { tier: "everyday" });
  const bal = selectPair(field(), "balanced", "x", { tier: "everyday" });
  assert.ok(
    Math.abs(r.target.costCapUsd - 3 * bal.selected.costPerTaskUsd) < 1e-9,
  );
  assert.ok(
    r.ranked.every((p) => p.costPerTaskUsd <= r.target.costCapUsd + 1e-9),
  );
  // Same speed: the cheaper.
  const tie = [pair("a", 70, 0.5, 5), pair("b", 80, 0.4, 5)];
  assert.equal(pick("time_efficient", "everyday", tie), "b");
});

test("Max Power picks the highest score whatever it costs or takes", () => {
  for (const tier of ["quick", "everyday", "hard", "critical"])
    assert.equal(pick("max_power", tier), "dear-top", tier);
  const tie = [pair("a", 90, 5, 9), pair("b", 90, 2, 99)];
  assert.equal(pick("max_power", "quick", tie), "b");
});

test("Max Speed picks the fastest pair over the quick floor, even a dear one", () => {
  // fast-weak is 45 (over 40% of best) and costs ten times cheap-fast: still wins.
  for (const tier of ["quick", "everyday", "hard"])
    assert.equal(pick("max_speed", tier), "fast-weak", tier);
});

test("Max Power + Speed picks the fastest pair within 95% of the best", () => {
  for (const tier of ["quick", "everyday", "hard", "critical"])
    assert.equal(pick("max_power_speed", tier), "near-fast", tier);
  const r = selectPair(field(), "max_power_speed", "x", { tier: "quick" });
  assert.equal(r.target.share, 0.95);
});

test("a critical task keeps its full floor in every mode", () => {
  for (const mode of Object.keys(MODES)) {
    const r = selectPair(field(), mode, "x", { tier: "critical" });
    assert.ok(r.target.share >= 0.9, mode);
    assert.ok(r.selected.rawScore >= 90, mode + " " + r.selected.model);
  }
  assert.equal(pick("max_speed", "critical"), "near-fast");
  assert.equal(pick("cost_efficient", "critical"), "near-fast");
});

test("a pair without cost data is never chosen, in any mode", () => {
  for (const mode of Object.keys(MODES))
    for (const tier of ["quick", "everyday", "hard", "critical"])
      assert.notEqual(pick(mode, tier), "unpriced", mode + " " + tier);
});

test("old and friendly names map onto the six modes; unknown is Balanced", () => {
  assert.equal(migrateMode("eco"), "cost_efficient");
  assert.equal(migrateMode("quality"), "max_power");
  assert.equal(migrateMode("sports"), "time_efficient");
  assert.equal(migrateMode("balanced"), "balanced");
  assert.equal(migrateMode("turbo"), "balanced");
  assert.equal(migrateMode(undefined), "balanced");
  assert.equal(modeSpec("turbo").label, "Balanced");
  assert.equal(modeSpec("sports").label, "Time Efficient");
  for (const [typed, mode] of [
    ["cost", "cost_efficient"],
    ["time", "time_efficient"],
    ["power", "max_power"],
    ["speed", "max_speed"],
    ["power+speed", "max_power_speed"],
    ["Max Power + Speed", "max_power_speed"],
    ["max-speed", "max_speed"],
  ])
    assert.equal(modeName(typed), mode, typed);
  assert.equal(modeName("turbo"), null);
  const c = applyControl(initialControl(), {
    kind: "mode",
    mode: "quality",
    expectedRevision: 0,
  });
  assert.equal(c.mode, "max_power");
  assert.throws(() =>
    applyControl(initialControl(), {
      kind: "mode",
      mode: "turbo",
      expectedRevision: 0,
    }),
  );
  // An old stored name still routes, as the mode it became.
  assert.equal(pick("eco", "everyday"), pick("cost_efficient", "everyday"));
});

test("ultracode tiers per mode: speed modes hard and critical, Max Power critical, others never", () => {
  assert.deepEqual(ULTRACODE_TIERS, {
    max_speed: ["hard", "critical"],
    max_power_speed: ["hard", "critical"],
    max_power: ["critical"],
  });
});

test("only the speed modes ask for parallel subagents, on a fresh composer task", () => {
  const ask = (mode, over = {}) =>
    wantsFanOut({
      control: { ...initialControl(), mode },
      fresh: true,
      text: "build the thing",
      origin: { kind: "composer" },
      ...over,
    });
  assert.deepEqual(
    Object.keys(MODES).map((m) => ask(m)),
    [false, false, false, false, true, true],
  );
  assert.equal(ask("max_speed", { fresh: false }), false);
  assert.equal(ask("max_speed", { turnId: "t" }), false);
  assert.equal(ask("max_speed", { text: "/apex why" }), false);
  assert.equal(ask("max_speed", { origin: { kind: "plugin" } }), false);
  assert.equal(
    ask("max_speed", {
      control: { ...initialControl(), mode: "max_speed", agents: "off" },
    }),
    false,
  );
  assert.match(
    fanOutNote("max_speed"),
    /^APEX Max Speed: .*parallel subagents/,
  );
  assert.match(fanOutNote("max_power_speed"), /^APEX Max Power \+ Speed:/);
});

test("in the speed modes subagents route as quick tasks, unless the main task is critical", () => {
  const plan = (mode, risk = "normal") =>
    agentPlan({
      control: { ...initialControl(), mode },
      agentType: "general-purpose",
      agentModel: "m",
      mainModel: "m",
      mainIntent: { task: "coding", risk, difficulty: "complex", failures: 0 },
    });
  assert.equal(plan("max_speed").intent.difficulty, "simple");
  assert.equal(plan("max_power_speed").intent.difficulty, "simple");
  assert.equal(plan("balanced").intent.difficulty, "complex");
  assert.equal(plan("max_speed", "high").intent.risk, "high");
});

test("Cost Efficient judges a model move on usage only, Balanced on value", () => {
  const prices = (cacheWrite, cacheRead) => ({
    evidence: { prices: { cacheWrite, cacheRead } },
  });
  const winner = {
    rawScore: 90,
    costPerTaskUsd: 1,
    latencyMs: 1,
    record: prices(3, 0.3),
  };
  const stay = {
    rawScore: 60,
    costPerTaskUsd: 0.8,
    latencyMs: 1,
    record: prices(3, 0.3),
  };
  // Dearer but much stronger: value pays at a high point price, usage does not.
  assert.equal(switchPayback(winner, stay, 10000, "value", 1.2).pays, true);
  assert.equal(switchPayback(winner, stay, 10000, "cost", 1.2).pays, false);
});

// Review fixes for 0.9.0-beta.1.
import { selectPair as pickPair } from "../plugins/apex/core/scoring.mjs";
import {
  agentPlan as planAgent,
  wantsFanOut as fanOut,
} from "../plugins/apex/core/router.mjs";
test("Time Efficient is faster than Balanced, within 3x its cost, and not as slow as Cost Efficient", () => {
  const p = (model, rawScore, cost, s) => ({
    model,
    effort: "high",
    rawScore,
    benchmarkVersion: "5",
    costPerTaskUsd: cost,
    latencyMs: s * 1000,
  });
  // Shaped like the real everyday general data: a cheap slow pair, a fast mid pair.
  const c = [
    p("small-max", 36.2, 0.41, 329),
    p("mid-high", 41.1, 1.64, 15),
    p("big-medium", 48.1, 2.45, 19),
    p("big-max", 58.4, 10.04, 649),
  ];
  const at = (mode) =>
    pickPair(c, mode, "x|y", { tier: "everyday" }).selected.model;
  assert.equal(at("cost_efficient"), "small-max");
  assert.equal(at("balanced"), "big-medium");
  assert.equal(at("time_efficient"), "mid-high");
});
test("Max Power once covers that turn's subagents; no fan-out note while routing is off", () => {
  const control = {
    mode: "max_speed",
    qualityOnce: { revision: 1 },
    agents: "auto",
    routing: "auto",
  };
  const plan = planAgent({
    control,
    agentType: "general-purpose",
    agentModel: "m",
    mainModel: "m",
    mainIntent: {
      task: "general",
      risk: "normal",
      difficulty: "complex",
      failures: 0,
    },
  });
  assert.equal(plan.intent.difficulty, "complex");
  const base = { fresh: true, text: "build it", origin: { kind: "composer" } };
  assert.equal(
    fanOut({
      ...base,
      control: { mode: "max_speed", agents: "auto", routing: "auto" },
    }),
    true,
  );
  for (const routing of ["manual_hold", "disabled"])
    assert.equal(
      fanOut({
        ...base,
        control: { mode: "max_speed", agents: "auto", routing },
      }),
      false,
    );
});
