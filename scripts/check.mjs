import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (
      [".git", "node_modules", "test-results", "playwright-report"].includes(
        e.name,
      )
    )
      continue;
    const p = path.join(dir, e.name);
    if (
      path.relative(root, p).replaceAll(path.sep, "/") ===
        "plugins/apex/.claude-plugin/types" ||
      path.relative(root, p).replaceAll(path.sep, "/") ===
        "plugins/apex/tsconfig.json"
    )
      continue;
    if (e.isDirectory()) await walk(p);
    else files.push(p);
  }
}
await walk(root);
const manifest = JSON.parse(
  await readFile(path.join(root, "plugins/apex/.claude-plugin/plugin.json")),
);
const market = JSON.parse(
  await readFile(path.join(root, ".claude-plugin/marketplace.json")),
);
const pkg = JSON.parse(await readFile(path.join(root, "package.json")));
assert.equal(manifest.name, "apex");
assert.equal(market.name, "apex-tools");
assert.equal(manifest.version, pkg.version);
const { VERSION } = await import("../plugins/apex/core/presentation.mjs");
assert.equal(VERSION, pkg.version);
assert.equal(market.plugins[0].version, pkg.version);
assert.deepEqual(
  JSON.parse(await readFile(path.join(root, "plugins/apex/hooks/hooks.json")))
    .modules,
  ["./register.mjs"],
);
for (const p of files) {
  const rel = path.relative(root, p);
  if (/\.(mjs|cjs|js)$/.test(p) && !rel.startsWith("docs/design-pack/")) {
    const result = spawnSync(process.execPath, ["--check", p], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, rel + ": " + result.stderr);
  }
  if (/\.(md|json|mjs|cjs|js|html|css|svg|yml)$/.test(p)) {
    const text = await readFile(p, "utf8");
    assert.ok(
      !/\/Users\/[^/]+\/AdamOS|ghp_[A-Za-z0-9]{25,}|sk-ant-[A-Za-z0-9_-]{20,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY/.test(
        text,
      ),
      "private material: " + rel,
    );
    if (/\.json$/.test(p)) JSON.parse(text);
  }
}
console.log(
  `Checked ${files.length} public files: executable syntax, JSON, manifest/version agreement and private-material patterns. This is a hygiene check, not a security audit.`,
);
