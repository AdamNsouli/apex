import { test, expect, mock } from "claude-code/testing";

// The rail draws its numbers as native charts: plan-usage gauges, a stacked bar
// of the model mix, a column per request, and bars for the pick against your
// own setting and the candidates. Shown here with the labelled demo data.
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
const paneProps = (width) => ({
  title: "APEX",
  isFocused: true,
  bodyColumns: width,
  placement: "inline" as const,
});

test("the rail shows usage gauges, the model mix and a column per request", async ($, on) => {
  const clock = setup(on);
  await $.session.start({
    cwd: "/tmp/apex-charts-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  await $.command.run({ command: "apex", args: "demo" });
  for (const surface of ["terminal", "desktop"] as const)
    for (const width of [44, 72, 120]) {
      const ui = await $.ui.mount({
        plugin: "apex",
        surface,
        component: "Pane",
        requestId: "apex",
        props: paneProps(width),
      });
      expect(await ui.find({ type: "Text", text: /PLAN USAGE/ })).toBeDefined();
      expect(await ui.find({ type: "Text", text: "5-hour" })).toBeDefined();
      expect(
        await ui.find({
          type: "Text",
          text: /resets in 2 h · leans to Save at 80%/,
        }),
      ).toBeDefined();
      expect(
        await ui.find({ type: "Text", text: /MODELS IN THIS CHAT/ }),
      ).toBeDefined();
      // 8 demo requests: 3 Sonnet, 2 Haiku, 3 Opus.
      expect(
        await ui.find({ type: "Text", text: "Sonnet 5.5 38% (3)" }),
      ).toBeDefined();
      expect(
        await ui.find({ type: "Text", text: "Haiku 5.5 25% (2)" }),
      ).toBeDefined();
      expect(
        await ui.find({ type: "Text", text: /RECENT REQUESTS/ }),
      ).toBeDefined();
      expect(
        await ui.find({
          type: "Text",
          text: /colour = model · height = effort/,
        }),
      ).toBeDefined();
      // The tallest column (Opus xhigh, 7/8 of the height) reaches the top row.
      expect(await ui.find({ type: "Text", text: "▄ " })).toBeDefined();
      await ui.unmount();
    }
});

test("the inspector compares the pick with your setting and charts the candidates", async ($, on) => {
  const clock = setup(on);
  await $.session.start({
    cwd: "/tmp/apex-charts-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  await $.command.run({ command: "apex", args: "demo" });
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "Pane",
    requestId: "apex",
    props: paneProps(80),
  });
  await ui.press({ key: "inspect" });
  expect(
    await ui.find({ type: "Text", text: /THIS PICK VS YOUR SETTING/ }),
  ).toBeDefined();
  expect(await ui.find({ type: "Text", text: /◆ APEX pick/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /Your setting/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /CANDIDATES/ })).toBeDefined();
  // The chosen pair (the last demo pick, Sonnet medium) is the marked bar.
  expect(
    await ui.find({ type: "Text", text: /◆ Sonnet 5\.5 Medium/ }),
  ).toBeDefined();
  await ui.unmount();
});

test("with no requests and no plan reading the rail draws no empty charts", async ($, on) => {
  const clock = setup(on);
  await $.session.start({
    cwd: "/tmp/apex-charts-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  const ui = await $.ui.mount({
    plugin: "apex",
    surface: "terminal",
    component: "Pane",
    requestId: "apex",
    props: paneProps(72),
  });
  expect(await ui.find({ type: "Text", text: /PLAN USAGE/ })).toBeUndefined();
  expect(
    await ui.find({ type: "Text", text: /MODELS IN THIS CHAT/ }),
  ).toBeUndefined();
  await ui.unmount();
});
