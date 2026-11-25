import { test, expect, mock } from "claude-code/testing";

// /apex report: every finished request is kept in a small shared record, and the
// report charts which model really answered this week and how often APEX changed it.
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
  on("ui.open", () => ({ value: { isPlaced: true } }));
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
      cwd: "/tmp/apex-report-native",
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

test("finished requests are recorded and /apex report charts them", async ($, on) => {
  const h = harness($, on);
  await h.start();
  const empty = (await $.command.run({ command: "apex", args: "report" })).text;
  expect(empty).toContain("no finished requests recorded");
  await h.submit(ORDINARY);
  await h.step("t1");
  await h.clock.advance(10);
  await h.submit(ORDINARY);
  await h.step("t2");
  await h.clock.advance(10);
  const rows = h.writes.history;
  expect(rows.length).toBe(2);
  // No prompt text is kept: only when, the models and the tier.
  expect(Object.keys(rows[0]).sort()).toEqual(
    ["agent", "ans", "at", "eff", "req", "set", "tier"].sort(),
  );
  expect(JSON.stringify(rows)).not.toContain("importer");
  const text = (await $.command.run({ command: "apex", args: "report" })).text;
  expect(text).toContain("APEX report · last 7 days · 2 requests");
  expect(text).toContain("Model that answered");
  expect(text).toMatch(/fixture-mid\s+█+\s+100% \(2\)/);
  expect(text).toContain("APEX changed the model");
  expect(text).toContain("(2 of 2)");
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "Pane",
    requestId: "apex",
    props: {
      title: "APEX",
      isFocused: true,
      bodyColumns: 72,
      placement: "inline",
    },
  });
  expect(
    await ui.find({ type: "Text", text: /MODEL THAT ANSWERED/ }),
  ).toBeDefined();
  expect(
    await ui.find({ type: "Text", text: /DID APEX CHANGE THE MODEL/ }),
  ).toBeDefined();
  expect(await ui.find({ type: "Text", text: "100% (2)" })).toBeDefined();
  expect(
    await ui.find({ type: "Text", text: /REQUESTS PER DAY/ }),
  ).toBeDefined();
  await ui.unmount();
});

test("rows older than 35 days are dropped and another chat's rows are kept", async ($, on) => {
  const h = harness($, on);
  h.writes.history = [
    {
      at: NOW - 40 * 86400000,
      set: "a",
      req: "a",
      eff: null,
      ans: "a",
      tier: null,
      agent: false,
    },
    {
      at: NOW - 1000,
      set: "fixture-strong",
      req: "fixture-strong",
      eff: "high",
      ans: "fixture-strong",
      tier: "hard",
      agent: false,
    },
  ];
  await h.start();
  await h.submit(ORDINARY);
  await h.step("t3");
  await h.clock.advance(10);
  expect(h.writes.history.length).toBe(2);
  expect(h.writes.history[0].req).toBe("fixture-strong");
  const text = (await $.command.run({ command: "apex", args: "report" })).text;
  expect(text).toContain("2 requests");
  expect(text).toContain("Kept your setting");
});
