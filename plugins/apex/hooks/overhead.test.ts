import { test, expect, mock } from "claude-code/testing";

// /apex overhead reports the chat's fixed load from the host's own breakdown, and
// a host that gives no breakdown reads as "no reading", not an error.
const breakdown = {
  totalTokens: 50000,
  percentage: 25,
  categories: [
    { name: "System prompt", tokens: 3000, kind: "used", isDeferred: false },
    { name: "Memory files", tokens: 6000, kind: "used", isDeferred: false },
    { name: "Messages", tokens: 20000, kind: "used", isDeferred: false },
  ],
  mcpTools: [{ name: "t", serverName: "heavy", tokens: 4200, isLoaded: true }],
  memoryFiles: [{ path: "/p/CLAUDE.md", type: "Project", tokens: 5000 }],
  agents: [],
};

async function setup($, on, usage) {
  const NOW = 2000000000000;
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
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  const clock = mock.clock(on, { now: NOW });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.317" } }));
  on("settings.read", () => ({ value: {} }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.authorize", () => ({ value: null }));
  on("session.usage", () => ({ value: usage }));
  await $.session.start({
    cwd: "/tmp/apex-overhead-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
}

test("/apex overhead names the fixed load, the heavy server and the memory file", async ($, on) => {
  await setup($, on, {
    context: { window: 200000, tokens: 50000, breakdown },
    rateLimits: [],
  });
  const out = (await $.command.run({ command: "apex", args: "overhead" })).text;
  expect(out).toContain("about 9000 tokens");
  expect(out).toContain("heavy 4200");
  expect(out).toContain("CLAUDE.md 5000");
  expect(out).toContain("Worth a look");
  expect(out).not.toContain("/p/");
});

test("/apex overhead with no breakdown says there is no reading yet", async ($, on) => {
  await setup($, on, {
    context: { window: 200000, tokens: 10 },
    rateLimits: [],
  });
  const out = (await $.command.run({ command: "apex", args: "overhead" })).text;
  expect(out).toContain("No context breakdown yet");
});
