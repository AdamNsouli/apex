import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../plugins/apex/core/router.mjs";
import {
  taskScoresFromEvals,
  withTaskScores,
} from "../plugins/apex/core/catalogue.mjs";
import { selectPair, TIERS } from "../plugins/apex/core/scoring.mjs";

// What APEX reads a prompt as decides which benchmark it is scored on.
test("whole words only: codex, decode or encoder is not a request to write code", () => {
  for (const text of [
    "i made some changes to zoran with codex and base44 so update ur system and stuff",
    "decode this message for me",
  ])
    assert.notEqual(classifyIntent(text).task, "coding", text);
});

test("changing code or working through files is agentic work", () => {
  for (const text of [
    "i made some changes to zoran with codex and base44 so update ur system and stuff before we start more changes",
    "fix the login bug in the app",
    "sync the vault index with the new files",
    "commit this and open the PR",
  ])
    assert.equal(classifyIntent(text).task, "agentic_coding", text);
  assert.equal(
    classifyIntent("explain how this function works").task,
    "coding",
  );
});

test("a short factual question is scored on knowledge, maths on reasoning", () => {
  assert.equal(
    classifyIntent("what is the capital of Australia").task,
    "knowledge",
  );
  assert.equal(classifyIntent("solve this probability question").task, "math");
});

test("money, agreements and admissions are high-stakes", () => {
  for (const text of [
    "can u find the tuition costs for international students",
    "if i make a new concept for rpe, can i get a patent on it",
    "hassan should get 1% with vesting over 4 years",
    "can u evaluate this and tell me if i should sign it",
  ])
    assert.equal(classifyIntent(text).risk, "high", text);
  assert.equal(
    classifyIntent("sign in approvals only on the website").risk,
    "normal",
  );
});

// The per-task snapshot fills what AA's API leaves empty.
test("task scores average their benchmarks and need every one of them", () => {
  assert.deepEqual(
    taskScoresFromEvals({
      terminalBench40: 0.5,
      frontierCode20: 0.3,
      automationBenchPartialScore: 0.7,
      hleDiamond: 0.4,
      critptAgenticHard: null,
      omniscienceAccuracy: 0.6,
    }),
    { coding: 40, agentic_coding: 60, knowledge: 60 },
  );
});

test("the snapshot fills empty scores for the same index version only", () => {
  const snap = {
    version: "5",
    capturedAt: "2026-11-01",
    models: { m: { terminalBench40: 0.5, frontierCode20: 0.3 } },
  };
  const a = {
    slug: "m",
    benchmarkVersion: "5",
    scores: { general: 50, coding: null },
  };
  assert.equal(withTaskScores(a, snap).scores.coding, 40);
  assert.equal(withTaskScores(a, snap).taskScoresFrom, "2026-11-01");
  // An API score is never overwritten.
  assert.equal(
    withTaskScores({ ...a, scores: { coding: 33 } }, snap).scores.coding,
    33,
  );
  // A new methodology rescales everything, so old snapshot numbers stay out.
  assert.equal(
    withTaskScores({ ...a, benchmarkVersion: "6" }, snap).scores.coding,
    null,
  );
});

test("the snapshot shipped with APEX covers every Haiku, Sonnet and Opus 5.5 effort", async () => {
  const { TASK_SCORES } = await import("../plugins/apex/core/task-scores.mjs");
  for (const id of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"])
    for (const slug of ["low", "medium", "high", "xhigh"]
      .map((l) => id + "-" + l)
      .concat(id)) {
      const s = taskScoresFromEvals(TASK_SCORES.models[slug]);
      for (const t of ["coding", "agentic_coding", "math", "knowledge"])
        assert.ok(Number.isFinite(s[t]), slug + " " + t);
    }
});

// Shaped like the 1 Nov 2026 agentic scores: the middle model at high effort gives
// nearly what the big model gives at medium for two thirds of the usage.
test("an everyday agentic task takes the middle model, not the big one at high effort", () => {
  const p = (model, effort, rawScore, cost, s) => ({
    model,
    effort,
    rawScore,
    benchmarkVersion: "5",
    costPerTaskUsd: cost,
    latencyMs: s * 1000,
  });
  const c = [
    p("small", "high", 27.7, 0.16, 18),
    p("mid", "medium", 42.4, 0.78, 8),
    p("mid", "high", 51.7, 1.64, 15),
    p("mid", "max", 67.7, 10.02, 415),
    p("big", "medium", 56.9, 2.45, 19),
    p("big", "high", 59.9, 3.46, 37),
    p("big", "max", 64.6, 10.04, 649),
  ];
  const r = selectPair(c, "balanced", "big|high", { tier: "everyday" });
  assert.equal(r.selected.model + "/" + r.selected.effort, "mid/high");
  assert.ok(r.selected.rawScore >= TIERS.everyday.share * 67.7);
});
