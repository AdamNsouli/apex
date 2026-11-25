import { test, expect, mock } from "claude-code/testing";

const NOW = 2000000000000;
const HANDOFF = [
  "Implement the approved coding plan in /tmp/apex-fixture/coach-spec.md.",
  "Acceptance criteria: approval and retry tests pass.",
  "Constraints: preserve authentication, medical disclaimers and production data.",
  "Delivery stages: implement the given function changes, connect the component, then verify.",
].join("\n");
const CRITICAL = "Architect a complex security migration for production.";

function harness($, on, tokens = 1000, mode = "balanced", agents: any[] = []) {
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
    value: { context: { tokens, window: 1000000 }, rateLimits: [] },
  }));
  on("agent.list", () => ({ value: agents }));
  const commands: string[] = [];
  on("command.run", (_$, e) => {
    commands.push(e.command + " " + e.args);
    return { text: "ok" };
  });
  on("tool.call", (_$, e) => ({
    result: { stdout: "src/a.ts:1: hit", stderr: "", interrupted: false },
    text: "src/a.ts:1: hit",
    ...(e.tool === "Bash" ? {} : {}),
  }));
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
      cwd: "/tmp/apex-delegation-native",
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

const CODE_CRITICAL =
  "Fix the payment endpoint bug in the production api code and update its tests.";

test("a long chat that keeps searching gets one Explore note on a tool result", async ($, on) => {
  const h = harness($, on, 250000);
  await h.start();
  await h.submit("Find where the importer handles empty rows.");
  await h.step("t1");
  const results: any[] = [];
  for (let i = 0; i < 6; i++)
    results.push(
      await $.tool.call({
        tool: "Grep",
        pattern: "empty",
        tool_use_id: "g" + i,
      } as any),
    );
  const noted = results.filter((r) =>
    (r.context ?? []).some((c) => /Explore subagent/.test(c)),
  );
  expect(noted.length).toBe(1);
  expect(results.indexOf(noted[0])).toBe(3);
  expect(noted[0].context.join(" ")).toContain("250k tokens");
});

test("a critical code change in Balanced gets one reviewer note; Save gets none", async ($, on) => {
  const h = harness($, on, 1000, "balanced");
  await h.start();
  await h.submit(CODE_CRITICAL);
  const notes = h.entered[0].context ?? [];
  expect(notes.length).toBe(1);
  expect(notes[0]).toContain("one reviewer subagent");
  await $.command.run({ command: "apex", args: "mode save" });
  await h.submit(
    "Fix the tax calculation bug in the billing api code and add a test.",
  );
  expect(h.entered[1].context ?? []).toEqual([]);
});
