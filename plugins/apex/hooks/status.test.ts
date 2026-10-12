import { test, expect, mock } from "claude-code/testing";
import { VERSION } from "../core/presentation.mjs";

// Bare /apex used to open the panel and print nothing, so in a chat where the
// panel is not visible the command looked dead and nothing showed the version.
test("bare /apex opens the panel and prints the version and routing status; doctor carries the version", async ($, on) => {
  const NOW = 2000000000000;
  const writes: Record<string, any> = {
    control: {
      revision: 0,
      mode: "balanced",
      routing: "auto",
      backend: "subscription",
      verifiedIds: ["m1"],
      mappings: [],
      taskOverride: null,
    },
    catalogue: {
      runtime: [
        {
          id: "m1",
          name: "M1",
          line: null,
          efforts: ["high"],
          effortSupported: true,
          context: 100000,
          outputCap: 1000,
          capabilities: {},
          thinking: null,
        },
      ],
      aa: {
        fetchedAt: NOW - 3 * 3600000,
        models: [
          {
            id: "m1-high",
            slug: "m1-high",
            name: "M1 (High)",
            effort: "high",
            benchmarkVersion: "synthetic",
            scores: { general: 50 },
            prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
            benchmarkCostPerTask: 0.5,
            latencyMs: 1000,
          },
        ],
      },
      lastRefresh: NOW - 3600000,
      lastAARefresh: NOW - 3 * 3600000,
    },
  };
  on("store.get", (_$, e) => ({ value: writes[e.key] }));
  on("store.set", (_$, e) => {
    writes[e.key] = e.value;
    return { value: undefined };
  });
  const clock = mock.clock(on, { now: NOW });
  mock.env(on, {});
  on("session.version", () => ({ value: { version: "2.1.292" } }));
  on("settings.read", () => ({ value: {} }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.authorize", () => ({ value: null }));
  const opened: string[] = [];
  on("ui.open", (_$, e) => {
    opened.push(e.id);
    return { value: undefined };
  });
  await $.session.start({
    cwd: "/tmp/apex-status-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();

  const bare = await $.command.run({ command: "apex", args: "" });
  expect(opened).toEqual(["apex"]);
  expect(bare.text).toContain("APEX " + VERSION);
  expect(bare.text).toContain("mode balanced");
  expect(bare.text).toContain("routing auto");
  expect(bare.text).toContain("1 of 1 model/effort pairs routable");
  expect(bare.text).toContain("benchmark data 3h old");
  expect(bare.text).not.toContain("refresh failed");

  const doctor = JSON.parse(
    (await $.command.run({ command: "apex", args: "doctor" })).text,
  );
  expect(doctor.version).toBe(VERSION);
});
