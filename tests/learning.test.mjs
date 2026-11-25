import test from "node:test";
import assert from "node:assert/strict";
import {
  badSignal,
  addStrike,
  addClean,
  learnedSteps,
  raiseTier,
  emptyLearning,
  CLEAN_TO_FORGIVE,
} from "../plugins/apex/core/learning.mjs";

test("complaints are recognised at the start of a short message", () => {
  for (const t of [
    "That's wrong",
    "no, that's not what I asked",
    "That is incorrect.",
    "It still doesn't work",
    "still broken",
    "You missed the second file",
    "Wrong.",
    "try again",
    "you're wrong about the date",
  ])
    assert.equal(badSignal(t, "earlier"), "complaint", t);
});

test("tasks that mention wrong things are not complaints", () => {
  for (const t of [
    "Fix the wrong date in the footer.",
    "Why does the parser return the wrong row count?",
    "Add a test for when the input is wrong",
    "This is great, now add pagination",
    "",
  ])
    assert.equal(badSignal(t, "earlier"), null, t);
});

test("the same prompt again is a retry; short or tagged repeats are not", () => {
  assert.equal(
    badSignal("Summarise the report  please", "summarise the report please"),
    "retry",
  );
  assert.equal(badSignal("ok", "ok"), null);
  const tagged = "<scheduled-task name='x'>run the daily feed</scheduled-task>";
  assert.equal(badSignal(tagged, tagged), null);
});

test("strikes raise the tier one step, three strikes two, capped at critical", () => {
  let l = emptyLearning();
  l = addStrike(l, { task: "coding", signal: "complaint", pick: null, at: 1 });
  assert.equal(learnedSteps(l, "coding"), 1);
  assert.equal(learnedSteps(l, "legal"), 0);
  l = addStrike(l, { task: "coding", signal: "retry", pick: null, at: 2 });
  l = addStrike(l, { task: "coding", signal: "retry", pick: null, at: 3 });
  l = addStrike(l, { task: "coding", signal: "retry", pick: null, at: 4 });
  assert.equal(l.kinds.coding.strikes, 3);
  assert.equal(learnedSteps(l, "coding"), 2);
  assert.equal(raiseTier("quick", 2), "hard");
  assert.equal(raiseTier("hard", 2), "critical");
  assert.equal(raiseTier("everyday", 0), "everyday");
});

test("clean answers take a strike off and the kind disappears at zero", () => {
  let l = addStrike(emptyLearning(), {
    task: "general",
    signal: "complaint",
    pick: null,
    at: 1,
  });
  for (let i = 0; i < CLEAN_TO_FORGIVE - 1; i++) l = addClean(l, "general");
  assert.equal(l.kinds.general.strikes, 1);
  l = addClean(l, "general");
  assert.equal(l.kinds.general, undefined);
  assert.deepEqual(addClean(emptyLearning(), "x"), emptyLearning());
});

test("a malformed stored value is treated as empty", () => {
  assert.equal(learnedSteps("junk", "coding"), 0);
  assert.equal(learnedSteps({ kinds: null }, "coding"), 0);
});
