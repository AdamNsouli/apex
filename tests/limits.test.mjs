import { test } from "node:test";
import assert from "node:assert/strict";
import {
  limitLean,
  leanMode,
  limitLabel,
  limitsText,
} from "../plugins/apex/core/limits.mjs";

const w = (five, week) => [
  { kind: "five_hour", percentUsed: five, resetsAt: "2026-11-24T12:00:00Z" },
  { kind: "seven_day", percentUsed: week },
];

test("leans one step near a limit and to Save very near", () => {
  assert.equal(limitLean(w(50, 40)).steps, 0);
  assert.equal(limitLean(w(82, 40)).steps, 1);
  assert.equal(limitLean(w(50, 91)).steps, 1);
  assert.equal(limitLean(w(96, 40)).steps, 2);
  assert.equal(limitLean(w(50, 98)).kind, "seven_day");
  assert.equal(limitLean(w(99, 99), "off").steps, 0);
  assert.equal(limitLean([]).steps, 0);
});

test("the mode ladder steps down and stops at Save; unknown modes are kept", () => {
  assert.equal(leanMode("best", 1), "balanced");
  assert.equal(leanMode("balanced", 1), "save");
  assert.equal(leanMode("best", 2), "save");
  assert.equal(leanMode("save", 2), "save");
  assert.equal(leanMode("max_power_once", 2), "max_power_once");
});

test("labels and text read plainly", () => {
  assert.equal(limitLabel(w(82.4, 40)), "5h 82% · week 40%");
  assert.equal(limitLabel([]), "");
  const t = limitsText("auto", w(96, 40), Date.parse("2026-11-24T11:20:00Z"));
  assert.match(t, /Leaning to Save because of 5h at 96%, resets in 40 min/);
});
