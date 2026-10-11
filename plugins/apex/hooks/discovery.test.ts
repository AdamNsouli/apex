import { test, expect, mock } from "claude-code/testing";

const body = JSON.stringify({
  data: [
    {
      id: "m1",
      display_name: "M1",
      max_input_tokens: 100000,
      max_tokens: 1000,
      capabilities: { effort: { supported: true, high: { supported: true } } },
    },
  ],
  has_more: false,
});
function harness($, on) {
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      backend: "subscription",
      verifiedIds: [],
      mappings: [],
      taskOverride: null,
    },
    catalogue: { runtime: [], aa: null, lastRefresh: 0, lastAARefresh: 0 },
  };
  const state = { credential: null as any, status: 200, calls: 0 };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  const clock = mock.clock(on, { now: 2000000000000 });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.authorize", () => ({ value: state.credential }));
  on("http.fetch", () => {
    state.calls++;
    return {
      value: {
        status: state.status,
        ok: state.status === 200,
        headers: {},
        text: state.status === 200 ? body : "",
      },
    };
  });
  return {
    writes,
    state,
    clock,
    start: async () => {
      await $.session.start({
        cwd: "/tmp/apex-discovery-test",
        surface: "terminal",
        isInteractive: true,
      });
      await clock.settle();
    },
  };
}
test("model discovery without a login does not start the 24-hour wait", async ($, on) => {
  const h = harness($, on);
  await h.start();
  // No credential: nothing was asked and nothing was recorded as discovered.
  expect(h.state.calls).toBe(0);
  expect(h.writes.catalogue.lastRefresh).toBe(0);
  // A session with a login appears: the next ten-minute check finds the models.
  h.state.credential = { handle: "h", kind: "bearer" };
  await h.clock.advance(600000);
  expect(h.state.calls).toBe(1);
  expect(h.writes.catalogue.runtime.map((m: any) => m.id)).toEqual(["m1"]);
  expect(h.writes.catalogue.lastRefresh).toBe(2000000600000);
  // A successful discovery does start the wait.
  await h.clock.advance(600000 * 6);
  expect(h.state.calls).toBe(1);
});
test("a failed model discovery retries within the hour instead of waiting a day", async ($, on) => {
  const h = harness($, on);
  h.state.credential = { handle: "h", kind: "bearer" };
  h.state.status = 500;
  await h.start();
  expect(h.state.calls).toBe(1);
  expect(h.writes.catalogue.lastRefresh).toBe(0);
  // Not hammered: the next ten-minute check leaves it alone.
  await h.clock.advance(600000);
  expect(h.state.calls).toBe(1);
  // An hour after the failure it tries again and succeeds.
  h.state.status = 200;
  await h.clock.advance(3000000);
  expect(h.state.calls).toBe(2);
  expect(h.writes.catalogue.runtime.map((m: any) => m.id)).toEqual(["m1"]);
  expect(h.writes.catalogue.lastRefresh).toBe(2000000000000 + 3600000);
});
test("a session that cannot discover leaves a newer saved catalogue untouched", async ($, on) => {
  const h = harness($, on);
  await h.start();
  // Another session discovered models after this one loaded its copy.
  const newer = {
    runtime: [{ id: "m1" }],
    aa: null,
    lastRefresh: 2000000000000,
    lastAARefresh: 0,
  };
  h.writes.catalogue = newer;
  await h.clock.advance(600000);
  expect(h.writes.catalogue).toBe(newer);
});
test("benchmark data without discovered models still shows a refresh as eligible", async ($, on) => {
  const h = harness($, on);
  h.writes.catalogue = {
    runtime: [],
    aa: { models: [], fetchedAt: 2000000000000 - 3600000 },
    lastRefresh: 0,
    lastAARefresh: 2000000000000 - 3600000,
  };
  await h.start();
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
  await ui.press({ key: "settings" });
  expect(
    await ui.find({ type: "Text", text: /Next refresh eligible now/ }),
  ).toBeDefined();
  await ui.unmount();
});
