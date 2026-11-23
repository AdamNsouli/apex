import { test, expect, mock } from "claude-code/testing";

test("Anthropic guidance is available through the native command without authorizing a model or inference", async ($, on) => {
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      backend: "subscription",
      verifiedIds: ["claude-haiku-5-5"],
      mappings: [],
      taskOverride: null,
    },
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  const clock = mock.clock(on, { now: Date.parse("2026-11-23T12:00:00Z") });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.325" } }));
  on("settings.read", () => ({ value: {} }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.authorize", () => ({ value: null }));
  on("session.usage", () => ({
    value: { context: { tokens: 1000, window: 1000000 }, rateLimits: [] },
  }));
  await $.session.start({
    cwd: "/tmp/apex-guidance-fixture",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  const before = JSON.stringify(writes.control);
  const result = (
    await $.command.run({ command: "apex", args: "guidance claude-opus-5-5" })
  ).text;
  expect(result).toContain("API default medium");
  expect(result).toContain("User-confirmed: no");
  expect(result).toContain("per_turn_effort");
  expect(result).toContain("platform.claude.com");
  expect(JSON.stringify(writes.control)).toBe(before);
  const doctor = JSON.parse(
    (await $.command.run({ command: "apex", args: "doctor" })).text,
  );
  expect(doctor.guidance.reviewedAt).toBe("2026-11-23");
  expect(doctor.guidance.stale).toBe(false);
});
