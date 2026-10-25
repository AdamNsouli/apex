import { test, expect, mock } from "claude-code/testing";

// Subagents are routed under the base mode: a search agent as a quick task, any
// other agent as the main chat's task, and an agent given its own model is left alone.
test("subagents are routed, search agents cheaply, and agents with their own model keep it", async ($, on) => {
  mock.clock(on, { now: 2000000000000 });
  mock.env(on, {});
  const evidence = (slug, score, cost) => ({
    slug,
    id: slug,
    name: slug,
    effort: "high",
    benchmarkVersion: "fictional-v1",
    scores: { general: score },
    prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
    benchmarkCostPerTask: cost,
    latencyMs: 1000,
  });
  const runtime = ["model-a", "model-b"].map((id) => ({
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
  const writes = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      creditsConsent: false,
      budgetUsd: 0,
      taskOverride: null,
      backend: "subscription",
      verifiedIds: ["model-a", "model-b"],
      mappings: [],
    },
    catalogue: {
      runtime,
      aa: {
        // a is far cheaper and reaches a quick task's share of b, not an everyday one.
        models: [evidence("model-a", 45, 0.05), evidence("model-b", 60, 1)],
        fetchedAt: 2000000000000,
      },
      lastRefresh: 2000000000000,
    },
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  on("session.version", async () => ({ value: { version: "2.1.308" } }));
  on("settings.read", async () => ({ value: {} }));
  on("command.register", async () => ({ value: { command: "apex" } }));
  on("session.start", async (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", async () => ({
    value: { context: { tokens: 1000, window: 100000 }, rateLimits: [] },
  }));
  on("agent.list", async () => ({
    value: [
      {
        id: "search",
        description: "find files",
        type: "Explore",
        status: "running",
      },
      {
        id: "worker",
        description: "do it",
        type: "general-purpose",
        status: "running",
      },
      {
        id: "pinned",
        description: "own model",
        type: "general-purpose",
        status: "running",
      },
    ],
  }));
  const sent = new Map();
  on("turn.step", async function* (_$, e) {
    sent.set(e.agentId ?? "main", e.model);
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "",
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
  await $.session.start({
    cwd: "/tmp/apex-agents-test",
    surface: "terminal",
    isInteractive: true,
  });
  const step = async (agentId, model, index) => {
    const s = $.turn.step({
      turnId: "t",
      index,
      model,
      effort: "high",
      messageCount: 2,
      ...(agentId ? { agentId } : {}),
    });
    let r = await s.next();
    while (!r.done) r = await s.next();
  };
  await step(null, "model-b", 0);
  expect(sent.get("main")).toBe("model-b");
  await step("search", "model-b", 0);
  expect(sent.get("search")).toBe("model-a");
  await step("worker", "model-b", 0);
  expect(sent.get("worker")).toBe("model-b");
  // Asked for another model than the session's: it was chosen for it, so it stays.
  await step("pinned", "model-a", 0);
  expect(sent.get("pinned")).toBe("model-a");
  await $.command.run({ command: "apex", args: "agents off" });
  expect(writes.control.agents).toBe("off");
  sent.delete("search");
  await step("search", "model-b", 1);
  expect(sent.get("search")).toBe("model-b");
});
