// Replay multi-step tasks, with failures part-way, and count the cost of model
// switches. replay.mjs routes each prompt once; real tasks run ~13 requests, and
// a model switch re-stores the whole conversation, which a single step hides.
// No model is called: prices and scores come from the saved catalogue.
//
//   node scripts/replay-sessions.mjs --prompts <file> --store <store> [--core <dir>] [--counts all|real]
//
// --counts all  : every tool error raises `failures` (0.11 behaviour)
// --counts real : only real failed checks do (this version); searches that find
//                 nothing and refusals are ignored.
// Scenarios per prompt: clean (no errors), benign (3 harmless errors), real (3 real
// failures). Failures arrive at steps 3, 5 and 7 of 14.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const STEPS = 14;
const GROWTH = 6000;
const AT = [3, 5, 7];
const SCENARIOS = {
  clean: { benign: 0, real: 0 },
  benign: { benign: 3, real: 0 },
  real: { benign: 0, real: 3 },
};
const keyOf = (p) => p.model + "|" + (p.effort ?? "default");

async function loadCore(dir) {
  const url = (f) => pathToFileURL(path.join(dir, f)).href;
  const [router, catalogue] = await Promise.all([
    import(url("router.mjs")),
    import(url("catalogue.mjs")),
  ]);
  return { ...router, ...catalogue };
}

export function simulate({
  core,
  prompts,
  models,
  fetchedAt,
  mode,
  start,
  counts,
}) {
  const control = {
    ...core.initialControl(),
    mode,
    backend: "subscription",
    ultracode: "off",
  };
  const byKey = new Map(
    models
      .filter((m) => m.routable)
      .map((m) => [keyOf({ model: m.runtimeId, effort: m.effort }), m]),
  );
  const startRec = byKey.get(keyOf(start));
  const out = {};
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    const agg = { usd: 0, startUsd: 0, switches: 0, steps: 0, topSteps: 0 };
    for (const p of prompts) {
      let intent = core.classifyIntent(p.text, null);
      let lastModel = null,
        lastEffort,
        stepsOnModel = 2,
        cacheModel = start.model,
        errors = 0,
        counted = 0;
      for (let step = 1; step <= STEPS; step++) {
        const k = AT.indexOf(step);
        if (k >= 0 && k < sc.benign + sc.real) {
          errors++;
          if (counts === "all" || sc.real > 0) counted++;
        }
        intent = { ...intent, failures: counted };
        const ctx =
          (Number.isFinite(p.context) ? p.context : 50000) + step * GROWTH;
        const d = core.route({
          original: start,
          control,
          intent,
          models,
          fetchedAt,
          now: fetchedAt + 3600000,
          inputTokens: ctx,
          lastModel,
          lastEffort,
          stepsOnModel,
        });
        const pick = byKey.get(keyOf(d.pair)) ?? startRec;
        if (lastModel === d.pair.model) stepsOnModel++;
        else stepsOnModel = 1;
        lastModel = d.pair.model;
        lastEffort = d.pair.effort;
        const switched = pick.runtimeId !== cacheModel;
        if (switched && step > 1) agg.switches++;
        const price = (r, sw) =>
          (ctx *
            (sw
              ? (r.evidence.prices?.cacheWrite ?? 0)
              : (r.evidence.prices?.cacheRead ?? 0))) /
            1e6 +
          (r.evidence.benchmarkCostPerTask ?? 0) / STEPS;
        agg.usd += price(pick, switched);
        agg.startUsd += price(startRec, false);
        agg.steps++;
        if (
          pick.runtimeId.includes("opus") &&
          ["xhigh", "max"].includes(pick.effort)
        )
          agg.topSteps++;
        cacheModel = pick.runtimeId;
      }
    }
    out[name] = agg;
  }
  return out;
}

const pct = (x) => (x * 100).toFixed(0).padStart(4) + "%";
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const arg = (n, f) => {
    const i = process.argv.indexOf("--" + n);
    return i > 0 ? process.argv[i + 1] : f;
  };
  const prompts = JSON.parse(await readFile(arg("prompts"), "utf8")).prompts;
  const store = JSON.parse(await readFile(arg("store"), "utf8"));
  const core = await loadCore(
    path.resolve(arg("core", path.join(here, "../plugins/apex/core"))),
  );
  const models = core.joinCatalogue(
    store.catalogue.runtime,
    store.catalogue.aa.models,
    store.control.mappings,
    store.control.verifiedIds,
  );
  const fetchedAt = store.catalogue.aa.fetchedAt;
  const counts = arg("counts", "real");
  const start = { model: "claude-opus-5-5", effort: "high" };
  console.log(
    `counts=${counts}  start=${keyOf(start)}  ${prompts.length} prompts x ${STEPS} steps`,
  );
  console.log(
    "mode      scenario  cost vs staying  switches/prompt  opus xhigh|max steps",
  );
  for (const mode of ["save", "balanced", "best"]) {
    const r = simulate({
      core,
      prompts,
      models,
      fetchedAt,
      mode,
      start,
      counts,
    });
    for (const [name, a] of Object.entries(r))
      console.log(
        mode.padEnd(9),
        name.padEnd(9),
        pct(a.usd / a.startUsd).padStart(14),
        (a.switches / prompts.length).toFixed(2).padStart(15),
        pct(a.topSteps / a.steps).padStart(18),
      );
  }
}
