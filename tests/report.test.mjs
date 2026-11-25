import test from "node:test";
import assert from "node:assert/strict";
import {
  historyRow,
  appendHistory,
  summariseHistory,
  reportText,
} from "../plugins/apex/core/report.mjs";

const NOW = Date.UTC(2026, 10, 25, 12);
const row = (at, req, ans, set = "claude-opus-5-5") =>
  historyRow(at, {
    original: { model: set },
    requested: { model: req, effort: "medium" },
    answered: ans,
    tier: "everyday",
    agent: false,
  });

test("dated answer IDs count as the model asked for", () => {
  const h = [
    row(NOW - 1000, "claude-sonnet-5-5", "claude-sonnet-5-5-20261101"),
    row(NOW - 2000, "claude-sonnet-5-5", "claude-sonnet-5-5"),
  ];
  const s = summariseHistory(h, NOW);
  assert.equal(s.models.length, 1);
  assert.equal(s.models[0].id, "claude-sonnet-5-5");
  assert.equal(s.mismatched, 0);
  assert.equal(s.changed, 2);
});

test("a different answering model is counted, and the report says so", () => {
  const s = summariseHistory(
    [row(NOW - 1000, "claude-haiku-5-5", "claude-opus-5-5")],
    NOW,
  );
  assert.equal(s.mismatched, 1);
  assert.equal(s.models[0].id, "claude-opus-5-5");
  assert.match(reportText(s), /1 answered by a different model/);
});

test("only the last 7 days are summarised, and history is pruned at 35 days", () => {
  const h = appendHistory(
    [row(NOW - 40 * 86400000, "a", "a"), row(NOW - 10 * 86400000, "b", "b")],
    row(NOW, "c", "c"),
    NOW,
  );
  assert.deepEqual(
    h.map((r) => r.req),
    ["b", "c"],
  );
  const s = summariseHistory(h, NOW);
  assert.equal(s.total, 1);
  assert.equal(s.days.length, 7);
  assert.equal(s.days.at(-1).total, 1);
});

test("no rows gives a plain empty message", () => {
  assert.match(
    reportText(summariseHistory([], NOW)),
    /no finished requests recorded/,
  );
});
