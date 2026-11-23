import { test, expect, mock } from "claude-code/testing";

const NOW = 2000000000000;
const HANDOFF = [
  "Implement the approved coding plan in /tmp/apex-fixture/coach-spec.md.",
  "Acceptance criteria: approval and retry tests pass.",
  "Constraints: preserve authentication, medical disclaimers and production data.",
  "Delivery stages: implement the given function changes, connect the component, then verify.",
].join("\n");
const CRITICAL = "Architect a complex security migration for production.";

function harness($, on, reply: any = null, agents: any[] = []) {
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
    value: { context: { tokens: 1000, window: 100000 }, rateLimits: [] },
  }));
  on("agent.list", () => ({ value: agents }));
  const commands: string[] = [];
  on("command.run", (_$, e) => {
    commands.push(e.command + " " + e.args);
    return { text: "ok" };
  });
  const asked: any[] = [];
  on("model.complete", (_$, e) => {
    asked.push(e);
    if (reply === "timeout")
      return { value: { isAnswered: false, reason: "aborted" } };
    return {
      value: {
        isAnswered: true,
        text: JSON.stringify(reply),
        usage: { input_tokens: 400, output_tokens: 20 },
      },
    };
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
      cwd: "/tmp/apex-reader-native",
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
    asked,
  };
}

const HARD =
  "Look at how our sync engine handles conflicts and make it better overall.";

test("a prompt the word rules read as everyday is routed as hard when Haiku rates it hard", async ($, on) => {
  const h = harness($, on, {
    tier: "hard",
    task: "agentic_coding",
    importance: 4,
  });
  await h.start();
  await h.submit(HARD);
  await h.step("t-hard");
  expect(h.asked.length).toBe(1);
  expect(h.asked[0].model).toBe("haiku");
  expect(h.asked[0].effort).toBe("low");
  expect(h.asked[0].prompt).toContain("sync engine");
  const receipt = await h.receipt();
  expect(receipt.tier).toBe("hard");
  expect(h.forwarded[0].model).toBe("fixture-strong");
  const reader = (await $.command.run({ command: "apex", args: "reader" }))
    .text;
  expect(reader).toContain("haiku → hard");
});

test("a local high-risk prompt stays at least hard even when Haiku calls it quick", async ($, on) => {
  const h = harness($, on, { tier: "quick", task: "general", importance: 1 });
  await h.start();
  await h.submit(
    "Rename the variable contractTotal in the payment summary helper please.",
  );
  await h.step("t-risk");
  expect((await h.receipt()).tier).toBe("hard");
});

test("a timeout keeps the word rules, and continuations and local mode make no call", async ($, on) => {
  const h = harness($, on, "timeout");
  await h.start();
  await h.submit(HARD);
  await h.step("t-timeout");
  expect((await h.receipt()).tier).toBe("everyday");
  expect(h.asked.length).toBe(1);
  await h.submit("yes");
  await h.step("t-yes");
  expect(h.asked.length).toBe(1);
  const set = (await $.command.run({ command: "apex", args: "reader local" }))
    .text;
  expect(set).toContain("local word rules only");
  await h.submit(
    "Another longer request about refactoring the importer module.",
  );
  await h.step("t-local");
  expect(h.asked.length).toBe(1);
});
