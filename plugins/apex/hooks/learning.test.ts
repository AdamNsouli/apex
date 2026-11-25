import { test, expect, mock } from "claude-code/testing";

// Learning from bad answers: "that's wrong" or the same prompt again counts a
// strike against that kind of task and routes it one tier higher; clean answers
// wear it off; /apex learning shows and resets it.
const NOW = 2000000000000;
const HANDOFF = [
  "Implement the approved coding plan in /tmp/apex-fixture/coach-spec.md.",
  "Acceptance criteria: approval and retry tests pass.",
  "Constraints: preserve authentication, medical disclaimers and production data.",
  "Delivery stages: implement the given function changes, connect the component, then verify.",
].join("\n");
const CRITICAL = "Architect a complex security migration for production.";

function harness(
  $,
  on,
  rateLimits: any[] = [],
  mode = "balanced",
  agents: any[] = [],
) {
  const runtime = ["fixture-mid", "fixture-strong"].map((id) => ({
    id,
    name: id,
    line: null,
    efforts: ["high"],
    effortSupported: true,
    context: 100000,
    outputCap: 1000,
    capabilities: {},
    thinking: { adaptive: { supported: true } },
  }));
  const row = (id, score, cost) => ({
    id: id + "-high",
    slug: id + "-high",
    name: id,
    effort: "high",
    benchmarkVersion: "synthetic-specified",
    scores: { general: score },
    prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
    benchmarkCostPerTask: cost,
    latencyMs: 1000,
  });
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode,
      routing: "auto",
      main: "auto",
      backend: "subscription",
      verifiedIds: runtime.map((m) => m.id),
      mappings: [],
      taskOverride: null,
      creditsConsent: false,
      budgetUsd: 0,
      ultracode: "auto",
      agents: "auto",
    },
    catalogue: {
      runtime,
      aa: {
        // Mid qualifies for ordinary work; critical work needs the strong pair.
        models: [row("fixture-mid", 75, 0.2), row("fixture-strong", 100, 5)],
        fetchedAt: NOW,
      },
      lastRefresh: NOW,
      lastAARefresh: NOW,
    },
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  const clock = mock.clock(on, { now: NOW });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.309" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", () => ({
    value: { context: { tokens: 1000, window: 100000 }, rateLimits },
  }));
  on("agent.list", () => ({ value: agents }));
  const commands: string[] = [];
  on("command.run", (_$, e) => {
    commands.push(e.command + " " + e.args);
    return { text: "ok" };
  });
  const entered: any[] = [];
  on("prompt.submit", (_$, e) => {
    entered.push(e);
    return { text: e.text };
  });
  const forwarded: any[] = [];
  on("turn.step", async function* (_$, e) {
    forwarded.push(e);
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "ok",
      toolUses: [],
      stopReason: "end_turn",
      usage: {
        model: e.model,
        input_tokens: 100,
        output_tokens: 10,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  });
  const start = async () => {
    await $.session.start({
      cwd: "/tmp/apex-learning-native",
      surface: "terminal",
      isInteractive: true,
    });
    await clock.advance(100);
  };
  const submit = (text) =>
    $.prompt.submit({ text, wait: false, origin: { kind: "composer" } });
  const step = async (turnId, agentId = null, model = "fixture-strong") => {
    const stream = $.turn.step({
      turnId,
      index: 0,
      model,
      effort: "high",
      messageCount: 2,
      ...(agentId ? { agentId } : {}),
    });
    let item = await stream.next();
    while (!item.done) item = await stream.next();
  };
  const receipt = async () =>
    JSON.parse((await $.command.run({ command: "apex", args: "why" })).text);
  return {
    clock,
    commands,
    entered,
    forwarded,
    start,
    submit,
    step,
    receipt,
    writes,
  };
}

const ORDINARY =
  "Please update the importer to skip empty rows and add a test for it.";

test('"that\'s wrong" raises the next pick for that kind of task', async ($, on) => {
  const h = harness($, on);
  await h.start();
  await h.submit(ORDINARY);
  await h.step("t1");
  expect((await h.receipt()).apexRequested.model).toBe("fixture-mid");
  await h.submit("That's wrong, the empty rows are still imported.");
  await h.step("t2");
  const r = await h.receipt();
  expect(r.learnedSteps).toBe(1);
  expect(r.apexRequested.model).toBe("fixture-strong");
  expect(r.task).toMatch(/coding/);
  expect(h.writes.learning.kinds.agentic_coding.strikes).toBe(1);
  expect(h.writes.learning.recent[0]).toMatchObject({
    task: "agentic_coding",
    signal: "complaint",
    model: "fixture-mid",
  });
  const text = (await $.command.run({ command: "apex", args: "learning" }))
    .text;
  expect(text).toContain("agentic coding  ●○○  1 strike · +1 tier");
});

test("sending the same prompt again counts as a retry", async ($, on) => {
  const h = harness($, on);
  await h.start();
  await h.submit(ORDINARY);
  await h.step("t1");
  await h.submit(ORDINARY);
  await h.step("t2");
  const r = await h.receipt();
  expect(r.learnedSteps).toBe(1);
  expect(h.writes.learning.recent[0].signal).toBe("retry");
});

test("a task that only mentions 'wrong' is not a complaint, and nothing counts before an answer", async ($, on) => {
  const h = harness($, on);
  await h.start();
  await h.submit("That's wrong");
  await h.step("t0");
  expect(h.writes.learning).toBeUndefined();
  await h.submit("Fix the wrong date in the footer component and add a test.");
  await h.step("t1");
  expect(h.writes.learning).toBeUndefined();
  expect((await h.receipt()).learnedSteps).toBe(0);
});

test("clean answers wear a strike off, and /apex learning reset clears it", async ($, on) => {
  const h = harness($, on);
  await h.start();
  await h.submit(ORDINARY);
  await h.step("t1");
  await h.submit("That's wrong.");
  await h.step("t2");
  expect(h.writes.learning.kinds.agentic_coding.strikes).toBe(1);
  // Three new coding tasks with no complaint take the strike off.
  const tasks = [
    "Please refactor the csv parser into its own module.",
    "Please add pagination to the export endpoint.",
    "Please write a migration that adds an index to orders.",
  ];
  for (const [i, t] of tasks.entries()) {
    await h.submit(t);
    await h.step("c" + i);
  }
  await h.submit("Please rename the importer helper and update its callers.");
  await h.step("c9");
  expect(h.writes.learning.kinds.agentic_coding).toBeUndefined();
  expect((await h.receipt()).learnedSteps).toBe(0);
  await h.submit("That's not what I asked for.");
  await h.step("t3");
  expect(h.writes.learning.kinds.agentic_coding.strikes).toBe(1);
  const reset = (
    await $.command.run({ command: "apex", args: "learning reset" })
  ).text;
  expect(reset).toContain("cleared");
  expect(h.writes.learning.kinds).toEqual({});
});
