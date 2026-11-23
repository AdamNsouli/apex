import { test, expect, mock } from "claude-code/testing";

function setup(on, stdout: string, isError = false) {
  mock.store(on, {});
  mock.env(on, { TMPDIR: "/tmp/apex-output-test/" });
  const clock = mock.clock(on, { now: 2000000000000 });
  on("session.version", () => ({ value: { version: "2.1.330" } }));
  on("settings.read", () => ({ value: {} }));
  on("session.authorize", () => ({ value: null }));
  on("command.register", () => ({ value: {} }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  const written: Record<string, string> = {};
  on("fs.write", (_$, e) => {
    written[e.path] = e.text;
    return { value: undefined };
  });
  on("tool.call", () =>
    isError
      ? { isError: true, result: stdout, text: stdout }
      : { result: { stdout, stderr: "", interrupted: false }, text: stdout },
  );
  return { clock, written };
}
const long = Array.from({ length: 3000 }, (_, i) => "row " + i).join("\n");

test("long unbounded Bash output reaches Claude trimmed, and is saved whole", async ($, on) => {
  const { clock, written } = setup(on, long);
  await $.session.start({
    cwd: "/tmp/apex-output-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  const r: any = await $.tool.call({
    tool: "Bash",
    command: "npm run build",
    tool_use_id: "b1",
  });
  const path = "/tmp/apex-output-test/apex-output/bash-b1.txt";
  expect(written[path]).toContain("row 1500");
  expect(r.result.stdout).toContain("row 0");
  expect(r.result.stdout).toContain("row 2999");
  expect(r.result.stdout).not.toContain("row 1500\n");
  expect(r.result.stdout).toContain(path);
  const out = (await $.command.run({ command: "apex", args: "output" })).text;
  expect(out).toContain("1 outputs trimmed");
});

test("a failed command and a bounded one pass through whole", async ($, on) => {
  const { clock } = setup(on, long, true);
  await $.session.start({
    cwd: "/tmp/apex-output-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  const r: any = await $.tool.call({
    tool: "Bash",
    command: "npm test",
    tool_use_id: "b2",
  });
  expect(r.isError).toBe(true);
  expect(String(r.text)).toContain("row 1500");
});

test("/apex output off leaves output alone", async ($, on) => {
  const { clock } = setup(on, long);
  await $.session.start({
    cwd: "/tmp/apex-output-test",
    surface: "terminal",
    isInteractive: true,
  });
  await clock.settle();
  await $.command.run({ command: "apex", args: "output off" });
  const r: any = await $.tool.call({
    tool: "Bash",
    command: "npm run build",
    tool_use_id: "b3",
  });
  expect(r.result.stdout).toContain("row 1500\n");
});
