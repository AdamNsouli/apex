// Pure ranking core for comparable evidence. The adapter applies availability,
// risk, manual override, budget, cache-payback and freshness gates BEFORE this.
//
// The policy names no model. For a kind of task it asks two questions of the
// benchmark data: which pairs reach enough of the strongest comparable score, and
// of those, which is cheapest (measured benchmark USD per task, so a high effort
// that burns many tokens costs more than a low one) without making a person wait
// too long? Every number comes from the daily benchmark refresh, so a new model or
// a changed score changes the answer without a code or settings change.
//
// share  = fraction of the strongest comparable score a task of this kind deserves.
// waitS  = how long a person will wait for it, compared with the benchmark's median
//          end-to-end seconds. A relative speed limit, not a promise about your prompt.
export const TIERS = Object.freeze({
  quick: { share: 0.7, waitS: 20 },
  everyday: { share: 0.88, waitS: 60 },
  hard: { share: 0.92, waitS: 120 },
  critical: { share: 0.97, waitS: 240 },
  best: { share: 1, waitS: Infinity },
});
// shift moves every tier's share (Eco asks for less); a fixed tier or share ignores
// the task. objective is what is minimised or maximised among the acceptable pairs.
export const MODES = Object.freeze({
  eco: { shift: -0.1, objective: "cost" },
  balanced: { shift: 0, objective: "cost" },
  quality: { tier: "best", objective: "score" },
  sports: { share: 0.97, objective: "speed" },
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
  const best = Math.max(...priced.map((p) => p.rawScore));
  const share =
    spec.share ??
    Math.min(
      1,
      Math.max(0.5, TIERS[spec.tier ?? tier].share + (spec.shift ?? 0)),
    );
  const waitMs =
    spec.objective === "cost"
      ? (spec.tier ? TIERS[spec.tier] : TIERS[tier]).waitS * 1000
      : Infinity;
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
  const order =
    spec.objective === "score"
      ? (a, b) =>
          b.rawScore - a.rawScore ||
          byAsc(a.costPerTaskUsd, b.costPerTaskUsd) ||
          byAsc(a.latencyMs, b.latencyMs)
      : spec.objective === "speed" || relaxed
        ? (a, b) =>
            byAsc(a.latencyMs, b.latencyMs) ||
            byAsc(a.costPerTaskUsd, b.costPerTaskUsd) ||
            b.rawScore - a.rawScore
        : (a, b) =>
            byAsc(a.costPerTaskUsd, b.costPerTaskUsd) ||
            b.rawScore - a.rawScore ||
            byAsc(a.latencyMs, b.latencyMs);
  const ranked = pool
    .map((p) => ({ ...p, shareOfBest: best > 0 ? p.rawScore / best : 1 }))
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
    tier: spec.tier ?? (spec.share ? "speed" : tier),
    target: { share, floor, best, waitS: waitMs / 1000, relaxed },
    evidence: "share_of_best_score_not_success_probability",
  };
}
