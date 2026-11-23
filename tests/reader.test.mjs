import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReading,
  mergeReading,
  readerWanted,
  readerPrompt,
  READER_CHARS,
} from "../plugins/apex/core/reader.mjs";
import { classifyIntent } from "../plugins/apex/core/router.mjs";
import { tierFor } from "../plugins/apex/core/scoring.mjs";

test("parses a JSON reading, even wrapped in prose, and rejects junk", () => {
  assert.deepEqual(
    parseReading('Sure: {"tier":"hard","task":"coding","importance":4}'),
    {
      tier: "hard",
      task: "coding",
      importance: 4,
    },
  );
  assert.equal(parseReading('{"tier":"extreme"}'), null);
  assert.equal(parseReading("no json"), null);
  assert.equal(parseReading('{"tier":"quick","importance":9}').importance, 5);
});

test("the reading sets the tier; a local risk word keeps at least hard", () => {
  const local = classifyIntent(
    "tidy the tax summary wording in the footer",
    null,
  );
  assert.equal(local.risk, "high");
  const merged = mergeReading(local, {
    tier: "quick",
    task: "general",
    importance: 1,
  });
  assert.equal(tierFor(merged), "hard");
  const raised = mergeReading(
    classifyIntent("improve the importer overall", null),
    {
      tier: "hard",
      task: "agentic_coding",
      importance: 3,
    },
  );
  assert.equal(tierFor(raised), "hard");
  assert.equal(raised.task, "agentic_coding");
});

test("an important prompt is never quick, and failures still escalate", () => {
  const m = mergeReading(
    classifyIntent("what's the capital of peru again?", null),
    {
      tier: "quick",
      task: "knowledge",
      importance: 5,
    },
  );
  assert.equal(tierFor(m), "everyday");
  assert.equal(tierFor({ ...m, failures: 2 }), "hard");
  assert.equal(tierFor({ ...m, failures: 3 }), "critical");
});

test("a specified implementation keeps its own tier steps", () => {
  const m = { execution: "specified", failures: 0, readerTier: "critical" };
  assert.equal(tierFor(m), "everyday");
});

test("no call for continuations, slash commands, short text or local mode", () => {
  const prev = classifyIntent("build the thing", null);
  assert.equal(readerWanted({ text: "yes", previous: prev }), false);
  assert.equal(
    readerWanted({ text: "/apex mode best please now", previous: null }),
    false,
  );
  assert.equal(readerWanted({ text: "short", previous: null }), false);
  assert.equal(
    readerWanted({
      text: "refactor the importer module please",
      previous: null,
      setting: "local",
    }),
    false,
  );
  assert.equal(
    readerWanted({
      text: "refactor the importer module please",
      previous: null,
    }),
    true,
  );
});

test("long prompts are cut to the head and tail", () => {
  const p = readerPrompt("a".repeat(5000) + "END");
  assert.ok(p.length < READER_CHARS + 60);
  assert.ok(p.includes("END"));
});
