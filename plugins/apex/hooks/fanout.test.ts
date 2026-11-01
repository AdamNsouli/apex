import { test, expect, mock } from "claude-code/testing";

// In Max Speed and Max Power + Speed APEX attaches a note the model reads beside a
// fresh prompt (prompt.submit `context`), asking it to fan work out to subagents.
const CRITICAL = "architect a complex security migration for production";
const ORDINARY = "Please explain a general concept clearly";
function harness(
  $,
  on,
  mode: string,
  extra: Record<string, any> = {},
  ultracode = "auto",
  agents = "auto",
) {
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode,
      routing: "auto",
      backend: "subscription",
      verifiedIds: [],
      mappings: [],
      taskOverride: null,
      ultracode,
      agents,
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
    entered.push({ text: e.text, origin: e.origin, context: e.context });
    return { text: e.text };
  });
  on("turn.complete", (_$, e) => ({ text: e.answer }));
  const start = async () => {
    await $.session.start({
      cwd: "/tmp/apex-fanout-test",
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

test("Max Speed attaches the parallel-subagents note to a fresh composer prompt", async ($, on) => {
  const h = harness($, on, "max_speed");
  await h.start();
  const r = await h.type(ORDINARY);
  expect(r.drop).toBeUndefined();
  expect(h.entered.length).toBe(1);
  expect(h.entered[0].text).toBe(ORDINARY);
  expect(h.entered[0].context?.length).toBe(1);
  expect(h.entered[0].context[0]).toMatch(
    /^APEX Max Speed: split independent parts of this task across parallel subagents/,
  );
  // A continuation of the same task gets no second note.
  await h.finish();
  await h.type("yes");
  expect(h.entered[1].context ?? []).toEqual([]);
});

test("Max Power + Speed: a hard task goes to ultracode, which is the fan-out; no note on the resubmit", async ($, on) => {
  const h = harness($, on, "max_power_speed");
  await h.start();
  const held = await h.type(CRITICAL);
  expect(held.drop).toMatch(/ultracode/);
  await h.clock.advance(100);
  expect(h.commands).toEqual(["effort ultracode on"]);
  expect(h.entered.length).toBe(1);
  expect(h.entered[0].origin.kind).toBe("plugin");
  expect(h.entered[0].context ?? []).toEqual([]);
});

test("Max Power + Speed names itself in the note; Balanced attaches none", async ($, on) => {
  const s = harness($, on, "max_power_speed");
  await s.start();
  await s.type(ORDINARY);
  expect(s.entered[0].context?.[0]).toMatch(/^APEX Max Power \+ Speed:/);
});

test("Balanced attaches no note", async ($, on) => {
  const h = harness($, on, "balanced");
  await h.start();
  await h.type(ORDINARY);
  expect(h.entered[0].context ?? []).toEqual([]);
});

test("with agent routing off the speed modes attach no note", async ($, on) => {
  const h = harness($, on, "max_speed", {}, "auto", "off");
  await h.start();
  await h.type(ORDINARY);
  expect(h.entered[0].context ?? []).toEqual([]);
});
