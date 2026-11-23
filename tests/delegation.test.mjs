import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exploreStep,
  isExploration,
  wantsReview,
} from "../plugins/apex/core/delegation.mjs";

const read = { tool: "Read" };
test("four searches in a row in a long chat give one Explore note per prompt", () => {
  let s = null,
    notes = 0;
  for (let i = 0; i < 10; i++) {
    const r = exploreStep(s, i === 5 ? { tool: "Edit" } : read, {
      tokens: 180000,
    });
    s = r.state;
    if (r.note) notes++;
    if (r.note) assert.match(r.note, /about 180k tokens/);
  }
  assert.equal(notes, 1);
});

test("no note in a short chat, in a subagent, or with agents off", () => {
  let s = null;
  for (let i = 0; i < 6; i++) {
    assert.equal(exploreStep(s, read, { tokens: 40000 }).note, null);
    s = exploreStep(s, read, { tokens: 40000 }).state;
  }
  let t = null;
  for (let i = 0; i < 6; i++) {
    const r = exploreStep(
      t,
      { tool: "Grep", agentId: "a1" },
      { tokens: 300000 },
    );
    assert.equal(r.note, null);
    t = r.state;
  }
  let u = null;
  for (let i = 0; i < 6; i++) {
    const r = exploreStep(u, read, { tokens: 300000, agents: "off" });
    assert.equal(r.note, null);
    u = r.state;
  }
});

test("read-only Bash counts as exploration; a build does not", () => {
  assert.equal(isExploration({ tool: "Bash", command: "rg foo src" }), true);
  assert.equal(
    isExploration({ tool: "Bash", command: "npm run build", isReadOnly: true }),
    true,
  );
  assert.equal(
    isExploration({ tool: "Bash", command: "npm run build" }),
    false,
  );
  assert.equal(isExploration({ tool: "Edit" }), false);
});

test("one reviewer only for fresh critical code changes in Balanced or Best", () => {
  const base = {
    mode: "balanced",
    tier: "critical",
    task: "agentic_coding",
    fresh: true,
  };
  assert.equal(wantsReview(base), true);
  assert.equal(wantsReview({ ...base, mode: "save" }), false);
  assert.equal(wantsReview({ ...base, tier: "hard" }), false);
  assert.equal(wantsReview({ ...base, task: "legal" }), false);
  assert.equal(wantsReview({ ...base, execution: "specified" }), false);
  assert.equal(wantsReview({ ...base, agents: "off" }), false);
  assert.equal(wantsReview({ ...base, fresh: false }), false);
});
