// Immutable, deliberately small evidence snapshot. No prompts, tool arguments,
// paths, credentials or provider reasoning are accepted here.
const number = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function snapshot(record, task) {
  const e = record?.evidence;
  if (!record || !e) return null;
  return {
    model: record.runtimeId,
    effort: record.effort,
    aaSlug: e.slug,
    benchmarkVersion: e.benchmarkVersion,
    task,
    taskScore: number(e.scores?.[task]),
    intelligence: number(e.scores?.general),
    mathProxy: task === "math",
    prices: {
      input: number(e.prices?.input),
      output: number(e.prices?.output),
      cacheRead: number(e.prices?.cacheRead),
      cacheWrite: number(e.prices?.cacheWrite),
    },
    priceUnit: "USD / 1M tokens",
    benchmarkCostPerTask: number(e.benchmarkCostPerTask),
    latencyMs: number(e.latencyMs),
  };
}
export function freezeDecision({
  original,
  decision,
  models,
  task,
  fetchedAt,
  baselineForecast = null,
}) {
  const find = (pair) =>
    models.find(
      (m) => m.runtimeId === pair.model && m.effort === (pair.effort ?? null),
    );
  return freeze({
    version: 2,
    source: "Artificial Analysis / user's permitted connection",
    fetchedAt: number(fetchedAt),
    baseline: snapshot(find(original), task),
    selected: snapshot(find(decision.pair), task),
    baselineForecastUsd: number(baselineForecast),
    candidateForecastUsd: number(decision.estimate),
    reason: decision.reason,
    ranked: (decision.ranked ?? []).map((p) => ({ ...p })),
    accountCharge: null,
  });
}
export function duration(event) {
  const start = number(event?.startedAt ?? event?.timestamp),
    end = number(event?.completedAt);
  return start !== null && end !== null && end >= start ? end - start : null;
}
export function verdict(event) {
  if (!event) return "No request selected";
  if (event.kind === "tool")
    return event.status === "error" ? "Tool failed" : "Tool activity";
  if (event.agentId) return "Native agent settings";
  if (event.reason === "manual_hold") return "Native settings held";
  const a = event.original,
    b = event.apexRequested;
  if (!a || !b) return "Historical request";
  if (a.model !== b.model) return "Model changed";
  if ((a.effort ?? null) !== (b.effort ?? null)) return "Effort changed";
  return "Native pair retained";
}
