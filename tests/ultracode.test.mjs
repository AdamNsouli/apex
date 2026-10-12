import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wantsUltracode,
  initialControl,
  applyControl,
  classifyIntent,
} from "../plugins/apex/core/router.mjs";

const critical = classifyIntent(
  "architect a complex security migration for production",
);
const ask = (over = {}) =>
  wantsUltracode({
    control: { ...initialControl(), ultracode: "auto" },
    intent: critical,
    fresh: true,
    text: "architect a complex security migration for production",
    origin: { kind: "composer" },
    ...over,
  });

test("ultracode is off until the person turns it on", () => {
  assert.equal(initialControl().ultracode, "off");
  assert.equal(ask({ control: initialControl() }), false);
  const on = applyControl(initialControl(), {
    kind: "ultracode",
    value: "auto",
    expectedRevision: 0,
  });
  assert.equal(on.ultracode, "auto");
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

test("only a newly classified critical task qualifies", () => {
  assert.equal(ask(), true);
  for (const text of [
    "Please explain a general concept clearly",
    "architect a complex system",
    "implement production authentication",
    "format this list",
  ])
    assert.equal(ask({ intent: classifyIntent(text), text }), false, text);
  // "yes" after a critical task repeats that intent; it must not hold again.
  assert.equal(classifyIntent("yes", critical), critical);
  assert.equal(ask({ fresh: false }), false);
});

test("anything that cannot be sent again safely goes out normally", () => {
  assert.equal(ask({ attachments: [{ type: "image" }] }), false);
  assert.equal(ask({ turnId: "running-turn" }), false);
  assert.equal(ask({ text: "/apex why" }), false);
  assert.equal(ask({ text: "   " }), false);
  assert.equal(ask({ origin: { kind: "plugin", name: "other" } }), false);
  assert.equal(ask({ origin: { kind: "bridge" } }), false);
});

test("held routing and pins leave ultracode alone", () => {
  const held = {
    ...initialControl(),
    ultracode: "auto",
    routing: "manual_hold",
  };
  assert.equal(ask({ control: held }), false);
  assert.equal(ask({ pinned: true }), false);
});
