import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialControl,
  applyControl,
  captureDispatch,
  route,
} from "../plugins/apex/core/router.mjs";
import { present } from "../plugins/apex/core/presentation.mjs";
import {
  freezeDecision,
  duration,
  verdict,
} from "../plugins/apex/core/receipt.mjs";
const now = 2000000000000;
const ready = () => ({
  connected: true,
  now,
  control: {
    ...initialControl(),
    backend: "subscription",
    verifiedIds: ["future-model"],
  },
  catalogue: [{ routable: true }],
  evidenceFetchedAt: now,
  events: [],
  intent: { risk: "normal", difficulty: "standard" },
});
test("mode acknowledgment waits for main consumption; unrelated revisions do not queue a mode", () => {
  let s = ready();
  s.control = applyControl(s.control, {
    kind: "mode",
    mode: "sports",
    expectedRevision: 0,
  });
  assert.equal(present(s).pendingText, "Sports saved · next main request");
  s.control = captureDispatch(s.control, "main-1").next;
  assert.equal(present(s).pendingText, null);
  s.control = applyControl(s.control, {
    kind: "task",
    task: "coding",
    expectedRevision: 1,
  });
  assert.equal(present(s).pending, false);
});
test("one-shot is claimed exactly once and preserves the base preference", () => {
  let c = applyControl(
    { ...initialControl(), mode: "eco" },
    { kind: "quality_once", armed: true, expectedRevision: 0 },
  );
  const first = captureDispatch(c, "main-1"),
    next = captureDispatch(first.next, "main-2");
  assert.equal(first.effective.mode, "quality");
  assert.equal(first.next.mode, "eco");
  assert.equal(first.onceRevision, 1);
  assert.equal(next.effective.mode, "eco");
  assert.equal(next.onceRevision, null);
  assert.equal(first.next.revision, 1);
});
test("cancel has ordinary revision protection and no outstanding token", () => {
  const c = applyControl(initialControl(), {
    kind: "quality_once",
    armed: true,
    expectedRevision: 0,
  });
  assert.throws(
    () =>
      applyControl(c, {
        kind: "quality_once",
        armed: false,
        expectedRevision: 0,
      }),
    /revision_conflict/,
  );
  assert.equal(
    applyControl(c, { kind: "quality_once", armed: false, expectedRevision: 1 })
      .qualityOnce,
    null,
  );
});
test("Quality once cannot bypass native hold even though its token is consumed", () => {
  const c = applyControl(
    { ...initialControl(), routing: "manual_hold" },
    { kind: "quality_once", armed: true, expectedRevision: 0 },
  );
  const captured = captureDispatch(c, "guarded");
  const original = { model: "native", effort: "high" };
  assert.equal(
    route({ original, control: captured.effective }).reason,
    "manual_hold",
  );
  assert.equal(captured.next.qualityOnce, null);
});
test("historical selection and main / agent scope survive a new streaming event", () => {
  const s = ready();
  s.events = [
    {
      id: "old",
      kind: "request",
      status: "complete",
      apexRequested: { model: "old" },
    },
    {
      id: "agent",
      kind: "request",
      agentId: "a",
      status: "streaming",
      apexRequested: { model: "agent" },
    },
    {
      id: "new",
      kind: "request",
      status: "streaming",
      apexRequested: { model: "new" },
    },
  ];
  assert.equal(present(s, { selectedId: "old" }).selected.id, "old");
  assert.equal(present(s).active.id, "new");
  assert.equal(present(s, { scope: "a" }).status, "Native agent settings");
  assert.deepEqual(present(s).agents, ["a"]);
});
test("readiness distinguishes disconnection, pins, expired evidence, access and consent", () => {
  const s = ready();
  assert.equal(present(s).status, "Routing enabled");
  assert.equal(present({ ...s, connected: false }).status, "Disconnected");
  assert.equal(present({ ...s, pins: true }).status, "Held");
  assert.equal(
    present({ ...s, evidenceFetchedAt: now - 8 * 86400000 }).status,
    "Observing only",
  );
  assert.match(
    present({ ...s, control: { ...s.control, verifiedIds: [] } }).blocker,
    /permitted model/,
  );
  assert.match(
    present({ ...s, control: { ...s.control, backend: "api" } }).blocker,
    /estimate budget/,
  );
});
test("unknown costs never become zero or pretend to be a complete total", () => {
  const s = ready();
  s.events = [{ kind: "request", status: "complete", observedUsd: null }];
  assert.equal(present(s).observed, "Not yet observed");
  s.events.push({ kind: "request", status: "complete", observedUsd: 0.2 });
  assert.equal(present(s).observed, "≈ $0.2000 · partial");
});
test("frozen receipt retains exact evidence after catalogue mutation without freezing catalogue", () => {
  const record = {
    runtimeId: "future-model",
    effort: "high",
    evidence: {
      slug: "future-high",
      benchmarkVersion: "v-test",
      scores: { general: 73, coding: 80 },
      prices: { input: 2, output: 8 },
      benchmarkCostPerTask: 0.4,
    },
  };
  const pair = { model: "future-model", effort: "high" },
    snapshot = freezeDecision({
      original: pair,
      decision: { pair, reason: "quality_utility", estimate: 0.01, ranked: [] },
      models: [record],
      task: "coding",
      fetchedAt: now,
      baselineForecast: 0.02,
    });
  record.evidence.scores.coding = 99;
  record.evidence.prices.input = 100;
  assert.equal(snapshot.selected.taskScore, 80);
  assert.equal(snapshot.selected.prices.input, 2);
  assert.equal(snapshot.accountCharge, null);
  assert.equal(snapshot.selected.priceUnit, "USD / 1M tokens");
  assert.equal(Object.isFrozen(snapshot.selected), true);
});
test("timing never invents missing or negative elapsed time; verdict uses actual outgoing pair", () => {
  assert.equal(duration({ timestamp: 10 }), null);
  assert.equal(duration({ startedAt: 10, completedAt: 9 }), null);
  assert.equal(duration({ startedAt: 10, completedAt: 35 }), 25);
  assert.equal(
    verdict({
      original: { model: "a", effort: "high" },
      apexRequested: { model: "a", effort: "low" },
    }),
    "Effort changed",
  );
});
test("refresh button reflects actual cooldown and refresh in progress", () => {
  const s = ready();
  assert.equal(
    present({ ...s, nextRefreshAt: now + 10 }).refreshEligible,
    false,
  );
  assert.equal(
    present({ ...s, nextRefreshAt: now - 1, refreshBusy: true })
      .refreshEligible,
    false,
  );
  assert.equal(present({ ...s, nextRefreshAt: now - 1 }).refreshEligible, true);
});
