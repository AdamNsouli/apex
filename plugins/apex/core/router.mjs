import { selectPair, MODES } from "./scoring.mjs";
import { LEVELS, TASK_INDEX, finite } from "./catalogue.mjs";
export const initialControl = () => ({
  revision: 0,
  mode: "balanced",
  routing: "auto",
  creditsConsent: false,
  budgetUsd: 0,
  taskOverride: null,
  verifiedIds: [],
  mappings: [],
  backend: "unknown",
});
export function applyControl(state, c) {
  if (c.expectedRevision !== state.revision)
    throw new Error("revision_conflict");
  const next = { ...state };
  if (c.kind === "mode" && Object.hasOwn(MODES, c.mode)) next.mode = c.mode;
  else if (
    c.kind === "routing" &&
    ["auto", "manual_hold", "disabled"].includes(c.value)
  )
    next.routing = c.value;
  else if (
    c.kind === "credits" &&
    typeof c.allowed === "boolean" &&
    finite(c.budgetUsd) !== null &&
    c.budgetUsd >= 0 &&
    (!c.allowed || c.budgetUsd > 0)
  ) {
    next.creditsConsent = c.allowed;
    next.budgetUsd = c.budgetUsd;
  } else if (
    c.kind === "task" &&
    (c.task === null || Object.hasOwn(TASK_INDEX, c.task))
  )
    next.taskOverride = c.task;
  else if (
    c.kind === "availability" &&
    Array.isArray(c.ids) &&
    c.ids.length <= 100 &&
    c.ids.every((x) => typeof x === "string" && x.length < 150) &&
    ["api", "subscription"].includes(c.backend)
  ) {
    next.verifiedIds = [...new Set(c.ids)];
    next.backend = c.backend;
  } else if (
    c.kind === "mapping" &&
    typeof c.runtimeId === "string" &&
    c.runtimeId.length > 0 &&
    c.runtimeId.length <= 200 &&
    typeof c.aaSlug === "string" &&
    c.aaSlug.length > 0 &&
    c.aaSlug.length <= 200 &&
    (c.effort === null || LEVELS.includes(c.effort))
  ) {
    next.mappings = [
      ...state.mappings.filter(
        (m) => !(m.runtimeId === c.runtimeId && m.effort === c.effort),
      ),
      { runtimeId: c.runtimeId, aaSlug: c.aaSlug, effort: c.effort },
    ].slice(-200);
  } else throw new Error("invalid_control");
  next.revision++;
  return next;
}
export function classifyIntent(text, previous) {
  const t = String(text ?? "")
    .slice(0, 12000)
    .toLowerCase();
  if (previous && /^\s*(yes|continue|go ahead|do it|ok|okay)[.!\s]*$/.test(t))
    return previous;
  const risk =
    /security|authenticat|authoriz|payment|production|migration|delete|concurren|medical|diagnos|legal|contract|financial|tax/.test(
      t,
    )
      ? "high"
      : "normal";
  let task = "general";
  for (const [name, re] of [
    ["healthcare", /medical|diagnos|healthcare/],
    ["legal", /legal|contract|lawsuit/],
    ["finance", /financial|accounting|tax/],
    ["economics", /economics|inflation/],
    ["engineering", /engineering|mechanical|electrical/],
    ["strategy", /strategy|business operation/],
    ["math", /math|proof|theorem|integral/],
    ["coding", /code|function|debug|program|typescript|python/],
  ])
    if (re.test(t)) {
      task = name;
      break;
    }
  if (task === "coding" && /implement|build|fix|refactor|debug/.test(t))
    task = "agentic_coding";
  const difficulty =
    /architect|proof|multi.file|concurren|security|comprehensive|complex|hard task/.test(
      t,
    )
      ? "complex"
      : /^(format|copy|rename|explain this line)\b/.test(t) && risk === "normal"
        ? "simple"
        : "standard";
  const ambiguous = t.length < 15 && !/^(hello|hi)\b/.test(t);
  return {
    task,
    risk: ambiguous ? "unknown" : risk,
    difficulty,
    ambiguous,
    failures: 0,
  };
}
export function estimatedCost(
  evidence,
  input,
  output,
  cacheRead = 0,
  cacheWrite = 0,
) {
  const p = evidence?.prices;
  if (
    !p ||
    [p.input, p.output, input, output].some((x) => finite(x) === null || x < 0)
  )
    return null;
  if (
    [cacheRead, cacheWrite].some((x) => finite(x) === null || x < 0) ||
    (cacheRead > 0 && (finite(p.cacheRead) === null || p.cacheRead < 0)) ||
    (cacheWrite > 0 && (finite(p.cacheWrite) === null || p.cacheWrite < 0))
  )
    return null;
  return (
    (input * p.input +
      output * p.output +
      cacheRead * (p.cacheRead ?? 0) +
      cacheWrite * (p.cacheWrite ?? 0)) /
    1e6
  );
}
const hold = (original, reason) => ({
  pair: original,
  reason,
  estimate: null,
  ranked: [],
});
const forecastCost = (evidence, input, output) => {
  const p = evidence?.prices;
  if (
    !p ||
    finite(p.input) === null ||
    finite(p.cacheWrite) === null ||
    p.cacheWrite < 0
  )
    return null;
  return estimatedCost(
    { ...evidence, prices: { ...p, input: Math.max(p.input, p.cacheWrite) } },
    input,
    output,
  );
};
export function route({
  original,
  control,
  intent,
  models,
  fetchedAt,
  now,
  inputTokens,
  spentUsd = 0,
  reservedUsd = 0,
  pinned = false,
  lastModel = null,
  lastEffort = undefined,
  stepsOnModel = 2,
}) {
  if (control.routing !== "auto" || pinned)
    return hold(original, "manual_hold");
  if (!fetchedAt || now - fetchedAt > 7 * 86400000)
    return hold(original, "evidence_missing_or_expired");
  if (!["api", "subscription"].includes(control.backend))
    return hold(original, "backend_not_confirmed");
  const task = control.taskOverride ?? intent.task;
  const baseline = models.find(
    (m) =>
      m.runtimeId === original.model &&
      m.effort === (original.effort ?? null) &&
      m.routable,
  );
  if (!baseline?.evidence || finite(baseline.evidence.scores[task]) === null)
    return hold(original, "baseline_evidence_unknown");
  if (!Number.isFinite(inputTokens) || inputTokens < 0)
    return hold(original, "context_tokens_unknown");
  const risky =
    intent.risk !== "normal" ||
    intent.difficulty === "complex" ||
    intent.failures >= 2;
  let eligible = models.filter(
    (m) =>
      m.routable &&
      m.evidence?.benchmarkVersion === baseline.evidence.benchmarkVersion &&
      finite(m.evidence?.scores[task]) !== null &&
      m.context >= inputTokens &&
      JSON.stringify(m.thinking ?? null) ===
        JSON.stringify(baseline.thinking ?? null),
  );
  if (risky || now - fetchedAt > 72 * 3600000)
    eligible = eligible.filter(
      (m) =>
        m.evidence.scores[task] >= baseline.evidence.scores[task] &&
        (original.effort === undefined ||
          m.effort === original.effort ||
          LEVELS.indexOf(m.effort) >= LEVELS.indexOf(original.effort)),
    );
  const candidates = eligible.map((m) => ({
    model: m.runtimeId,
    effort: m.effort ?? undefined,
    rawScore: m.evidence.scores[task],
    benchmarkVersion: m.evidence.benchmarkVersion,
    costUpperUsd: forecastCost(m.evidence, inputTokens, m.outputCap),
    latencyMs: m.evidence.latencyMs,
    record: m,
  }));
  const r = selectPair(
    candidates,
    control.mode,
    (lastModel ?? original.model) +
      "|" +
      (lastModel ? (lastEffort ?? "default") : (original.effort ?? "default")),
  );
  if (r.kind !== "select") return hold(original, r.reason);
  let winner = r.selected;
  const baselineScore = baseline.evidence.scores[task];
  // Standard tasks retain the baseline unless the evidence improvement or
  // conservative 5-request cache payback justifies a switch.
  let hysteresis = false;
  if (lastModel && winner.model !== lastModel && stepsOnModel < 2 && !risky) {
    const previous = r.ranked.find(
      (p) => p.model === lastModel && p.effort === lastEffort,
    );
    if (previous) {
      winner = previous;
      hysteresis = true;
    }
  }
  if (winner.rawScore < baselineScore) {
    if (risky || now - fetchedAt > 72 * 3600000)
      return hold(original, "quality_floor");
    const stay = forecastCost(
      baseline.evidence,
      inputTokens,
      baseline.outputCap,
    );
    const switchCost = winner.costUpperUsd;
    if (
      stay === null ||
      switchCost === null ||
      !(switchCost * 5 < stay * 5 * 0.95)
    )
      return hold(original, "cache_payback_unknown_or_negative");
  }
  if (intent.difficulty === "standard" && !risky) {
    const scores = candidates.map((p) => p.rawScore).sort((a, b) => a - b);
    const percentile = (score) =>
      scores.length === 1
        ? 1
        : scores.reduce((v, x, i) => v + (x === score ? i : 0), 0) /
          scores.filter((x) => x === score).length /
          (scores.length - 1);
    if (percentile(winner.rawScore) < percentile(baselineScore) - 0.1)
      return hold(original, "baseline_quality_floor");
  }
  // A different thinking-capability profile needs a native-engine compatibility
  // check we cannot infer from a benchmark name. Keep compatible profiles only.
  const changes =
    winner.model !== original.model || winner.effort !== original.effort;
  if (changes && control.backend === "api" && !control.creditsConsent)
    return hold(original, "paid_routing_consent_required");
  if (
    changes &&
    control.creditsConsent &&
    (winner.costUpperUsd === null ||
      spentUsd + reservedUsd + winner.costUpperUsd > control.budgetUsd)
  )
    return hold(original, "api_equivalent_budget");
  return {
    pair: {
      model: winner.model,
      ...(winner.effort !== undefined ? { effort: winner.effort } : {}),
    },
    reason: hysteresis ? "switch_hysteresis" : control.mode + "_utility",
    estimate: winner.costUpperUsd,
    ranked: r.ranked.map(({ record, ...p }) => p),
    task,
    risk: intent.risk,
  };
}
export class Ledger {
  constructor() {
    this.events = [];
    this.sequence = 0;
    this.spentUsd = 0;
    this.reservedUsd = 0;
    this.reservations = new Map();
    this.finished = new Set();
    this.unknownCosts = 0;
  }
  begin(id, fields, estimate) {
    if (this.reservations.has(id) || this.finished.has(id))
      throw new Error("duplicate_request");
    const reservation = estimate ?? 0;
    this.reservations.set(id, reservation);
    this.reservedUsd += reservation;
    const event = {
      id,
      sequence: ++this.sequence,
      timestamp: Date.now(),
      status: "streaming",
      ...fields,
      estimateUsd: estimate,
      observedUsd: null,
      responseModel: null,
      effectiveEffort: null,
    };
    this.events.push(event);
    this.events = this.events.slice(-1000);
    return event;
  }
  finish(id, usage, cost, status = "complete") {
    const e = this.events.find((e) => e.id === id);
    if (!e || this.finished.has(id)) return;
    this.finished.add(id);
    if (this.finished.size > 2000)
      this.finished.delete(this.finished.values().next().value);
    e.status = status;
    e.responseModel = usage?.model ?? null;
    e.usage = usage
      ? {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
        }
      : null;
    e.observedUsd = finite(cost);
    if (e.observedUsd !== null) {
      this.spentUsd += e.observedUsd;
      this.reservedUsd = Math.max(
        0,
        this.reservedUsd - (this.reservations.get(id) ?? 0),
      );
      this.reservations.delete(id);
    } else {
      this.unknownCosts++;
      e.retainedReservationUsd = this.reservations.get(id) ?? 0;
    }
  }
}
