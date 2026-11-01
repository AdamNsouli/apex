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
// Six modes, each named for what it decides on. In every mode the task's tier sets
// the quality floor (a share of the strongest score), and a critical task (money,
// legal, admissions, production) keeps its full floor whatever the mode.
//   balanced         floor, wait limit, then most score for the usage (score - cost/wtp)
//   cost_efficient   the cheapest pair over the floor; no wait limit; unpriced never chosen
//   time_efficient   the fastest pair over the floor among those at most 3x Balanced's cost
//   max_power        the highest score, cost and time ignored
//   max_speed        the fastest pair over the quick floor (critical keeps its own)
//   max_power_speed  the fastest pair within 95% of the best score
// `payback` is what a move to another model is judged on (see switchPayback).
export const MODES = Object.freeze({
  balanced: { objective: "value", payback: "value", wait: true },
  cost_efficient: { objective: "cost", payback: "cost" },
  time_efficient: {
    objective: "speed",
    payback: "speed",
    costCapOfBalanced: 3,
  },
  max_power: { objective: "score", payback: "score" },
  max_speed: { objective: "speed", payback: "speed", floorTier: "quick" },
  max_power_speed: { objective: "speed", payback: "speed", minShare: 0.95 },
});
// Stored settings and commands from before 0.9 used four other names.
// Names are read lower-case with spaces and dashes as "_" and "and" as "+", so
// "Max Power + Speed", "max-speed" and "power and speed" all resolve.
export const MODE_ALIASES = Object.freeze({
  eco: "cost_efficient",
  quality: "max_power",
  high_quality: "max_power",
  sports: "time_efficient",
  cost: "cost_efficient",
  cheap: "cost_efficient",
  cheapest: "cost_efficient",
  time: "time_efficient",
  power: "max_power",
  speed: "max_speed",
  fast: "max_speed",
  fastest: "max_speed",
  "power+speed": "max_power_speed",
  "max_power+speed": "max_power_speed",
  "max_power+max_speed": "max_power_speed",
  power_speed: "max_power_speed",
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
  if (Object.hasOwn(MODES, n)) return n;
  return Object.hasOwn(MODE_ALIASES, n) ? MODE_ALIASES[n] : null;
}
// A stored mode from any version: an unknown one falls back to Balanced.
export const migrateMode = (name) => modeName(name) ?? "balanced";
export const SPEED_MODES = Object.freeze(["max_speed", "max_power_speed"]);
// A broad tier from the local intent classification. High risk or repeated failure
// make a task critical, complexity makes it at least "hard". An unclear request (unknown risk)
// stays "everyday"; the router still stops it falling below the native pair.
export function tierFor(intent = {}) {
  const complex = intent.difficulty === "complex";
  const risky = intent.risk === "high";
  // High risk alone is critical: routing is no longer held at the starting model,
  // so the tier is what keeps a risky task on a strong pair.
  if ((intent.failures ?? 0) >= 2 || risky) return "critical";
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
  const spec = MODES[mode];
  const protect = tier === "critical";
  const t = TIERS[tier];
  const best = Math.max(...priced.map((p) => p.rawScore));
  // Max Speed asks only for the quick floor; a critical task keeps its own.
  let share =
    spec.floorTier && !protect ? TIERS[spec.floorTier].share : t.share;
  if (spec.minShare) share = Math.max(share, spec.minShare);
  share = Math.min(1, share);
  const wtp = t.wtp;
  const waitMs = spec.wait ? t.waitS * 1000 : Infinity;
  // The strongest pair always qualifies, so this is never empty.
  const floor = best > 0 ? share * best : best;
  let good = priced.filter((p) => p.rawScore >= floor);
  // Time Efficient will not pay more than twice the cheapest acceptable pair.
  let costCapUsd = null;
  // Time Efficient may pay up to 3x what Balanced would for the same task, so it is
  // faster than Balanced without the blank cheque Max Speed has. (A cap on the
  // cheapest pair was tried and left it as slow as Cost Efficient on real data.)
  if (spec.costCapOfBalanced) {
    const bal = selectPair(candidates, "balanced", currentKey, { tier });
    costCapUsd =
      spec.costCapOfBalanced *
      (bal.kind === "select" ? bal.selected.costPerTaskUsd : Infinity);
    good = good.filter((p) => p.costPerTaskUsd <= costCapUsd + 1e-12);
  }
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
