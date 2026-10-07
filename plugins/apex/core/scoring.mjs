// Pure ranking core for comparable evidence. Adapter must apply availability,
// risk, manual override, budget, cache-payback and freshness gates BEFORE this.
export const MODES = Object.freeze({
  eco: { floor: 0.5, weights: [0.3, 0.55, 0.15] },
  balanced: { floor: 0.75, weights: [0.55, 0.25, 0.2] },
  quality: { floor: 1, weights: [0.8, 0.1, 0.1] },
  sports: { floor: 0.5, weights: [0.35, 0.05, 0.6] },
});
const key = (p) => `${p.model}|${p.effort ?? "default"}`;
export function selectPair(
  candidates,
  mode,
  currentKey,
  ratioMeaningful = true,
) {
  if (!Object.hasOwn(MODES, mode)) throw new Error("Invalid mode");
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
    for (const v of [p.costUpperUsd, p.latencyMs])
      if (v != null && (!Number.isFinite(v) || v < 0))
        throw new Error("Invalid estimate");
  }
  const sorted = [...candidates].sort(
    (a, b) => a.rawScore - b.rawScore || key(a).localeCompare(key(b)),
  );
  const scored = sorted.map((p) => {
    const ranks = sorted
      .map((v, i) => (v.rawScore === p.rawScore ? i : -1))
      .filter((i) => i >= 0);
    const q =
      sorted.length === 1
        ? 1
        : ranks.reduce((a, b) => a + b, 0) / ranks.length / (sorted.length - 1);
    return { ...p, q };
  });
  const best = Math.max(...scored.map((p) => p.rawScore));
  // Tied highest scores may all have percentile below 1. Admit the top tie set
  // for quality and as an escape if floor excludes all; never exclude all best.
  let eligible = scored.filter(
    (p) => p.q >= MODES[mode].floor || p.rawScore === best,
  );
  if (mode === "sports")
    eligible = eligible.filter((p) =>
      ratioMeaningful && best > 0
        ? p.rawScore >= 0.97 * best
        : p.rawScore === best,
    );
  let weights = [...MODES[mode].weights];
  if (eligible.some((p) => p.costUpperUsd == null)) weights[1] = 0;
  if (eligible.some((p) => p.latencyMs == null)) weights[2] = 0;
  const total = weights.reduce((a, b) => a + b, 0);
  weights = weights.map((w) => w / total);
  const maxC = Math.max(0, ...eligible.map((p) => p.costUpperUsd ?? 0));
  const maxL = Math.max(0, ...eligible.map((p) => p.latencyMs ?? 0));
  const ranked = eligible.map((p) => ({
    ...p,
    utility:
      weights[0] * p.q +
      weights[1] * (weights[1] && maxC ? 1 - p.costUpperUsd / maxC : 1) +
      weights[2] * (weights[2] && maxL ? 1 - p.latencyMs / maxL : 1),
  }));
  ranked.sort((a, b) => {
    if (Math.abs(a.utility - b.utility) > 1e-9) return b.utility - a.utility;
    if (key(a) === currentKey && key(b) !== currentKey) return -1;
    if (key(b) === currentKey && key(a) !== currentKey) return 1;
    return (
      (a.costUpperUsd ?? Infinity) - (b.costUpperUsd ?? Infinity) ||
      (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity) ||
      key(a).localeCompare(key(b))
    );
  });
  return {
    kind: "select",
    selected: ranked[0],
    ranked,
    effectiveWeights: weights,
    evidence: "cohort_percentile_not_success_probability",
  };
}
