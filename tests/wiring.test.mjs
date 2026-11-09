import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkWiring } from "../scripts/settings-wiring.mjs";
import { initialControl } from "../plugins/apex/core/router.mjs";

const read = (f) => readFile(new URL("../" + f, import.meta.url), "utf8");
const real = async () => ({
  router: await read("plugins/apex/core/router.mjs"),
  register: await read("plugins/apex/hooks/register.mjs"),
  app: await read("plugins/apex/web/app.js"),
  companion: await read("plugins/apex/companion/server.mjs"),
  defaults: initialControl(),
});

test("the real source has every setting wired where it is declared", async () => {
  assert.deepEqual(checkWiring(await real()), []);
});

test("a new setting in the change handler must be declared", async () => {
  const s = await real();
  s.router = s.router.replace(
    'else if (c.kind === "agents"',
    'else if (c.kind === "newthing" && true) next.newthing = c.value;\n  else if (c.kind === "agents"',
  );
  assert.match(
    checkWiring(s).join("\n"),
    /newthing: handled in core\/router.mjs but not declared/,
  );
});

test("a setting the web page posts but the companion refuses is caught", async () => {
  const s = await real();
  s.companion = s.companion.replace('"quality_once",', "");
  assert.match(
    checkWiring(s).join("\n"),
    /quality_once: companion list missing/,
  );
});

test("a setting missing from the web page or the command is caught", async () => {
  const s = await real();
  s.app = s.app.replaceAll('kind: "task"', 'kind: "tsk"');
  assert.match(checkWiring(s).join("\n"), /task: web control missing/);
  const t = await real();
  t.register = t.register.replaceAll('kind: "agents"', 'kind: "agnts"');
  assert.match(checkWiring(t).join("\n"), /agents: command missing/);
});

test("a missing default and a missing help entry are caught", async () => {
  const s = await real();
  const { ultracode, ...rest } = s.defaults;
  s.defaults = rest;
  s.register = s.register.replace("confirm-models;", "");
  const out = checkWiring(s).join("\n");
  assert.match(out, /ultracode: default "ultracode" missing/);
  assert.match(
    out,
    /availability: \/apex help text does not mention "confirm-models"/,
  );
});
