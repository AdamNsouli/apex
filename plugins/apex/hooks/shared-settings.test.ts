import { test, expect, mock } from "claude-code/testing";
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
