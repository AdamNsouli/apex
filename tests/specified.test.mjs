import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentPlan,
  classifyIntent,
  initialControl,
  wantsFanOut,
  wantsUltracode,
} from "../plugins/apex/core/router.mjs";
import { tierFor } from "../plugins/apex/core/scoring.mjs";

// Synthetic handoff: no private prompts, personal paths or model inference.
const SPECIFIED = [
  "Implement the approved coding plan in /tmp/apex-fixture/coach-spec.md.",
  "The implementation contract fixes the component, function and API changes.",
  "Acceptance criteria: the approval tests, retry test and mobile layout checks pass.",
  "Constraints: preserve authentication, medical disclaimers and existing data.",
  "Do not delete production data or change the model provider.",
  "Delivery stages: implement the stated service, connect the UI, then verify.",
].join("\n");

test("a concrete approved implementation is coding execution, not healthcare or legal judgment", () => {
  const intent = classifyIntent(SPECIFIED);
  assert.equal(intent.task, "agentic_coding");
  assert.equal(intent.execution, "specified");
  assert.equal(intent.risk, "high");
  assert.equal(tierFor(intent), "everyday");
});

test("specified execution uses an ordinary implementation floor and escalates on failures", () => {
  const intent = classifyIntent(SPECIFIED);
  assert.equal(tierFor({ ...intent, failures: 0 }), "everyday");
  assert.equal(tierFor({ ...intent, failures: 1 }), "hard");
  assert.equal(tierFor({ ...intent, failures: 2 }), "critical");
  assert.equal(tierFor({ ...intent, failures: 3 }), "critical");
});

test("length, a path or generic instructions alone do not prove the decisions are already made", () => {
  const prompts = [
    "Implement the code in /tmp/apex-fixture/app.js.",
    "Implement a new API. Follow these instructions carefully.",
    "Implement the idea in /tmp/apex-fixture/ideas.md. " +
      "It should be reliable, convenient and easy to use. ".repeat(80),
  ];
  for (const prompt of prompts)
    assert.notEqual(classifyIntent(prompt).execution, "specified", prompt);
});

test("unresolved design or debugging work overrides an otherwise detailed handoff", () => {
  for (const unresolved of [
    "Choose the architecture and resolve the conflicting constraints before implementing.",
    "Find the root cause; the diagnosis is unknown.",
    "Decide which storage design is best and compare the tradeoffs.",
    "Work out whether the current security approach is safe before coding.",
    "Compare Redis and Postgres and select the best storage design.",
    " ".repeat(12000) + "Choose the architecture before coding.",
  ]) {
    const intent = classifyIntent(SPECIFIED + "\n" + unresolved);
    assert.notEqual(intent.execution, "specified", unresolved);
    assert.equal(tierFor(intent), "critical", unresolved);
  }
});

test("an exact bounded source edit can be specified, while actual high-stakes decisions stay protected", () => {
  const edit = classifyIntent(
    'In src/components/Title.jsx replace the string "Start" with "Resume". Keep everything else unchanged.',
  );
  assert.equal(edit.execution, "specified");
  for (const prompt of [
    "Review this medical protocol and diagnose the patient's chest pain.",
    "Read the contract and tell me whether I should sign it.",
    "Architect a complex security migration for production.",
    "Change the authentication architecture to whatever design is best in src/auth.ts. Preserve existing behavior and verify the tests.",
  ]) {
    const intent = classifyIntent(prompt);
    assert.notEqual(intent.execution, "specified", prompt);
    assert.equal(tierFor(intent), "critical", prompt);
  }
});

test("continuations retain the approved execution context; a new decision request replaces it", () => {
  const intent = classifyIntent(SPECIFIED);
  assert.equal(classifyIntent("continue", intent), intent);
  assert.equal(classifyIntent("okay", intent), intent);
  const next = classifyIntent(
    "Choose the architecture for a complex security migration.",
    intent,
  );
  assert.notEqual(next, intent);
  assert.notEqual(next.execution, "specified");
  assert.equal(tierFor(next), "critical");
});

test("Balanced never automatically fans out, and a specified handoff does not need Best fan-out", () => {
  const ask = (mode, prompt) => ({
    control: { ...initialControl(), mode },
    intent: classifyIntent(prompt),
    fresh: true,
    text: prompt,
    origin: { kind: "composer" },
  });
  for (const prompt of [
    SPECIFIED,
    "Architect a complex security migration for production.",
  ]) {
    const args = ask("balanced", prompt);
    assert.equal(wantsUltracode(args), false);
    assert.equal(wantsFanOut(args), false);
  }
  const specifiedBest = ask("best", SPECIFIED);
  assert.equal(wantsUltracode(specifiedBest), false);
  assert.equal(wantsFanOut(specifiedBest), false);
});

test("positive mapping labels get an ordinary worker budget without weakening reviewers or explicit models", () => {
  const mainIntent = classifyIntent(
    "Architect a complex security migration for production.",
  );
  const args = (description, over = {}) => ({
    control: { ...initialControl(), mode: "balanced" },
    agentType: "workflow-subagent",
    agentDescription: description,
    agentModel: "parent-model",
    mainModel: "parent-model",
    mainIntent,
    ...over,
  });
  for (const description of [
    "map:context",
    "Read-only map of existing API fields",
    "Search and lookup of source definitions",
  ]) {
    const plan = agentPlan(args(description));
    assert.equal(plan.route, true, description);
    assert.equal(plan.intent.task, "agentic_coding", description);
    assert.equal(plan.intent.execution, "specified", description);
    assert.equal(tierFor(plan.intent), "everyday", description);
  }
  for (const description of [
    "Architecture review",
    "Security reviewer",
    "Investigate unknown failure",
    "Search for a safe way to migrate authentication",
    "Search source files for a solution to the authentication migration",
    "",
  ])
    assert.equal(agentPlan(args(description)).intent, mainIntent, description);
  assert.equal(
    agentPlan(args("map:context", { agentModel: "explicit-worker-model" })).route,
    false,
  );
  assert.equal(
    agentPlan(
      args("map:context", { control: { ...initialControl(), agents: "off" } }),
    ).route,
    false,
  );
  const specified = classifyIntent(SPECIFIED);
  for (const mode of ["save", "balanced"])
    for (const description of ["Security architecture reviewer", ""]) {
      const plan = agentPlan(args(description, {
        control: { ...initialControl(), mode },
        mainIntent: specified,
      }));
      assert.notEqual(plan.intent.execution, "specified", description);
      assert.equal(tierFor(plan.intent), "critical", description);
      assert.equal(plan.intent.risk, "high", description);
    }
});
