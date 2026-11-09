import { test, expect, mock } from "claude-code/testing";

// Only real failed checks raise the tier. A search that finds nothing, a refused
// call and a browser-pane tool error are normal work and must not.
const NOW = 2000000000000;
const TASK = "Explain how the settings page stores the chosen theme.";

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
    benchmarkVersion: "synthetic-failures",
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

const failing = (on, text) =>
  on("tool.call", () => ({ result: text, text, isError: true }));
const call = ($, id, tool, command?) =>
  ($ as any).tool.call({
    tool,
    tool_use_id: id,
    ...(command ? { command } : {}),
  });

async function run($, on, errors: [string, string | undefined, string][]) {
  const h = harness($, on);
  let current = errors[0];
  on("tool.call", () => ({
    result: current[2],
    text: current[2],
    isError: true,
  }));
  await h.start();
  await h.submit(TASK);
  await h.step("t0");
  const before = (await h.receipt()).tier;
  let n = 0;
  for (const err of errors) {
    current = err;
    await call($, "e" + ++n, err[0], err[1]);
  }
  await h.step("t1");
  return { before, receipt: await h.receipt() };
}

test("searches that find nothing and refused calls do not raise the tier", async ($, on) => {
  const { before, receipt } = await run($, on, [
    ["Bash", "grep -rn missing src", "Exit code 1"],
    ["Bash", "cd src && rg nothing", "Exit code 1"],
    ["Bash", "diff a b", "Exit code 1"],
    ["mcp__Claude_Browser__computer", undefined, "page not ready"],
    ["Read", undefined, "File does not exist"],
  ]);
  expect(receipt.tier).toBe(before);
  expect(receipt.reason).not.toBe("failure_escalation");
});

test("two real failed checks make the task hard, three make it critical, and the receipt says why", async ($, on) => {
  const two = await run($, on, [
    ["Bash", "npm test", "Exit code 1\n2 failing"],
    ["Edit", undefined, "String to replace not found"],
  ]);
  expect(two.receipt.tier).toBe("hard");
  expect(two.receipt.reason).toBe("failure_escalation");
});

test("three real failed checks make the task critical", async ($, on) => {
  const { receipt } = await run($, on, [
    ["Bash", "npm test", "Exit code 1\n2 failing"],
    ["Bash", "npm run build", "Exit code 2"],
    ["Bash", "grep -c x y", "Exit code 2"],
  ]);
  expect(receipt.tier).toBe("critical");
  expect(receipt.reason).toBe("failure_escalation");
});
