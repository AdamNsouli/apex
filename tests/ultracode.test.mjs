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

test("the mode decides: Sports for hard and critical, High Quality for critical, Balanced and Eco never", () => {
  assert.equal(initialControl().ultracode, "auto");
  assert.deepEqual(
    ["sports", "quality", "balanced", "eco"].map((m) => ask(m, CRITICAL)),
    [true, true, false, false],
  );
  assert.deepEqual(
    ["sports", "quality", "balanced", "eco"].map((m) => ask(m, HARD)),
    [true, false, false, false],
  );
  for (const mode of ["sports", "quality", "balanced", "eco"])
    assert.equal(ask(mode, ORDINARY), false, mode);
  assert.equal(ask("sports", "format this list"), false);
});

test("Quality once counts as High Quality for the next task", () => {
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
  for (const mode of ["sports", "quality"])
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
  assert.equal(ask("sports", CRITICAL, { fresh: false }), false);
});

test("anything that cannot be sent again safely goes out normally", () => {
  assert.equal(
    ask("sports", CRITICAL, { attachments: [{ type: "image" }] }),
    false,
  );
  assert.equal(ask("sports", CRITICAL, { turnId: "running-turn" }), false);
  assert.equal(ask("sports", "/apex why"), false);
  assert.equal(ask("sports", "   "), false);
  assert.equal(
    ask("sports", CRITICAL, { origin: { kind: "plugin", name: "other" } }),
    false,
  );
  assert.equal(ask("sports", CRITICAL, { origin: { kind: "bridge" } }), false);
});

test("held routing and pins leave ultracode alone", () => {
  const held = { ...initialControl(), mode: "sports", routing: "manual_hold" };
  assert.equal(ask("sports", CRITICAL, { control: held }), false);
  assert.equal(ask("sports", CRITICAL, { pinned: true }), false);
});
