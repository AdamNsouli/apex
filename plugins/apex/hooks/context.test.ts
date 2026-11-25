import { test, expect, mock } from "claude-code/testing";

// After a main turn ends over the threshold, the strip offers to compact; the
// button compacts with APEX's keep-list, and "off" stops the offers.
function setup(on, usage: { tokens: number }, agents: any[] = []) {
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      main: "auto",
      backend: "subscription",
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
  mock.env(on, {});
  const clock = mock.clock(on, { now: 2000000000000 });
  on("session.version", () => ({ value: { version: "2.1.330" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.usage", () => ({
    value: {
      context: { window: 1000000, tokens: usage.tokens },
      rateLimits: [],
    },
  }));
  on("agent.list", () => ({ value: agents }));
  const compacted: any[] = [];
  on("session.compact", (_$, e) => {
    compacted.push(e);
    return { messages: [{ role: "user", text: "summary", toolUses: [] }] };
  });
  on("turn.complete", (_$, e) => ({ text: e.answer }));
  // Older engines need something beneath the strip to mount it.
  on("ui.render", { component: "AbovePrompt" }, async ($, e) =>
    $.ui.resolve(e).Text({ children: "" }),
  );
  return { clock, compacted };
}
const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
};
const endTurn = ($) =>
  $.turn.complete({
    answer: "done",
    durationMs: 10,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
  });
async function start($, clock) {
  await $.session.start({
    cwd: "/tmp/apex-context-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
}

test("a long chat gets one compact offer, and the button compacts with the keep-list", async ($, on) => {
  const usage = { tokens: 120000 };
  const { clock, compacted } = setup(on, usage);
  await start($, clock);
  await endTurn($);
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "AbovePrompt",
    props,
  });
  expect(await ui.find({ key: "context-compact" })).toBeUndefined();
  usage.tokens = 260000;
  await endTurn($);
  await ui.redraw(props);
  expect(
    await ui.find({ type: "Text", text: /260k tokens on every request/ }),
  ).toBeDefined();
  await ui.press({ key: "context-compact" });
  expect(compacted.length).toBe(1);
  expect(compacted[0].instructions).toContain("every file created or changed");
  expect(await ui.find({ key: "context-compact" })).toBeUndefined();
});

test("no offer while an agent is still running", async ($, on) => {
  const { clock } = setup(on, { tokens: 400000 }, [
    { id: "a", status: "running", type: "Explore", description: "" },
  ]);
  await start($, clock);
  await endTurn($);
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "AbovePrompt",
    props,
  });
  expect(await ui.find({ key: "context-compact" })).toBeUndefined();
});

test("/apex context off stops the offers and 150k changes the threshold", async ($, on) => {
  const usage = { tokens: 170000 };
  const { clock } = setup(on, usage);
  await start($, clock);
  const set = (await $.command.run({ command: "apex", args: "context 150k" }))
    .text;
  expect(set).toContain("above 150k");
  await endTurn($);
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "AbovePrompt",
    props,
  });
  expect(await ui.find({ key: "context-compact" })).toBeDefined();
  await ui.press({ key: "context-dismiss" });
  expect(await ui.find({ key: "context-compact" })).toBeUndefined();
  const off = (await $.command.run({ command: "apex", args: "context off" }))
    .text;
  expect(off).toContain("offers are off");
  usage.tokens = 600000;
  await endTurn($);
  await ui.redraw(props);
  expect(await ui.find({ key: "context-compact" })).toBeUndefined();
});
