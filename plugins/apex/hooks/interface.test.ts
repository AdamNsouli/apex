import { test, expect, mock } from "claude-code/testing";

function setup(on, display = {}, writes = null) {
  if (writes) {
    writes.display = display;
    on("store.get", (_$, e) => ({ value: writes[e.key] }));
    on("store.set", (_$, e) => {
      writes[e.key] = e.value;
      return { value: undefined };
    });
  } else mock.store(on, { display });
  mock.env(on, {});
  mock.clock(on, { now: 2000000000000 });
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
}
async function startSession($) {
  await $.session.start({
    cwd: "/tmp/apex-interface-test",
    surface: "terminal",
    isInteractive: true,
  });
}
const paneProps = (width = 72) => ({
  title: "APEX",
  isFocused: true,
  bodyColumns: width,
  placement: "inline" as const,
});
const dockProps = (width = 72) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: width,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
});

test("prompt dock preserves downstream UI, opens inspector and yields to surveys", async ($, on) => {
  setup(on);
  on("ui.render", { component: "AbovePrompt" }, async ($, e) => {
    return $.ui.resolve(e).Text({ children: "Another mod's controls" });
  });
  let opened;
  on("ui.open", (_$, e) => {
    opened = e;
    return { value: {} };
  });
  await startSession($);
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "AbovePrompt",
    props: dockProps(),
  });
  expect(
    await ui.find({ type: "Text", text: "Another mod's controls" }),
  ).toBeDefined();
  await ui.press({ key: "mode-toggle" });
  const sports = await ui.find({ key: "mode-sports" });
  expect(sports).toBeDefined();
  await ui.press({ key: "mode-sports" });
  expect(await ui.find({ type: "Text", text: /Sports saved/ })).toBeDefined();
  await ui.press({ key: "dock-inspect" });
  expect(opened.id).toBe("apex");
  expect(opened.columns).toBe(34);
  expect(opened.focus).toBeUndefined();
  await ui.redraw({ ...dockProps(), hasSurvey: true });
  expect(await ui.find({ key: "dock-inspect" })).toBeUndefined();
  expect(
    await ui.find({ type: "Text", text: "Another mod's controls" }),
  ).toBeDefined();
  await ui.unmount();
});

test("native controls validate credit budget, persist dock preference and save real routing setup", async ($, on) => {
  const writes = {};
  setup(on, {}, writes);
  await startSession($);
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "Pane",
    requestId: "apex",
    props: paneProps(36),
  });
  await ui.press({ key: "settings" });
  await ui.press({ key: "credits" });
  await ui.input({ key: "credit-budget", text: "invalid" });
  expect(await ui.find({ type: "Text", text: /positive USD/ })).toBeDefined();
  expect(writes.control).toBeUndefined();
  await ui.input({ key: "credit-budget", text: "2.50", kind: "change" });
  await ui.press({ key: "credits-allow" });
  let saved = writes.control;
  expect(saved.creditsConsent).toBe(true);
  expect(saved.budgetUsd).toBe(2.5);
  await ui.press({ key: "credits-revoke" });
  saved = writes.control;
  expect(saved.creditsConsent).toBe(false);
  await ui.press({ key: "back-compact" });
  await ui.press({ key: "settings" });
  await ui.press({ key: "dock-compact" });
  expect(writes.display).toEqual({ dock: "compact" });
  await ui.input({ key: "available-models", text: "model-new" });
  expect(await ui.find({ type: "Text", text: /backend first/ })).toBeDefined();
  await ui.select({ key: "backend", value: "subscription" });
  await ui.input({ key: "available-models", text: "model-new model-next" });
  saved = writes.control;
  expect(saved.verifiedIds).toEqual(["model-new", "model-next"]);
  expect(saved.backend).toBe("subscription");
  await ui.input({ key: "mapping", text: "model-new aa-new high" });
  saved = writes.control;
  expect(saved.mappings[0]).toEqual({
    runtimeId: "model-new",
    aaSlug: "aa-new",
    effort: "high",
  });
  await ui.select({ key: "task", value: "agentic_coding" });
  expect(writes.control.taskOverride).toBe("agentic_coding");
  await ui.unmount();
});

test("native terminal and desktop panes mount compact, inspector, settings and evidence at narrow and wide widths", async ($, on) => {
  setup(on);
  await startSession($);
  for (const surface of ["terminal", "desktop"] as const) {
    for (const width of [32, 48, 80, 120]) {
      const ui = await $.ui.mount({
        plugin: "apex",
        surface,
        component: "Pane",
        requestId: "apex",
        props: paneProps(width),
      });
      await ui.press({ key: "mode-toggle" });
      expect(await ui.find({ key: "mode-sports" })).toBeDefined();
      await ui.press({ key: "mode-sports" });
      await ui.press({ key: "inspect" });
      expect((await ui.drawn()).type).toBe("Box");
      await ui.press({ key: "settings" });
      expect(await ui.find({ key: "backend" })).toBeDefined();
      await ui.press({ key: "evidence" });
      expect((await ui.drawn()).type).toBe("Box");
      await ui.press({ key: "back-compact" });
      await ui.unmount();
    }
  }
});

test("dock hiding and compact layout remain recoverable through slash command", async ($, on) => {
  setup(on, { dock: "hidden" });
  on("ui.render", { component: "AbovePrompt" }, async ($, e) =>
    $.ui.resolve(e).Box({ children: [] }),
  );
  await startSession($);
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "AbovePrompt",
    props: dockProps(32),
  });
  expect(await ui.find({ key: "dock-inspect" })).toBeUndefined();
  await $.command.run({ command: "apex", args: "dock compact" });
  expect(await ui.find({ key: "dock-inspect" })).toBeDefined();
  expect(await ui.find({ key: "mode-sports" })).toBeUndefined();
  await $.command.run({ command: "apex", args: "dock expanded" });
  expect(await ui.find({ key: "mode-toggle" })).toBeDefined();
  await ui.press({ key: "mode-toggle" });
  expect(await ui.find({ key: "mode-sports" })).toBeDefined();
  await ui.unmount();
});
