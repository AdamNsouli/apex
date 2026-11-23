import { test, expect, mock } from "claude-code/testing";

// The strip and rail read plainly: model names, plan usage, why the last pick,
// and what APEX did in this chat. The demo is labelled and removable.
function setup(on) {
  mock.store(on, {});
  mock.env(on, {});
  const clock = mock.clock(on, { now: 2000000000000 });
  on("session.version", () => ({ value: { version: "2.1.330" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("ui.render", { component: "AbovePrompt" }, async ($, e) =>
    $.ui.resolve(e).Text({ children: "" }),
  );
  return clock;
}
const strip = (bodyColumns) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
});

test("demo fills the strip with labelled sample data, and off removes it", async ($, on) => {
  const clock = setup(on);
  await $.session.start({
    cwd: "/tmp/apex-strip-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  const out = (await $.command.run({ command: "apex", args: "demo" })).text;
  expect(out).toContain("Nothing was sent");
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "AbovePrompt",
    props: strip(120),
  });
  expect(
    await ui.find({ type: "Text", text: /Sonnet 5\.5 \/ Medium/ }),
  ).toBeDefined();
  expect(
    await ui.find({ type: "Text", text: /5h 82% · week 41% · near limit/ }),
  ).toBeDefined();
  expect(
    await ui.find({
      type: "Text",
      text: /Demo data · Everyday task · best value/,
    }),
  ).toBeDefined();
  expect(
    await ui.find({
      type: "Text",
      text: /2 model switches · 2 outputs trimmed · 1 subagent hint/,
    }),
  ).toBeDefined();
  await ui.redraw(strip(64));
  expect(await ui.find({ type: "Text", text: "5h 82%" })).toBeDefined();
  await $.command.run({ command: "apex", args: "demo off" });
  await ui.redraw(strip(120));
  expect(await ui.find({ type: "Text", text: /Demo data/ })).toBeUndefined();
});
