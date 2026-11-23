import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wantsTrim,
  trimmedOutput,
  OUTPUT_LIMIT,
} from "../plugins/apex/core/output.mjs";

const big = (n, line = "ok line") =>
  Array.from({ length: n }, (_, i) => `${line} ${i}`).join("\n");

test("trims only long, unbounded, successful output", () => {
  const stdout = big(2000);
  assert.ok(stdout.length > OUTPUT_LIMIT);
  assert.equal(wantsTrim({ command: "npm run build", stdout }), true);
  for (const command of [
    "npm run build | tail -40",
    "sed -n 1,400p big.js",
    "cat package-lock.json",
    "grep -m 5 foo -r .",
    "git diff",
    "git log -p -3",
    "wc -l *",
    "cat /tmp/x/apex-output/bash-1.txt",
  ])
    assert.equal(wantsTrim({ command, stdout }), false, command);
  assert.equal(
    wantsTrim({ command: "npm test", stdout, isError: true }),
    false,
  );
  assert.equal(
    wantsTrim({ command: "npm test", stdout, setting: "off" }),
    false,
  );
  assert.equal(wantsTrim({ command: "npm test", stdout: "short" }), false);
  assert.equal(wantsTrim({ command: "x", stdout, background: true }), false);
});

test("keeps head, tail, error lines from the middle and the path", () => {
  const lines = big(3000).split("\n");
  lines[1500] = "ERROR: database connection refused";
  lines[1600] = "warning: deprecated flag";
  const t = trimmedOutput({
    stdout: lines.join("\n"),
    path: "/s/apex-output/bash-1.txt",
  });
  assert.ok(t.stdout.startsWith("ok line 0"));
  assert.ok(t.stdout.trimEnd().endsWith("ok line 2999"));
  assert.match(t.stdout, /ERROR: database connection refused/);
  assert.match(t.stdout, /warning: deprecated flag/);
  assert.match(t.stdout, /Full output: \/s\/apex-output\/bash-1.txt/);
  assert.ok(t.stdout.length < 8000);
  assert.ok(t.cutChars > 0);
});
