import { test, expect, mock } from "claude-code/testing";
test("Quality once is main-only, consumed under hold and cleared on session restart", async ($, on) => {
  const writes = {
    control: {
      revision: 0,
      mode: "eco",
      routing: "manual_hold",
      backend: "unknown",
      verifiedIds: [],
      mappings: [],
      taskOverride: null,
    },
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  mock.clock(on, { now: 2000000000000 });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", () => ({
    value: { context: { tokens: 1000, window: 100000 }, rateLimits: [] },
  }));
  const forwarded = [];
  on("turn.step", async function* (_$, e) {
    forwarded.push(e);
    yield { kind: "text", index: 0, text: "retained" };
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "retained",
      toolUses: [],
      stopReason: "end_turn",
      usage: {
        model: e.model,
        input_tokens: 10,
        output_tokens: 2,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  });
  const start = () =>
    $.session.start({
      cwd: "/tmp/apex-once-test",
      surface: "terminal",
      isInteractive: true,
    });
  const dispatch = async (agentId, index) => {
    const stream = $.turn.step({
      turnId: "once",
      index,
      model: "native-pair",
      effort: "high",
      messageCount: 2,
      ...(agentId ? { agentId } : {}),
    });
    let r = await stream.next();
    while (!r.done) r = await stream.next();
  };
  await start();
  await $.command.run({ command: "apex", args: "quality-once" });
  expect(writes.control.qualityOnce.revision).toBe(1);
  await dispatch("agent-a", 0);
  expect(writes.control.qualityOnce.revision).toBe(1);
  await dispatch(null, 1);
  expect(writes.control.qualityOnce).toBe(null);
  expect(writes.control.mode).toBe("eco");
  expect(writes.control.consumedBy).toBe("once:1:main");
  expect(forwarded.length).toBe(2);
  expect(forwarded[1].model).toBe("native-pair");
  expect(forwarded[1].effort).toBe("high");
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
  await ui.press({ key: "receipt-once:1:main" });
  expect(
    await ui.find({ type: "Text", text: /High Quality · Quality once/ }),
  ).toBeDefined();
  expect(
    await ui.find({
      type: "Text",
      text: /native model and effort settings are in control/,
    }),
  ).toBeDefined();
  await $.command.run({ command: "apex", args: "quality-once" });
  await start();
  expect(writes.control.qualityOnce).toBeDefined();
  // Restart clears the in-memory arm even before the next persisted dispatch.
  await dispatch(null, 2);
  expect(writes.control.consumedOnceRevision).toBe(null);
  await ui.unmount();
});
test("main request routes through the actual host hook chain; stream retained", async ($, on) => {
  mock.clock(on, { now: 2000000000000 });
  mock.env(on, {});
  const evidence = (slug, score) => ({
    slug,
    id: slug,
    name: slug,
    effort: "high",
    benchmarkVersion: "fictional-v1",
    scores: { general: score, agentic_coding: score },
    prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
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
    thinking: {},
  }));
  mock.store(on, {
    control: {
      revision: 0,
      mode: "quality",
      routing: "auto",
      creditsConsent: true,
      budgetUsd: 10,
      taskOverride: null,
      backend: "subscription",
      verifiedIds: ["model-a", "model-b"],
      mappings: [],
    },
    catalogue: {
      runtime,
      aa: {
        models: [evidence("model-a", 40), evidence("model-b", 60)],
        fetchedAt: 2000000000000,
      },
      lastRefresh: 2000000000000,
    },
  });
  on("session.version", async () => ({ value: { version: "2.1.292" } }));
  on("settings.read", async () => ({ value: {} }));
  on("command.register", async () => ({ value: { command: "apex" } }));
  on("session.start", async (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", async () => ({
    value: {
      context: { tokens: 1000, window: 100000, percent: 1 },
      rateLimits: [],
    },
  }));
  let forwarded;
  on("turn.step", async function* (_$, e) {
    forwarded = e;
    yield { kind: "text", index: 0, text: "real hook stream" };
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "real hook stream",
      toolUses: [],
      stopReason: "end_turn",
      usage: {
        model: e.model,
        input_tokens: 1000,
        output_tokens: 20,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  });
  await $.session.start({
    cwd: "/tmp/apex-native-test",
    surface: "terminal",
    isInteractive: true,
  });
  const stream = $.turn.step({
    turnId: "turn-1",
    index: 0,
    model: "model-a",
    effort: "high",
    messageCount: 2,
  });
  const chunks = [];
  let result;
  for (;;) {
    const item = await stream.next();
    if (item.done) {
      result = item.value;
      break;
    }
    chunks.push(item.value);
  }
  expect(forwarded.model).toBe("model-b");
  expect(forwarded.effort).toBe("high");
  expect(forwarded.messageCount).toBe(2);
  expect(chunks[0].text).toBe("real hook stream");
  expect(result.usage.model).toBe("model-b");
  const inspector = await $.ui.mount({
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
  await inspector.press({ key: "inspect" });
  await inspector.press({ key: "receipt-turn-1:0:main" });
  expect(
    await inspector.find({ type: "Text", text: "Outgoing: model-b / High" }),
  ).toBeDefined();
  expect(
    await inspector.find({ type: "Text", text: "Response: model-b" }),
  ).toBeDefined();
  expect(
    await inspector.find({
      type: "Text",
      text: "Effective effort: not reported",
    }),
  ).toBeDefined();
  await inspector.press({ key: "settings" });
  await inspector.press({ key: "evidence" });
  expect(
    await inspector.find({ type: "Text", text: /Intelligence 60/ }),
  ).toBeDefined();
  await inspector.unmount();

  const agent = $.turn.step({
    turnId: "agent-turn",
    index: 0,
    agentId: "fixture-agent",
    model: "model-a",
    effort: "high",
    messageCount: 2,
  });
  let item = await agent.next();
  while (!item.done) item = await agent.next();
  expect(forwarded.model).toBe("model-a");
  expect(forwarded.agentId).toBe("fixture-agent");
});
test("native pane mode controls exist and change state", async ($, on) => {
  mock.store(on);
  mock.env(on, {});
  mock.clock(on, { now: 2000000000000 });
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
  await ui.press({ key: "mode-toggle" });
  expect(await ui.find({ key: "mode-sports" })).toBeDefined();
  await ui.press({ key: "mode-sports" });
  expect(await ui.find({ type: "Text", text: /revision 1/ })).toBeDefined();
  await ui.unmount();
});
test("mode changed during a stream affects the next request and changes effort", async ($, on) => {
  const now = 2000000000000;
  mock.clock(on, { now });
  mock.env(on, {});
  const runtime = ["fixture-alpha", "fixture-beta"].map((id) => ({
    id,
    name: id,
    line: null,
    efforts: ["medium", "high"],
    effortSupported: true,
    context: 100000,
    outputCap: 1000,
    capabilities: {},
    thinking: null,
  }));
  const variants = [
    ["fixture-alpha", "high", 90, 1000],
    ["fixture-beta", "medium", 99, 10],
    ["fixture-beta", "high", 100, 3000],
  ].map(([slug, effort, score, latency]) => ({
    slug: slug + "-" + effort,
    id: slug + "-" + effort,
    name: slug,
    effort,
    benchmarkVersion: "synthetic",
    scores: { general: score },
    prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
    latencyMs: latency,
  }));
  const mappings = variants.map((m) => ({
    runtimeId: m.name,
    aaSlug: m.slug,
    effort: m.effort,
  }));
  mock.store(on, {
    control: {
      revision: 0,
      mode: "quality",
      routing: "auto",
      creditsConsent: false,
      budgetUsd: 0,
      taskOverride: null,
      backend: "subscription",
      verifiedIds: runtime.map((m) => m.id),
      mappings,
    },
    catalogue: {
      runtime,
      aa: { models: variants, fetchedAt: now },
      lastRefresh: now,
    },
  });
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", () => ({
    value: { context: { tokens: 1000, window: 100000 }, rateLimits: [] },
  }));
  on("prompt.submit", (_$, e) => ({ text: e.text }));
  const forwarded = [];
  on("turn.step", async function* (_$, e) {
    forwarded.push(e);
    yield { kind: "text", index: 0, text: "first" };
    yield { kind: "text", index: 0, text: "second" };
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "firstsecond",
      toolUses: [],
      stopReason: "end_turn",
      usage: {
        model: e.model,
        input_tokens: 1000,
        output_tokens: 20,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  });
  await $.session.start({
    cwd: "/tmp/apex-native-test",
    surface: "terminal",
    isInteractive: true,
  });
  await $.prompt.submit({
    text: "Please explain a general concept clearly",
    wait: false,
    origin: { kind: "composer" },
  });
  const stream = $.turn.step({
    turnId: "t",
    index: 0,
    model: "fixture-alpha",
    effort: "high",
    messageCount: 2,
  });
  const first = await stream.next();
  expect(first.value.text).toBe("first");
  expect(forwarded[0].model).toBe("fixture-beta");
  expect(forwarded[0].effort).toBe("high");
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
  await ui.press({ key: "mode-toggle" });
  await ui.press({ key: "mode-sports" });
  expect((await stream.next()).value.text).toBe("second");
  expect((await stream.next()).done).toBe(true);
  expect(forwarded[0].effort).toBe("high");
  const second = $.turn.step({
    turnId: "t",
    index: 1,
    model: "fixture-alpha",
    effort: "high",
    messageCount: 4,
  });
  let item = await second.next();
  while (!item.done) item = await second.next();
  expect(forwarded[1].model).toBe("fixture-beta");
  expect(forwarded[1].effort).toBe("medium");
  expect(forwarded[1].messageCount).toBe(4);
  await ui.unmount();
});
test("manual model command suspends auto routing until explicitly resumed", async ($, on) => {
  mock.store(on);
  mock.env(on, {});
  mock.clock(on, { now: 2000000000000 });
  on("command.run", () => ({ text: "native model command" }));
  await $.command.run({
    command: "model",
    args: "fixture",
    origin: { kind: "composer" },
  });
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
  expect(await ui.find({ type: "Text", text: /Held/ })).toBeDefined();
  await $.command.run({ command: "apex", args: "auto" });
  expect(await ui.find({ type: "Text", text: /Observing only/ })).toBeDefined();
  await ui.unmount();
});

