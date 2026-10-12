import { test, expect, mock } from "claude-code/testing";

const NOW = 2000000000000;
const runtimeModel = (id: string, name = id) => ({
  id,
  name,
  line: null,
  efforts: ["high"],
  effortSupported: true,
  context: 100000,
  outputCap: 1000,
  capabilities: {},
  thinking: null,
});

test("the daily refresh records a new model, the rail names it and confirm-models adds it", async ($, on) => {
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      backend: "subscription",
      verifiedIds: ["m1"],
      mappings: [],
      taskOverride: null,
    },
    // Routing is otherwise ready (fresh benchmark data, one routable pair), so
    // the rail has no setup blocker and can show the notice.
    catalogue: {
      runtime: [runtimeModel("m1", "M1")],
      aa: {
        fetchedAt: NOW - 3600000,
        models: [
          {
            id: "m1-high",
            slug: "m1-high",
            name: "M1 (High)",
            effort: "high",
            benchmarkVersion: "synthetic",
            scores: { general: 50 },
            prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
            benchmarkCostPerTask: 0.5,
            latencyMs: 1000,
          },
        ],
      },
      lastRefresh: NOW - 2 * 86400000,
      lastAARefresh: NOW - 3600000,
    },
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  const clock = mock.clock(on, { now: NOW });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.authorize", () => ({ value: { handle: "h", kind: "bearer" } }));
  const listing = JSON.stringify({
    data: ["m1", "m2"].map((id) => ({
      id,
      display_name: id.toUpperCase(),
      max_input_tokens: 100000,
      max_tokens: 1000,
      capabilities: { effort: { supported: true, high: { supported: true } } },
    })),
    has_more: false,
  });
  on("http.fetch", () => ({
    value: { status: 200, ok: true, headers: {}, text: listing },
  }));
  await $.session.start({
    cwd: "/tmp/apex-policy-refresh-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  expect(writes.catalogue.lastChange.newModels).toEqual(["m2"]);
  const doctor = JSON.parse(
    (await $.command.run({ command: "apex", args: "doctor" })).text,
  );
  expect(doctor.lastChange.newModels).toEqual(["m2"]);
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
    await ui.find({
      type: "Text",
      text: /New model M2.*\/apex confirm-models m2/,
    }),
  ).toBeDefined();
  await ui.unmount();
  const unknown = await $.command.run({
    command: "apex",
    args: "confirm-models nope",
  });
  expect(unknown.text).toMatch(/Not on your account: nope/);
  expect(writes.control.verifiedIds).toEqual(["m1"]);
  const done = await $.command.run({
    command: "apex",
    args: "confirm-models m2",
  });
  expect(done.text).toMatch(/Confirmed: m2/);
  expect(writes.control.verifiedIds).toEqual(["m1", "m2"]);
});

test("confirm-models needs a confirmed backend first", async ($, on) => {
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      backend: "unknown",
      verifiedIds: [],
      mappings: [],
      taskOverride: null,
    },
    catalogue: {
      runtime: [runtimeModel("m1")],
      aa: null,
      lastRefresh: NOW,
      lastAARefresh: 0,
    },
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  mock.clock(on, { now: NOW });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  await $.session.start({
    cwd: "/tmp/apex-policy-backend-test",
    surface: "terminal",
    isInteractive: true,
  });
  const r = await $.command.run({ command: "apex", args: "confirm-models m1" });
  expect(r.text).toMatch(/Set your backend first/);
  expect(writes.control.verifiedIds).toEqual([]);
});

test("a quick request takes the cheaper pair, an ordinary one keeps the strong pair, and the receipt says why", async ($, on) => {
  const runtime = ["fixture-alpha", "fixture-beta"].map((id) => ({
    ...runtimeModel(id),
    context: 100000,
  }));
  // alpha: 75 points, cheap and quick; beta: 100 points, dear and slow.
  const row = (slug, score, cost, seconds, price) => ({
    slug: slug + "-high",
    id: slug + "-high",
    name: slug + " (High)",
    effort: "high",
    benchmarkVersion: "synthetic",
    scores: { general: score },
    prices: {
      input: price,
      output: price * 2,
      cacheRead: 0.1,
      cacheWrite: price,
    },
    benchmarkCostPerTask: cost,
    latencyMs: seconds * 1000,
  });
  const aa = {
    models: [
      row("fixture-alpha", 75, 0.3, 5, 0.5),
      row("fixture-beta", 100, 5, 60, 1),
    ],
    fetchedAt: NOW,
  };
  mock.store(on, {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      backend: "subscription",
      verifiedIds: runtime.map((m) => m.id),
      mappings: [],
      taskOverride: null,
    },
    catalogue: { runtime, aa, lastRefresh: NOW, lastAARefresh: NOW },
  });
  mock.clock(on, { now: NOW });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", () => ({
    value: { context: { tokens: 1000, window: 100000 }, rateLimits: [] },
  }));
  on("prompt.submit", (_$, e) => ({ text: e.text }));
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
        input_tokens: 10,
        output_tokens: 2,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  });
  await $.session.start({
    cwd: "/tmp/apex-policy-route-test",
    surface: "terminal",
    isInteractive: true,
  });
  const step = async (turnId: string, text: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: "composer" } });
    const s = $.turn.step({
      turnId,
      index: 0,
      model: "fixture-beta",
      effort: "high",
      messageCount: 2,
    });
    let item = await s.next();
    while (!item.done) item = await s.next();
  };
  await step("quick", "format this list");
  expect(forwarded[0].model).toBe("fixture-alpha");
  const quick = JSON.parse(
    (await $.command.run({ command: "apex", args: "why" })).text,
  );
  expect(quick.reason).toBe("balanced_policy");
  expect(quick.tier).toBe("quick");
  expect(quick.scoreBasis).toBe("general");
  await step("ordinary", "Please explain a general concept clearly");
  expect(forwarded[1].model).toBe("fixture-beta");
  const ordinary = JSON.parse(
    (await $.command.run({ command: "apex", args: "why" })).text,
  );
  expect(ordinary.tier).toBe("everyday");
});
