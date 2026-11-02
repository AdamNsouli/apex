import { test, expect, mock } from "claude-code/testing";

const NOW = 2000000000000;
const HANDOFF = [
  "Implement the approved coding plan in /tmp/apex-fixture/coach-spec.md.",
  "Acceptance criteria: approval and retry tests pass.",
  "Constraints: preserve authentication, medical disclaimers and production data.",
  "Delivery stages: implement the given function changes, connect the component, then verify.",
].join("\n");
const CRITICAL = "Architect a complex security migration for production.";

function harness($, on, agents: any[] = []) {
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
      mode: "balanced",
      routing: "auto",
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
        models: [
          row("fixture-mid", 75, 0.2),
          row("fixture-strong", 100, 5),
        ],
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
    value: { context: { tokens: 1000, window: 100000 }, rateLimits: [] },
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
      cwd: "/tmp/apex-specified-native",
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
  return { clock, commands, entered, forwarded, start, submit, step, receipt };
}

test("specified execution receives bounded guidance and an ordinary-floor model while risk remains visible", async ($, on) => {
  const h = harness($, on);
  await h.start();
  const result = await h.submit(HANDOFF);
  expect(result.drop).toBeUndefined();
  expect(h.entered.length).toBe(1);
  expect(h.entered[0].context?.length).toBe(1);
  expect(h.entered[0].context[0]).toMatch(/specified implementation work/);
  expect(h.entered[0].context[0]).toMatch(/one main agent/);
  await h.clock.advance(100);
  expect(h.commands.filter((c) => c.startsWith("effort "))).toEqual([]);
  await h.step("specified");
  expect(h.forwarded[0].model).toBe("fixture-mid");
  const receipt = await h.receipt();
  expect(receipt.tier).toBe("everyday");
  expect(receipt.risk).toBe("high");
  expect(receipt.reason).toBe("specified_execution_policy");
});

test("a genuinely critical Balanced task retains the strong pair without automatic Ultracode or a fan-out note", async ($, on) => {
  const h = harness($, on);
  await h.start();
  const result = await h.submit(CRITICAL);
  expect(result.drop).toBeUndefined();
  expect(h.entered.length).toBe(1);
  expect(h.entered[0].context ?? []).toEqual([]);
  await h.clock.advance(100);
  expect(h.commands.filter((c) => c.startsWith("effort "))).toEqual([]);
  await h.step("critical");
  expect(h.forwarded[0].model).toBe("fixture-strong");
  expect((await h.receipt()).tier).toBe("critical");
});

test("the native hook reads each workflow description before separating mappers from reviewers and explicit worker models", async ($, on) => {
  const h = harness(
    $,
    on,
    [
      ["mapper", "map:context"],
      ["reviewer", "Security architecture reviewer"],
      ["unknown", ""],
      ["explicit", "map:source"],
    ].map(([id, description]) => ({
      id,
      description,
      type: "workflow-subagent",
      status: "running",
    })),
  );
  await h.start();
  await h.submit(CRITICAL);
  await h.step("main");
  await h.step("map", "mapper");
  expect(h.forwarded[1].model).toBe("fixture-mid");
  expect((await h.receipt()).tier).toBe("everyday");
  await h.step("review", "reviewer");
  expect(h.forwarded[2].model).toBe("fixture-strong");
  expect((await h.receipt()).tier).toBe("critical");
  await h.step("unknown", "unknown");
  expect(h.forwarded[3].model).toBe("fixture-strong");
  await h.step("explicit", "explicit", "fixture-mid");
  expect(h.forwarded[4].model).toBe("fixture-mid");
  expect((await h.receipt()).reason).toBe("agent_model_chosen");
});

test("failed checks escalate specified worker and main tiers independently", async ($, on) => {
  const h = harness($, on, [
    {
      id: "mapper",
      description: "map:context",
      type: "workflow-subagent",
      status: "running",
    },
  ]);
  on("tool.call", () => ({
    result: "failed synthetic check",
    isError: true,
  }));
  await h.start();
  await h.submit(HANDOFF);
  await h.step("main-before");
  await h.step("mapper-before", "mapper");
  expect(h.forwarded[1].model).toBe("fixture-mid");
  const failCheck = (id) =>
    ($ as any).tool.call({
      tool: "Bash",
      tool_use_id: id,
      input: { command: "synthetic" },
      agentId: "mapper",
    });
  await failCheck("failure-1");
  await h.step("mapper-after-one", "mapper");
  expect(h.forwarded[2].model).toBe("fixture-strong");
  expect((await h.receipt()).tier).toBe("hard");
  expect((await h.receipt()).reason).toBe("execution_failure_escalation");
  await h.step("main-unaffected");
  expect(h.forwarded[3].model).toBe("fixture-mid");
  expect((await h.receipt()).tier).toBe("everyday");
  await failCheck("failure-2");
  await h.step("mapper-after-two", "mapper");
  expect((await h.receipt()).tier).toBe("critical");
  for (const [n, tier] of [[1, "hard"], [2, "critical"]]) {
    await ($ as any).tool.call({
      tool: "Bash",
      tool_use_id: "main-failure-" + n,
      input: { command: "synthetic" },
    });
    await h.step("main-after-" + n);
    expect((await h.receipt()).tier).toBe(tier);
    expect((await h.receipt()).reason).toBe("execution_failure_escalation");
  }
});
