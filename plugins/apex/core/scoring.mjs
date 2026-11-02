// Pure ranking core for comparable evidence. The adapter applies availability,
// risk, manual override, budget, cache-payback and freshness gates BEFORE this.
//
// The policy names no model. Every allowed model at every effort is a candidate,
// scored on the benchmark for this kind of task (coding, agentic work, reasoning,
// knowledge, a sector, or general). For a task of a given size it asks:
//   1. which pairs are good enough (at least `share` of the strongest score),
//   2. which of those answer in time (benchmark median seconds under `waitS`),
//   3. which gives the most score for the usage: value = score - cost / wtp.
// `wtp` is how many dollars of benchmark cost per task one more point is worth.
// A quick task values a point at 3 cents, so a cheap pair that is a little weaker
// wins; a critical one at $1.20, so the stronger pair wins unless it is far dearer.
// Model and effort are traded off the same way: a higher effort of a smaller model
// and a lower effort of a bigger one are just two pairs with their own score and
// cost. Every number comes from the benchmark refresh, so new data changes picks.
//
// waitS is compared with the benchmark's median end-to-end seconds: a relative speed
// limit, not a promise about your prompt.
export const TIERS = Object.freeze({
  quick: { share: 0.4, wtp: 0.03, waitS: 30 },
  everyday: { share: 0.6, wtp: 0.15, waitS: 60 },
  hard: { share: 0.8, wtp: 0.4, waitS: 150 },
  critical: { share: 0.9, wtp: 1.2, waitS: 300 },
  best: { share: 1, wtp: Infinity, waitS: Infinity },
});
// Three modes, all on one rule: drop pairs under the task's floor or over its wait
// limit, then take the most score for the usage (score - cost/wtp). They differ only
// in how much a better answer is worth: `wtpScale` scales the worth of a point,
// `shift` moves the floor, `waitScale` the wait limit. A critical task (money,
// legal, admissions, production) keeps at least Balanced's floor and worth in every
// mode. One more mode, best_once ("Max Power once"), is never listed: one prompt on
// the strongest pair whatever it costs or takes.
//   save      a point is worth 70%, same floor: for a tight usage limit
//   balanced  the tiers as they are: almost everything
//   best      a point is worth 6x as much, floor 10 points higher, waits up to 2x
// `payback` is what a move to another model is judged on (see switchPayback).
export const MODES = Object.freeze({
  save: { objective: "value", payback: "value", wtpScale: 0.7 },
  balanced: { objective: "value", payback: "value" },
  best: {
    objective: "value",
    payback: "value",
    wtpScale: 6,
    shift: 0.1,
    waitScale: 2,
  },
});
export const ONCE = Object.freeze({ objective: "score", payback: "score" });
// Names from 0.9 and earlier, and friendly forms. Read lower-case, with spaces and
// dashes as "_" and "and" as "+".
export const MODE_ALIASES = Object.freeze({
  eco: "save",
  cost_efficient: "save",
  cost: "save",
  cheap: "save",
  saver: "save",
  quality: "best",
  high_quality: "best",
  max_power: "best",
  max_power_speed: "best",
  "max_power+speed": "best",
  "power+speed": "best",
  power: "best",
  sports: "balanced",
  time_efficient: "balanced",
  max_speed: "balanced",
  speed: "balanced",
  default: "balanced",
});
// The mode a stored or typed name means, or null when it means none.
export function modeName(name) {
  if (typeof name !== "string") return null;
  const n = name
    .trim()
    .toLowerCase()
    .replace(/\s+and\s+/g, "+")
    .replace(/\s*\+\s*/g, "+")
    .replace(/[\s-]+/g, "_");
  if (Object.hasOwn(MODES, n) || n === "best_once") return n;
  return Object.hasOwn(MODE_ALIASES, n) ? MODE_ALIASES[n] : null;
}
// A stored mode from any version: an unknown one falls back to Balanced.
export const migrateMode = (name) => modeName(name) ?? "balanced";
// A broad tier from the local intent classification. High risk or repeated failure
// make a task critical, complexity makes it at least "hard". An unclear request (unknown risk)
// stays "everyday"; the router still stops it falling below the native pair.
export function tierFor(intent = {}) {
  const complex = intent.difficulty === "complex";
  const risky = intent.risk === "high";
  // Unresolved high-risk work stays critical. A concrete implementation contract
  // can reduce reasoning demand without erasing its separate risk signal.
  if ((intent.failures ?? 0) >= 2) return "critical";
  // Concrete implementation contracts reduce judgment, not risk. Never use the
  // quick tier, and move back up as soon as a check fails.
  if (intent.execution === "specified")
    return (intent.failures ?? 0) > 0 ? "hard" : "everyday";
  if (risky) return "critical";
  if (complex || risky) return "hard";
  return intent.difficulty === "simple" ? "quick" : "everyday";
}
const key = (p) => `${p.model}|${p.effort ?? "default"}`;
const byAsc = (a, b) => (a ?? Infinity) - (b ?? Infinity);
export function selectPair(
  candidates,
  mode,
  currentKey,
  { tier = "everyday" } = {},
) {
  mode = modeName(mode);
  if (!mode) throw new Error("Invalid mode");
  if (!Object.hasOwn(TIERS, tier)) throw new Error("Invalid tier");
  if (!candidates.length)
    return { kind: "hold", reason: "no_eligible_evidence" };
  if (new Set(candidates.map(key)).size !== candidates.length)
    throw new Error("Duplicate pair");
  const versions = new Set(candidates.map((x) => x.benchmarkVersion));
  if (versions.size !== 1 || versions.has(undefined))
    return { kind: "hold", reason: "incomparable_benchmarks" };
  for (const p of candidates) {
    if (!Number.isFinite(p.rawScore))
      return { kind: "hold", reason: "missing_task_evidence" };
    for (const v of [p.costPerTaskUsd, p.costUpperUsd, p.latencyMs])
      if (v != null && (!Number.isFinite(v) || v < 0))
        throw new Error("Invalid estimate");
  }
  // Efficiency is judged only on the measured benchmark cost per task. A pair
  // without it cannot be ranked against the others, so it is not offered.
  const priced = candidates.filter((p) => p.costPerTaskUsd != null);
  if (!priced.length) return { kind: "hold", reason: "cost_evidence_missing" };
  const spec = mode === "best_once" ? ONCE : MODES[mode];
  // A critical task never gets a lower floor or a cheaper point than Balanced's.
  const protect = tier === "critical";
  const t = TIERS[tier];
  const best = Math.max(...priced.map((p) => p.rawScore));
  const shift = protect ? Math.max(0, spec.shift ?? 0) : (spec.shift ?? 0);
  const share = Math.min(1, Math.max(0.2, t.share + shift));
  const wtpScale = protect
    ? Math.max(1, spec.wtpScale ?? 1)
    : (spec.wtpScale ?? 1);
  const wtp = t.wtp * wtpScale;
  const waitMs =
    spec.objective === "score"
      ? Infinity
      : t.waitS * 1000 * (spec.waitScale ?? 1);
  // The strongest pair always qualifies, so this is never empty.
  const floor = best > 0 ? share * best : best;
  const good = priced.filter((p) => p.rawScore >= floor);
  const costCapUsd = null;
  // A missing latency cannot show a pair is too slow. If every acceptable pair is
  // too slow, the wait limit is relaxed and the fastest of them wins.
  const inTime = good.filter(
    (p) => p.latencyMs == null || p.latencyMs <= waitMs,
  );
  const relaxed = !inTime.length;
  const pool = relaxed ? good : inTime;
  const value = (p) =>
    Number.isFinite(wtp) ? p.rawScore - p.costPerTaskUsd / wtp : p.rawScore;
  const objective = relaxed ? "speed" : spec.objective;
  const order =
    objective === "score"
      ? (a, b) =>
          b.rawScore - a.rawScore ||
          byAsc(a.costPerTaskUsd, b.costPerTaskUsd) ||
          byAsc(a.latencyMs, b.latencyMs)
      : objective === "cost"
        ? (a, b) =>
            byAsc(a.costPerTaskUsd, b.costPerTaskUsd) ||
            b.rawScore - a.rawScore ||
            byAsc(a.latencyMs, b.latencyMs)
        : objective === "speed"
          ? (a, b) =>
              byAsc(a.latencyMs, b.latencyMs) ||
              byAsc(a.costPerTaskUsd, b.costPerTaskUsd) ||
              b.rawScore - a.rawScore
          : (a, b) =>
              value(b) - value(a) ||
              byAsc(a.costPerTaskUsd, b.costPerTaskUsd) ||
              byAsc(a.latencyMs, b.latencyMs);
  const ranked = pool
    .map((p) => ({
      ...p,
      shareOfBest: best > 0 ? p.rawScore / best : 1,
      value: Number(value(p).toFixed(2)),
    }))
    .sort((a, b) => {
      const d = order(a, b);
      if (d) return d;
      if (key(a) === currentKey && key(b) !== currentKey) return -1;
      if (key(b) === currentKey && key(a) !== currentKey) return 1;
      return key(a).localeCompare(key(b));
    });
  return {
    kind: "select",
    selected: ranked[0],
    ranked,
    tier,
    target: {
      share,
      floor,
      best,
      wtp,
      waitS: waitMs / 1000,
      relaxed,
      costCapUsd,
    },
    evidence: "share_of_best_score_not_success_probability",
  };
}
