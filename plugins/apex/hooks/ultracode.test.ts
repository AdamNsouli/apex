import { test, expect, mock } from "claude-code/testing";

const CRITICAL = "architect a complex security migration for production";
function harness($, on, ultracode: string, extra: Record<string, any> = {}) {
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      backend: "subscription",
      verifiedIds: [],
      mappings: [],
      taskOverride: null,
      ultracode,
    },
    ...extra,
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  const clock = mock.clock(on, { now: 2000000000000 });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.295" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  const commands: string[] = [];
  on("command.run", (_$, e) => {
    commands.push(e.command + " " + e.args);
    return { text: "ok" };
  });
  const entered: any[] = [];
  on("prompt.submit", (_$, e) => {
    entered.push({ text: e.text, origin: e.origin });
    return { text: e.text };
  });
  on("turn.complete", (_$, e) => ({ text: e.answer }));
  const start = async () => {
    await $.session.start({
      cwd: "/tmp/apex-ultracode-test",
      surface: "terminal",
      isInteractive: true,
    });
    await clock.advance(100);
  };
  const type = (text: string) =>
    $.prompt.submit({ text, wait: false, origin: { kind: "composer" } });
  const finish = () =>
    $.turn.complete({
      answer: "done",
      durationMs: 1,
      isAborted: false,
      turnId: "t",
      reason: "answer",
    });
  return { writes, clock, commands, entered, start, type, finish };
}

test("a critical task is held, sent with ultracode on, and ultracode is turned off when the turn ends", async ($, on) => {
  const h = harness($, on, "auto");
  await h.start();
  const held = await h.type(CRITICAL);
  expect(held.drop).toMatch(/ultracode/);
  expect(h.entered.length).toBe(0);
  await h.clock.advance(100);
  expect(h.commands).toEqual(["effort ultracode on"]);
  expect(h.entered.length).toBe(1);
  expect(h.entered[0].text).toBe(CRITICAL);
  expect(h.entered[0].origin.kind).toBe("plugin");
  expect(h.writes.ultracodeArmed).toBe(true);
  await h.finish();
  await h.clock.advance(100);
  expect(h.commands).toEqual(["effort ultracode on", "effort ultracode off"]);
  expect(h.writes.ultracodeArmed).toBe(false);
});

test("ordinary messages are never held, and nothing is held while the setting is off", async ($, on) => {
  const h = harness($, on, "auto");
  await h.start();
  const plain = await h.type("Please explain a general concept clearly");
  expect(plain.drop).toBeUndefined();
  await h.clock.advance(100);
  await h.finish();
  await h.clock.advance(100);
  expect(h.commands).toEqual([]);
  expect(h.entered.length).toBe(1);
});

test("with the setting off a critical task goes out as typed", async ($, on) => {
  const h = harness($, on, "off");
  await h.start();
  const sent = await h.type(CRITICAL);
  expect(sent.drop).toBeUndefined();
  await h.clock.advance(100);
  expect(h.commands).toEqual([]);
});

test("the ultracode command turns the setting on and off", async ($, on) => {
  const h = harness($, on, "off");
  await h.start();
  const onText = await $.command.run({
    command: "apex",
    args: "ultracode auto",
  });
  expect(onText.text).toMatch(/critical tasks only/);
  expect(h.writes.control.ultracode).toBe("auto");
  const status = await $.command.run({ command: "apex", args: "ultracode" });
  expect(status.text).toMatch(/APEX ultracode is auto/);
  await $.command.run({ command: "apex", args: "ultracode off" });
  expect(h.writes.control.ultracode).toBe("off");
});

test("a session that ended with ultracode on has it turned off at the next start", async ($, on) => {
  const h = harness($, on, "auto", { ultracodeArmed: true });
  await h.start();
  expect(h.commands).toEqual(["effort ultracode off"]);
  expect(h.writes.ultracodeArmed).toBe(false);
});
