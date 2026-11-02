import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectPair,
  MODES,
  modeName,
  migrateMode,
  TIERS,
} from "../plugins/apex/core/scoring.mjs";
import {
  agentPlan,
  wantsFanOut,
  effectiveMode,
  ULTRACODE_TIERS,
} from "../plugins/apex/core/router.mjs";
import {
  MODES as LABELS,
  REASONS,
  modeSpec,
} from "../plugins/apex/core/presentation.mjs";

// Synthetic data shaped like the real everyday picture: cheap weak pairs, a fast
// middle, a strong medium-effort pair and a slow, dear top.
const pair = (model, rawScore, cost, s) => ({
  model,
  effort: "high",
  rawScore,
  benchmarkVersion: "5",
  costPerTaskUsd: cost,
  latencyMs: s * 1000,
});
const field = () => [
  pair("tiny", 30, 0.16, 18),
  pair("small", 36, 0.41, 329),
  pair("mid", 41, 1.64, 15),
  pair("strong", 48, 2.45, 19),
  pair("stronger", 52, 3.46, 37),
  pair("near-top", 57, 6.05, 133),
  pair("top", 58.4, 10.04, 649),
];
const pick = (mode, tier, c = field()) =>
  selectPair(c, mode, "x|y", { tier }).selected.model;

test("there are exactly three modes, each with a label, a description and a reason", () => {
  assert.deepEqual(Object.keys(MODES), ["save", "balanced", "best"]);
  assert.deepEqual(Object.keys(LABELS), ["save", "balanced", "best"]);
  for (const m of Object.keys(MODES)) {
    assert.ok(LABELS[m].label && LABELS[m].detail, m);
    assert.ok(REASONS[m + "_policy"], m);
    assert.equal(MODES[m].objective, "value", m + " uses Balanced's rule");
  }
});

test("Save spends no more than Balanced, and Best scores no lower, on every tier", () => {
  for (const tier of ["quick", "everyday", "hard", "critical"]) {
    const at = (mode) => selectPair(field(), mode, "x|y", { tier }).selected;
    assert.ok(at("save").costPerTaskUsd <= at("balanced").costPerTaskUsd, tier);
    assert.ok(at("best").rawScore >= at("balanced").rawScore, tier);
  }
});

test("on everyday work the three modes give three different, sensible picks", () => {
  assert.equal(pick("save", "everyday"), "mid");
  assert.equal(pick("balanced", "everyday"), "strong");
  assert.equal(pick("best", "everyday"), "stronger");
});

test("no mode picks a five-minute answer for ordinary work", () => {
  for (const mode of ["save", "balanced", "best"])
    for (const tier of ["quick", "everyday"])
      assert.ok(
        selectPair(field(), mode, "x|y", { tier }).selected.latencyMs <= 120000,
        mode + " " + tier,
      );
});

test("a critical task keeps Balanced's floor and point worth in Save", () => {
  const save = selectPair(field(), "save", "x|y", { tier: "critical" });
  const bal = selectPair(field(), "balanced", "x|y", { tier: "critical" });
  assert.equal(save.target.share, bal.target.share);
  assert.equal(save.target.wtp, bal.target.wtp);
  assert.equal(save.selected.model, bal.selected.model);
  assert.ok(save.selected.rawScore >= TIERS.critical.share * 58.4);
});

test("Max Power once is the strongest pair, whatever it costs or takes", () => {
  for (const tier of ["quick", "everyday", "hard", "critical"])
    assert.equal(pick("best_once", tier), "top", tier);
  assert.equal(
    effectiveMode({ mode: "save", qualityOnce: { revision: 1 } }),
    "best_once",
  );
  assert.equal(modeSpec("best_once").label, "Max Power once");
});

test("old and friendly names map onto the three modes; unknown is Balanced", () => {
  const cases = {
    eco: "save",
    cost_efficient: "save",
    cost: "save",
    quality: "best",
    max_power: "best",
    max_power_speed: "best",
    "Max Power + Speed": "best",
    sports: "balanced",
    time_efficient: "balanced",
    max_speed: "balanced",
    Balanced: "balanced",
    Save: "save",
    BEST: "best",
  };
  for (const [name, mode] of Object.entries(cases))
    assert.equal(modeName(name), mode, name);
  assert.equal(modeName("nonsense"), null);
  assert.equal(migrateMode("nonsense"), "balanced");
  assert.equal(migrateMode(undefined), "balanced");
  assert.equal(modeSpec("eco").label, "Save");
});

test("only Best auto-amplifies hard and critical tasks; Balanced and Save never do", () => {
  assert.deepEqual(ULTRACODE_TIERS.best, ["hard", "critical"]);
  assert.deepEqual(ULTRACODE_TIERS.balanced, []);
  assert.deepEqual(ULTRACODE_TIERS.save, []);
  const hard = {
    task: "general",
    risk: "normal",
    difficulty: "complex",
    failures: 0,
  };
  const ordinary = {
    task: "general",
    risk: "normal",
    difficulty: "standard",
    failures: 0,
  };
  const base = { fresh: true, text: "build it", origin: { kind: "composer" } };
  const c = (mode, extra = {}) => ({
    mode,
    agents: "auto",
    routing: "auto",
    ...extra,
  });
  assert.equal(
    wantsFanOut({ ...base, intent: hard, control: c("best") }),
    true,
  );
  assert.equal(
    wantsFanOut({ ...base, intent: hard, control: c("balanced") }),
    false,
  );
  assert.equal(
    wantsFanOut({ ...base, intent: hard, control: c("save") }),
    false,
  );
  assert.equal(
    wantsFanOut({ ...base, intent: ordinary, control: c("best") }),
    false,
  );
  for (const routing of ["manual_hold", "disabled"])
    assert.equal(
      wantsFanOut({ ...base, intent: hard, control: c("best", { routing }) }),
      false,
    );
  assert.equal(
    wantsFanOut({ ...base, intent: hard, fresh: false, control: c("best") }),
    false,
  );
  assert.equal(
    wantsFanOut({
      ...base,
      intent: hard,
      text: "/apex why",
      control: c("best"),
    }),
    false,
  );
});

test("Save routes a non-critical task's subagents as quick tasks; the other modes follow the main task", () => {
  const args = (mode, difficulty, risk = "normal") => ({
    control: { mode, agents: "auto" },
    agentType: "general-purpose",
    agentModel: "m",
    mainModel: "m",
    mainIntent: { task: "general", risk, difficulty, failures: 0 },
  });
  assert.equal(agentPlan(args("save", "complex")).intent.difficulty, "simple");
  assert.equal(agentPlan(args("save", "complex", "high")).intent.risk, "high");
  assert.equal(
    agentPlan(args("balanced", "complex")).intent.difficulty,
    "complex",
  );
  assert.equal(agentPlan(args("best", "complex")).intent.difficulty, "complex");
});
