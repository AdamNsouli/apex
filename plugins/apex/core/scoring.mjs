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
// shift moves every tier's floor and wtpScale how much a point is worth (Eco asks for
// less and values points at 60%), a fixed tier ignores the task. objective is what
// decides among the acceptable pairs: value (cost), score, or speed.
export const MODES = Object.freeze({
  eco: { shift: -0.05, wtpScale: 0.6, objective: "cost" },
  balanced: { shift: 0, wtpScale: 1, objective: "cost" },
  quality: { tier: "best", objective: "score" },
  sports: { shift: 0, wtpScale: 1, objective: "speed" },
});
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
  if (!Object.hasOwn(MODES, mode)) throw new Error("Invalid mode");
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
  const t = TIERS[spec.tier ?? tier];
  const best = Math.max(...priced.map((p) => p.rawScore));
  // A critical task keeps its full floor and point value in every mode: Eco saves on
  // the rest, never on money, legal, admissions or production work.
  const protect = (spec.tier ?? tier) === "critical";
  const shift = protect ? Math.max(0, spec.shift ?? 0) : (spec.shift ?? 0);
  const share = Math.min(1, Math.max(0.2, t.share + shift));
  const wtp = t.wtp * (protect ? 1 : (spec.wtpScale ?? 1));
  const waitMs = spec.objective === "score" ? Infinity : t.waitS * 1000;
  // The strongest pair always qualifies, so this is never empty.
  const floor = best > 0 ? share * best : best;
  const good = priced.filter((p) => p.rawScore >= floor);
  // A missing latency cannot show a pair is too slow. If every acceptable pair is
  // too slow, the wait limit is relaxed and the fastest of them wins.
  const inTime = good.filter(
    (p) => p.latencyMs == null || p.latencyMs <= waitMs,
  );
  const relaxed = !inTime.length;
  const pool = relaxed ? good : inTime;
  const value = (p) =>
    Number.isFinite(wtp) ? p.rawScore - p.costPerTaskUsd / wtp : p.rawScore;
  const order =
    spec.objective === "score"
      ? (a, b) =>
          b.rawScore - a.rawScore ||
          byAsc(a.costPerTaskUsd, b.costPerTaskUsd) ||
          byAsc(a.latencyMs, b.latencyMs)
      : spec.objective === "speed" || relaxed
        ? (a, b) =>
            byAsc(a.latencyMs, b.latencyMs) ||
            value(b) - value(a) ||
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
    tier: spec.tier ?? tier,
    target: { share, floor, best, wtp, waitS: waitMs / 1000, relaxed },
    evidence: "share_of_best_score_not_success_probability",
  };
}
