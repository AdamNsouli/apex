import test from "node:test";
import assert from "node:assert/strict";
import { countsAsFailure, tierFor } from "../plugins/apex/core/scoring.mjs";

const err = (o) => ({ isError: true, ...o });

test("a failed check, build or edit counts", () => {
  assert.equal(
    countsAsFailure(
      err({ tool: "Bash", command: "npm test", text: "Exit code 1" }),
    ),
    true,
  );
  assert.equal(
    countsAsFailure(
      err({ tool: "Bash", command: "tsc -p .", text: "Exit code 2" }),
    ),
    true,
  );
  assert.equal(
    countsAsFailure(err({ tool: "Edit", text: "String not found" })),
    true,
  );
  assert.equal(countsAsFailure(err({ tool: "Bash" })), true);
});

test("searches that find nothing do not count, but a real search error does", () => {
  for (const command of [
    "grep -rn x .",
    "cd src && rg y",
    "diff a b",
    "test -f x",
    "find . -name z",
    "git diff --quiet",
    "which foo",
    "command -v foo",
  ])
    assert.equal(
      countsAsFailure(err({ tool: "Bash", command, text: "Exit code 1" })),
      false,
      command,
    );
  assert.equal(
    countsAsFailure(
      err({ tool: "Bash", command: "grep -r x /nope", text: "Exit code 2" }),
    ),
    true,
  );
});

test("refusals, reads and connector tools never count", () => {
  assert.equal(
    countsAsFailure({ tool: "Bash", deny: "refused", isError: undefined }),
    false,
  );
  assert.equal(
    countsAsFailure(err({ tool: "Read", text: "File does not exist" })),
    false,
  );
  assert.equal(
    countsAsFailure(err({ tool: "mcp__Claude_Browser__computer" })),
    false,
  );
  assert.equal(
    countsAsFailure({ tool: "Bash", command: "npm test", isError: false }),
    false,
  );
  assert.equal(countsAsFailure(), false);
});

test("failures raise an ordinary task one step at a time", () => {
  const base = { difficulty: "standard", risk: "normal" };
  assert.equal(tierFor({ ...base, failures: 1 }), "everyday");
  assert.equal(tierFor({ ...base, failures: 2 }), "hard");
  assert.equal(tierFor({ ...base, failures: 3 }), "critical");
  assert.equal(
    tierFor({ difficulty: "simple", risk: "normal", failures: 2 }),
    "hard",
  );
  assert.equal(tierFor({ ...base, risk: "high" }), "critical");
});
