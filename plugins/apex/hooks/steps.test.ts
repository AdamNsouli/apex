import { test, expect, mock } from "claude-code/testing";

// Effort step by step within a task: after a failed tool call the next step gets
// one effort notch more; after only clean reads and searches it gets one notch
// less, but only when Claude Code sends effort per message (cache kept).
const NOW = 2000000000000;
const TASK =
  "Please update the importer to skip empty rows and add a test for it.";

function harness($, on, env: Record<string, string> = {}) {
  const efforts = ["low", "medium", "high", "xhigh"];
  const runtime = [
    {
      id: "fixture-a",
      name: "fixture-a",
      line: null,
      efforts,
      effortSupported: true,
      context: 100000,
      outputCap: 1000,
      capabilities: {},
      thinking: { adaptive: { supported: true } },
    },
  ];
  // Balanced picks high: xhigh costs far more for two more points.
  const score = { low: 60, medium: 70, high: 80, xhigh: 82 };
  const cost = { low: 0.05, medium: 0.1, high: 0.3, xhigh: 2 };
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      main: "auto",
      backend: "subscription",
      verifiedIds: ["fixture-a"],
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
        models: efforts.map((e) => ({
          id: "fixture-a-" + e,
          slug: "fixture-a-" + e,
          name: "fixture-a",
          effort: e,
          benchmarkVersion: "synthetic-steps",
          scores: { general: score[e] },
          prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
          benchmarkCostPerTask: cost[e],
          latencyMs: 1000,
        })),
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
  mock.env(on, env);
  on("session.version", () => ({ value: { version: "2.1.309" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", () => ({
    value: { context: { tokens: 1000, window: 100000 }, rateLimits: [] },
  }));
  on("agent.list", () => ({ value: [] }));
  on("command.run", () => ({ text: "ok" }));
  on("prompt.submit", (_$, e) => ({ text: e.text }));
  const sent: any[] = [];
  on("turn.step", async function* (_$, e) {
    sent.push({ index: e.index, model: e.model, effort: e.effort });
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "ok",
      toolUses: [],
      stopReason: "tool_use",
      usage: {
        model: e.model,
        input_tokens: 100,
        output_tokens: 10,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  });
  let toolError = false;
  on("tool.call", () =>
    toolError
      ? {
          result: "Error: test failed",
          text: "Error: test failed",
          isError: true,
        }
      : { result: "ok", text: "ok", isError: false, isReadOnly: true },
  );
  const start = async () => {
    await $.session.start({
      cwd: "/tmp/apex-steps-native",
      surface: "terminal",
      isInteractive: true,
    });
    await clock.advance(100);
  };
  const step = async (index) => {
    const stream = $.turn.step({
      turnId: "t1",
      index,
      model: "fixture-a",
      effort: "high",
      messageCount: 2 + index,
    });
    let item = await stream.next();
    while (!item.done) item = await stream.next();
    return sent.at(-1);
  };
  let n = 0;
  const tool = async (name, command?, error = false) => {
    toolError = error;
    await ($ as any).tool.call({
      tool: name,
      tool_use_id: "u" + ++n,
      ...(command ? { command } : {}),
    });
  };
  const receipt = async () =>
    JSON.parse((await $.command.run({ command: "apex", args: "why" })).text);
  return { start, step, tool, receipt };
}

test("a failed tool call gives the next step one more notch of effort, then it settles", async ($, on) => {
  const h = harness($, on);
  await h.start();
  await $.prompt.submit({
    text: TASK,
    wait: false,
    origin: { kind: "composer" },
  });
  expect((await h.step(0)).effort).toBe("high");
  await h.tool("Bash", "npm test", true);
  expect((await h.step(1)).effort).toBe("xhigh");
  expect((await h.receipt()).reason).toBe("step_effort_recover");
  await h.tool("Edit");
  expect((await h.step(2)).effort).toBe("high");
});

test("routine read-only steps keep their effort when each effort change rewrites the cache", async ($, on) => {
  const h = harness($, on);
  await h.start();
  await $.prompt.submit({
    text: TASK,
    wait: false,
    origin: { kind: "composer" },
  });
  await h.step(0);
  await h.tool("Read");
  await h.tool("Grep");
  expect((await h.step(1)).effort).toBe("high");
});

test("with per-message effort, a routine read-only step runs one notch lower", async ($, on) => {
  const h = harness($, on, {
    CLAUDE_CODE_MODEL_CAPABILITIES: "per_turn_effort",
  });
  await h.start();
  await $.prompt.submit({
    text: TASK,
    wait: false,
    origin: { kind: "composer" },
  });
  expect((await h.step(0)).effort).toBe("high");
  await h.tool("Read");
  await h.tool("Bash", "rg importer src");
  expect((await h.step(1)).effort).toBe("medium");
  expect((await h.receipt()).reason).toBe("step_effort_routine");
  // An edit is not routine: back to the task's own effort.
  await h.tool("Edit");
  expect((await h.step(2)).effort).toBe("high");
});
