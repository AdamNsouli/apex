import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyStep,
  addTool,
  stepHint,
  effortCacheModeFrom,
  stepPair,
} from "../plugins/apex/core/steps.mjs";

test("the previous step's tools decide the hint", () => {
  let s = addTool(emptyStep(), { tool: "Read" });
  s = addTool(s, { tool: "Bash", command: "rg foo src" });
  assert.equal(stepHint(1, s), "routine");
  assert.equal(stepHint(0, s), null);
  assert.equal(stepHint(2, emptyStep()), null);
  assert.equal(stepHint(1, addTool(s, { tool: "Edit" })), null);
  assert.equal(
    stepHint(
      1,
      addTool(s, { tool: "Bash", command: "npm test", isError: true }),
    ),
    "recover",
  );
});

test("per_turn_effort means effort is sent per message", () => {
  assert.equal(effortCacheModeFrom("per_turn_effort"), "per_message");
  assert.equal(effortCacheModeFrom("foo,per_turn_effort"), "per_message");
  assert.equal(effortCacheModeFrom(undefined), "per_request");
  assert.equal(effortCacheModeFrom("per_turn_effortless"), "per_request");
});

test("one notch up or down on the same model, never another model", () => {
  const pool = [
    { model: "a", effort: "low" },
    { model: "a", effort: "medium" },
    { model: "a", effort: "high" },
    { model: "b", effort: "xhigh" },
  ];
  assert.equal(
    stepPair({ model: "a", effort: "medium" }, pool, "recover").effort,
    "high",
  );
  assert.equal(
    stepPair({ model: "a", effort: "medium" }, pool, "routine").effort,
    "low",
  );
  assert.equal(stepPair({ model: "a", effort: "high" }, pool, "recover"), null);
  assert.equal(stepPair({ model: "a", effort: "low" }, pool, "routine"), null);
  assert.equal(stepPair({ model: "a" }, pool, "recover"), null);
});
