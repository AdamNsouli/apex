// Replay labelled prompts through the router offline and score its picks.
// No model is called: every number comes from the saved benchmark catalogue.
//
//   node scripts/replay.mjs --prompts <file> --store <apex store file> [--core <dir>] [--json]
//
// The prompts file is { prompts: [{ chat, turn, text, context, need, importance }] },
// where `need` is the lowest tier (quick|everyday|hard|critical|best) that would
// answer the prompt well and `importance` is 1-5. Real prompts stay on your own
// machine; `tests/fixtures/replay-prompts.example.json` shows the shape.
// `--core` points at another copy's `plugins/apex/core` to compare two versions.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MODES = ["eco", "balanced", "sports", "quality"];
const NEED_SHARE = {
  quick: 0.7,
  everyday: 0.88,
  hard: 0.92,
  critical: 0.97,
  best: 1,
};

async function loadCore(dir) {
  const url = (f) => pathToFileURL(path.join(dir, f)).href;
  const [router, catalogue] = await Promise.all([
    import(url("router.mjs")),
    import(url("catalogue.mjs")),
  ]);
  return { ...router, ...catalogue };
}

const keyOf = (p) => p.model + "|" + (p.effort ?? "default");

// One replay: every chat in order, one routing decision per prompt.
export function replayRun({ core, prompts, models, fetchedAt, mode, start }) {
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
  const best = Math.max(
    ...[...byKey.values()].map((m) => m.evidence.scores.general),
  );
  const startRec = byKey.get(keyOf(start));
  if (!startRec) throw new Error("start pair not routable: " + keyOf(start));
  const chats = new Map();
  for (const p of prompts) {
    if (!chats.has(p.chat)) chats.set(p.chat, []);
    chats.get(p.chat).push(p);
  }
  const rows = [];
  for (const list of chats.values()) {
    list.sort((a, b) => a.turn - b.turn);
    let intent = null,
      lastModel = null,
      lastEffort = undefined,
      stepsOnModel = 2,
      cacheModel = start.model;
    for (const p of list) {
      intent = core.classifyIntent(p.text, intent);
      const inputTokens = Number.isFinite(p.context) ? p.context : 50000;
      const d = core.route({
        original: start,
        control,
        intent,
        models,
        fetchedAt,
        now: fetchedAt + 3600000,
        inputTokens,
        lastModel,
        lastEffort,
        stepsOnModel,
      });
      const pick = byKey.get(keyOf(d.pair)) ?? startRec;
      if (lastModel === d.pair.model) stepsOnModel++;
      else stepsOnModel = 1;
      lastModel = d.pair.model;
      lastEffort = d.pair.effort;
      // A different model stores the conversation again; the same model reads its cache.
      const switched = pick.runtimeId !== cacheModel;
      const prices = pick.evidence.prices ?? {};
      const contextUsd =
        (inputTokens *
          (switched
            ? (prices.cacheWrite ?? prices.input)
            : (prices.cacheRead ?? 0))) /
        1e6;
      const startContextUsd =
        (inputTokens * (startRec.evidence.prices?.cacheRead ?? 0)) / 1e6;
      cacheModel = pick.runtimeId;
      const score = pick.evidence.scores.general;
      rows.push({
        chat: p.chat,
        turn: p.turn,
        need: p.need,
        importance: p.importance,
        pick: keyOf(d.pair),
        reason: d.reason,
        moved: keyOf(d.pair) !== keyOf(start),
        modelMoved: d.pair.model !== start.model,
        switched,
        share: score / best,
        under: score < NEED_SHARE[p.need] * best - 1e-9,
        usd: (pick.evidence.benchmarkCostPerTask ?? 0) + contextUsd,
        startUsd:
          (startRec.evidence.benchmarkCostPerTask ?? 0) + startContextUsd,
        waitS: (pick.evidence.latencyMs ?? 0) / 1000,
        startWaitS: (startRec.evidence.latencyMs ?? 0) / 1000,
      });
    }
  }
  return rows;
}

export function summarise(rows) {
  const n = rows.length || 1;
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const weight = sum((r) => r.importance);
  const reasons = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const picks = {};
  for (const r of rows) picks[r.pick] = (picks[r.pick] ?? 0) + 1;
  return {
    prompts: rows.length,
    moved: sum((r) => r.moved) / n,
    modelMoved: sum((r) => r.modelMoved) / n,
    modelsUsed: new Set(rows.map((r) => r.pick.split("|")[0])).size,
    underserved: sum((r) => r.under) / n,
    underservedImportant:
      sum((r) => (r.under && r.importance >= 4 ? 1 : 0)) /
      (rows.filter((r) => r.importance >= 4).length || 1),
    underservedWeighted: weight
      ? sum((r) => (r.under ? r.importance : 0)) / weight
      : 0,
    usageVsStart: sum((r) => r.usd) / (sum((r) => r.startUsd) || 1),
    waitVsStart: sum((r) => r.waitS) / (sum((r) => r.startWaitS) || 1),
    meanShare: sum((r) => r.share) / n,
    reasons,
    picks,
  };
}

export async function replay({
  prompts,
  store,
  coreDir,
  modes = MODES,
  starts,
}) {
  const core = await loadCore(coreDir);
  const models = core.joinCatalogue(
    store.catalogue.runtime,
    store.catalogue.aa.models,
    store.control.mappings,
    store.control.verifiedIds,
  );
  const fetchedAt = store.catalogue.aa.fetchedAt;
  const out = [];
  for (const start of starts)
    for (const mode of modes)
      out.push({
        start: keyOf(start),
        mode,
        ...summarise(
          replayRun({ core, prompts, models, fetchedAt, mode, start }),
        ),
      });
  return out;
}

const pct = (x) => (x * 100).toFixed(0).padStart(4) + "%";
export function table(results) {
  const head =
    "start                      mode      moved model  models under  under≥4 usage  wait   holds (top reason)";
  const lines = results.map((r) => {
    const top = Object.entries(r.reasons).sort((a, b) => b[1] - a[1])[0];
    return [
      r.start.padEnd(26),
      r.mode.padEnd(9),
      pct(r.moved),
      pct(r.modelMoved),
      String(r.modelsUsed).padStart(6),
      pct(r.underserved),
      pct(r.underservedImportant).padStart(7),
      pct(r.usageVsStart),
      pct(r.waitVsStart),
      " " + top[0] + " " + top[1],
    ].join(" ");
  });
  return [head, ...lines].join("\n");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf("--" + name);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const promptsFile = arg("prompts");
  const storeFile = arg("store");
  if (!promptsFile || !storeFile) {
    console.error(
      "Use: node scripts/replay.mjs --prompts <file> --store <apex store file> [--core <dir>] [--json]",
    );
    process.exit(2);
  }
  const prompts = JSON.parse(await readFile(promptsFile, "utf8")).prompts;
  const store = JSON.parse(await readFile(storeFile, "utf8"));
  const starts = arg(
    "starts",
    "claude-opus-5-5|max,claude-opus-5-5|high,claude-sonnet-5-5|medium",
  )
    .split(",")
    .map((s) => {
      const [model, effort] = s.split("|");
      return { model, ...(effort && effort !== "default" ? { effort } : {}) };
    });
  const results = await replay({
    prompts,
    store,
    coreDir: path.resolve(arg("core", path.join(here, "../plugins/apex/core"))),
    starts,
  });
  console.log(
    process.argv.includes("--json")
      ? JSON.stringify(results, null, 2)
      : table(results),
  );
}