// Two chats share one stored settings record but each loads it only once. These
// tests play the other chat by writing a newer revision straight to the store.
const otherChatSaved = {
  revision: 4,
  mode: "quality",
  modeRevision: 4,
  backend: "subscription",
  verifiedIds: ["m5"],
  mappings: [{ runtimeId: "m5", aaSlug: "m5-low", effort: "low" }],
};
function sharedSettingsHarness($, on) {
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "eco",
      routing: "auto",
      backend: "unknown",
      verifiedIds: [],
      mappings: [],
      taskOverride: null,
    },
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  mock.clock(on, { now: 2000000000000 });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", () => ({
    value: { context: { tokens: 1000, window: 100000 }, rateLimits: [] },
  }));
  const forwarded: any[] = [];
  on("turn.step", async function* (_$, e) {
    forwarded.push(e);
    yield { kind: "text", index: 0, text: "ok" };
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "ok",
      toolUses: [],
      stopReason: "end_turn",
      usage: {
        model: e.model,
        input_tokens: 10,
        output_tokens: 2,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  });
  return {
    writes,
    forwarded,
    start: () =>
      $.session.start({
        cwd: "/tmp/apex-shared-settings-test",
        surface: "terminal",
        isInteractive: true,
      }),
    step: async (index: number, model = "native-pair") => {
      const stream = $.turn.step({
        turnId: "shared",
        index,
        model,
        effort: "high",
        messageCount: 2,
      });
      let r = await stream.next();
      while (!r.done) r = await stream.next();
    },
  };
}
test("a request step in an older chat does not overwrite settings another chat saved", async ($, on) => {
  const h = sharedSettingsHarness($, on);
  await h.start();
  h.writes.control = { ...h.writes.control, ...otherChatSaved };
  await h.step(0);
  expect(h.writes.control.verifiedIds).toEqual(["m5"]);
  expect(h.writes.control.mappings.length).toBe(1);
  expect(h.writes.control.backend).toBe("subscription");
  expect(h.writes.control.mode).toBe("quality");
  expect(h.writes.control.revision).toBe(4);
  expect(h.writes.control.consumedBy).toBe("shared:0:main");
});
test("a change in an older chat is applied on top of settings another chat saved", async ($, on) => {
  const h = sharedSettingsHarness($, on);
  await h.start();
  h.writes.control = { ...h.writes.control, ...otherChatSaved };
  await $.command.run({ command: "apex", args: "hold" });
  expect(h.writes.control.routing).toBe("manual_hold");
  expect(h.writes.control.verifiedIds).toEqual(["m5"]);
  expect(h.writes.control.mappings.length).toBe(1);
  expect(h.writes.control.mode).toBe("quality");
  expect(h.writes.control.revision).toBe(5);
});
test("an older chat routes with the backend another chat saved but not its paid-routing consent", async ($, on) => {
  const h = sharedSettingsHarness($, on);
  const evidence = (slug: string, score: number) => ({
    slug,
    id: slug,
    name: slug,
    effort: "high",
    benchmarkVersion: "fictional-v1",
    scores: { general: score, agentic_coding: score },
    prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
    latencyMs: 1000,
  });
  h.writes.control = {
    ...h.writes.control,
    mode: "quality",
    backend: "subscription",
    verifiedIds: ["model-a", "model-b"],
  };
  h.writes.catalogue = {
    runtime: ["model-a", "model-b"].map((id) => ({
      id,
      name: id,
      line: null,
      efforts: ["high"],
      effortSupported: true,
      context: 100000,
      outputCap: 1000,
      capabilities: {},
      thinking: {},
    })),
    aa: {
      models: [evidence("model-a", 40), evidence("model-b", 60)],
      fetchedAt: 2000000000000,
    },
    lastRefresh: 2000000000000,
  };
  await h.start();
  // Another chat switches to a paid API backend and grants itself consent.
  h.writes.control = {
    ...h.writes.control,
    revision: 3,
    backend: "api",
    creditsConsent: true,
    budgetUsd: 10,
  };
  await h.step(0, "model-a");
  // This chat now knows the backend is paid but has not consented here.
  expect(h.forwarded.at(-1).model).toBe("model-a");
  const why = JSON.parse(
    (await $.command.run({ command: "apex", args: "why" })).text,
  );
  expect(why.reason).toBe("paid_routing_consent_required");
});
