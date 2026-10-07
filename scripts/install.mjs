import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const cli = process.env.APEX_CLAUDE || "claude";
const version = spawnSync(cli, ["--version"], { encoding: "utf8" });
const match = version.stdout?.match(/(\d+)\.(\d+)\.(\d+)/);
if (version.status !== 0 || !match)
  throw new Error(
    "Claude CLI unavailable. Install or update from the official Claude Code documentation.",
  );
const v = match.slice(1).map(Number),
  min = [2, 1, 292];

for (let i = 0; i < 3; i++) {
  if (v[i] > min[i]) {
    break;
  }
  if (v[i] < min[i])
    throw new Error(
      "APEX requires Claude Code 2.1.292+. This installer does not update global installations.",
    );
}
if (Number(process.versions.node.split(".")[0]) < 22)
  throw new Error("APEX dashboard requires Node 22+.");
const repo = process.argv.includes("--local")
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  : "AdamNsouli/apex";
for (const args of [
  ["plugin", "marketplace", "add", repo],
  ["plugin", "install", "apex@apex-tools", "--scope", "user"],
]) {
  const r = spawnSync(cli, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log(
  "Installed. Reload/restart Claude, open /apex, then /apex doctor. Read INSTALL.md for AA evidence and account setup. No paid inference or billing changes were performed.",
);
