import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wantsUltracode,
  initialControl,
  applyControl,
  classifyIntent,
} from "../plugins/apex/core/router.mjs";

const CRITICAL = "architect a complex security migration for production";
const HARD = "architect a complex system";
const ORDINARY = "Please explain a general concept clearly";
const ask = (mode, text = CRITICAL, over = {}) =>
  wantsUltracode({
    control: { ...initialControl(), mode },
    intent: classifyIntent(text),
    fresh: true,
    text,
    origin: { kind: "composer" },
    ...over,
  });

test("the mode decides: the speed modes for hard and critical, Max Power for critical, the rest never", () => {
  assert.equal(initialControl().ultracode, "auto");
  assert.deepEqual(
    [
      "max_speed",
      "max_power_speed",
      "max_power",
      "balanced",
      "cost_efficient",
      "time_efficient",
    ].map((m) => ask(m, CRITICAL)),
    [true, true, true, false, false, false],
  );
  assert.deepEqual(
    [
      "max_speed",
      "max_power_speed",
      "max_power",
      "balanced",
      "cost_efficient",
      "time_efficient",
    ].map((m) => ask(m, HARD)),
    [true, true, false, false, false, false],
  );
  for (const mode of [
    "max_speed",
    "max_power_speed",
    "max_power",
    "balanced",
    "cost_efficient",
    "time_efficient",
  ])
    assert.equal(ask(mode, ORDINARY), false, mode);
  assert.equal(ask("max_speed", "format this list"), false);
});

test("Max Power once counts as Max Power for the next task", () => {
  const once = {
    ...initialControl(),
    mode: "balanced",
    qualityOnce: { revision: 1 },
  };
  assert.equal(ask("balanced", CRITICAL, { control: once }), true);
  assert.equal(ask("balanced", HARD, { control: once }), false);
});

test("the kill switch rules it out in every mode", () => {
  const off = applyControl(initialControl(), {
    kind: "ultracode",
    value: "off",
    expectedRevision: 0,
  });
  assert.equal(off.ultracode, "off");
  for (const mode of ["max_speed", "max_power_speed", "max_power"])
    assert.equal(ask(mode, CRITICAL, { control: { ...off, mode } }), false);
  assert.throws(
    () =>
      applyControl(initialControl(), {
        kind: "ultracode",
        value: "always",
        expectedRevision: 0,
      }),
    /invalid_control/,
  );
});

test("a continuation does not hold again", () => {
  const critical = classifyIntent(CRITICAL);
  assert.equal(classifyIntent("yes", critical), critical);
  assert.equal(ask("max_speed", CRITICAL, { fresh: false }), false);
});

test("anything that cannot be sent again safely goes out normally", () => {
  assert.equal(
    ask("max_speed", CRITICAL, { attachments: [{ type: "image" }] }),
    false,
  );
  assert.equal(ask("max_speed", CRITICAL, { turnId: "running-turn" }), false);
  assert.equal(ask("max_speed", "/apex why"), false);
  assert.equal(ask("max_speed", "   "), false);
  assert.equal(
    ask("max_speed", CRITICAL, { origin: { kind: "plugin", name: "other" } }),
    false,
  );
  assert.equal(
    ask("max_speed", CRITICAL, { origin: { kind: "bridge" } }),
    false,
  );
});

test("held routing and pins leave ultracode alone", () => {
  const held = {
    ...initialControl(),
    mode: "max_speed",
    routing: "manual_hold",
  };
  assert.equal(ask("max_speed", CRITICAL, { control: held }), false);
  assert.equal(ask("max_speed", CRITICAL, { pinned: true }), false);
});
