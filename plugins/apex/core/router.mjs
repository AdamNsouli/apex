import { selectPair, tierFor, MODES } from "./scoring.mjs";
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
  modeRevision: 0,
  modeConsumedRevision: 0,
  qualityOnce: null,
  ultracode: "auto",
  agents: "auto",
});
// Ultracode is Claude Code's multi-agent mode. It is a session switch, not a field
// of a request, and it uses far more than one model call. Choosing a mode is what
// opts in: Sports uses it for hard and critical tasks, High Quality (or Quality
// once) for critical tasks only, Balanced and Eco never. `ultracode: "off"` rules
// it out altogether. Even then only a newly classified task typed at an idle prompt
// qualifies: a continuation ("yes", "go ahead"), a slash command, a message with
// attachments (a plugin's prompt cannot carry them) and a message typed over a
// running turn are all sent normally.
export const ULTRACODE_TIERS = Object.freeze({
  sports: ["hard", "critical"],
  quality: ["critical"],
});
export function wantsUltracode({
  control,
  intent,
  fresh,
  text,
  origin,
  attachments,
  turnId,
  pinned = false,
}) {
  const mode = control.qualityOnce ? "quality" : control.mode;
  return (
    control.ultracode === "auto" &&
    control.routing === "auto" &&
    !pinned &&
    fresh === true &&
    origin?.kind === "composer" &&
    !turnId &&
    !attachments?.length &&
    typeof text === "string" &&
    text.trim().length > 0 &&
    !/^\s*\//.test(text) &&
    (ULTRACODE_TIERS[mode] ?? []).includes(tierFor(intent))
  );
}
export function applyControl(state, c) {
  if (c.expectedRevision !== state.revision)
    throw new Error("revision_conflict");
  const next = { ...state };
  if (c.kind === "mode" && Object.hasOwn(MODES, c.mode)) {
    next.mode = c.mode;
    next.modeRevision = state.revision + 1;
  } else if (c.kind === "quality_once" && typeof c.armed === "boolean")
    next.qualityOnce = c.armed ? { revision: state.revision + 1 } : null;
  else if (c.kind === "ultracode" && ["off", "auto"].includes(c.value))
    next.ultracode = c.value;
  else if (c.kind === "agents" && ["off", "auto"].includes(c.value))
    next.agents = c.value;
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
// Subagents (the Agent tool, workflows) are routed too, under the base mode. One
// that was given its own model (by its definition or the Agent call) keeps it: an
// agent is taken to have inherited the session's model only when it asks for the
// same one the main chat does. Search and lookup agents are routed as quick tasks;
// any other agent is routed as the main chat's current task.
export const QUICK_AGENTS = Object.freeze([
  "Explore",
  "claude-code-guide",
  "statusline-setup",
]);
export function agentPlan({
  control,
  agentType,
  agentModel,
  mainModel,
  mainIntent,
}) {
  if ((control.agents ?? "auto") !== "auto")
    return { route: false, reason: "agent_routing_off" };
  if (!mainModel || agentModel !== mainModel)
    return { route: false, reason: "agent_model_chosen" };
  if (QUICK_AGENTS.includes(agentType))
    return {
      route: true,
      intent: {
        task: "general",
        risk: "normal",
        difficulty: "simple",
        failures: 0,
      },
    };
  return { route: true, intent: mainIntent };
}
// Called synchronously at a MAIN dispatch boundary, before any await. Subagents
// never call this. Consumption does not change the user's acknowledged intent
// revision: a new arm/cancel still requires the ordinary revision check.
export function captureDispatch(control, requestId) {
  const once = control.qualityOnce;
  return {
    effective: once ? { ...control, mode: "quality" } : { ...control },
    onceRevision: once?.revision ?? null,
    next: {
      ...control,
      qualityOnce: null,
      modeConsumedRevision: control.modeRevision ?? 0,
      consumedBy: requestId,
      consumedOnceRevision: once?.revision ?? null,
    },
  };
}
// A simple task is a mechanical edit or lookup named by its first word, or a short
// factual question. A question that asks for judgment, a plan or new work is not
// simple however short it is. This is a wording heuristic, not a measure of difficulty.
const SIMPLE_START =
  /^\s*(format|copy|rename|explain this line|summari[sz]e|tl;?dr|list|define|translate|spell|proofread|reword|rephrase|shorten|convert|sort|count|capitali[sz]e|fix (the |this |a )?typo)\b/;
const QUESTION_START =
  /^\s*(what|who|when|where|which|how (many|much|old|long|far)|is|are|was|were|does|do|did|can|could)\b/;
const NEEDS_THOUGHT =
  /should|best|better|recommend|advice|think|opinion|why|implement|build|refactor|debug|design|plan|write|create|review|analy[sz]e|compare|strategy|decide/;
const isSimple = (t) =>
  SIMPLE_START.test(t) ||
  (QUESTION_START.test(t) && t.trim().length <= 80 && !NEEDS_THOUGHT.test(t));
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
    ["math", /math|\bproofs?\b|theorem|integral/],
    ["coding", /code|function|debug|program|typescript|python/],
  ])
    if (re.test(t)) {
      task = name;
      break;
    }
  if (task === "coding" && /implement|build|fix|refactor|debug/.test(t))
    task = "agentic_coding";
  const difficulty =
    /architect|\bproofs?\b|multi.file|concurren|security|comprehensive|complex|hard task/.test(
      t,
    )
      ? "complex"
      : isSimple(t) && risk === "normal"
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
export const forecastCost = (evidence, input, output) => {
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
// Which thinking mode the engine would ask a model for. Claude Code uses adaptive
// thinking where a model has it, so two models that both have it can share a
// conversation; the other flags (turning thinking off, thinking between tools) are
// extras the engine sets per model and do not block a move.
export const thinkingMode = (m) =>
  m?.thinking?.adaptive?.supported
    ? "adaptive"
    : m?.thinking?.enabled?.supported
      ? "enabled"
      : m?.thinking == null
        ? "unknown"
        : "none";
// Requests a move to another model is judged over. Conservative: a chat that ends
// sooner never repays as much.
export const PAYBACK_REQUESTS = 5;
// Is moving the conversation to `winner` worth it, against staying on the model that
// holds the cache at its best acceptable effort (`stay`)? The move pays the new
// model's cache write for the whole context once; afterwards both only read it.
// Cost modes compare usage, Sports compares waiting, High Quality the score.
// Returns null when a price or cost needed for the sum is unknown.
export function switchPayback(winner, stay, inputTokens, objective = "cost") {
  const w = winner.record?.evidence?.prices,
    s = stay.record?.evidence?.prices;
  const nums = [
    winner.costPerTaskUsd,
    stay.costPerTaskUsd,
    w?.cacheWrite,
    w?.cacheRead,
    s?.cacheRead,
    inputTokens,
  ];
  if (nums.some((x) => finite(x) === null || x < 0)) return null;
  const n = PAYBACK_REQUESTS,
    mtok = inputTokens / 1e6;
  const stayUsd = n * (stay.costPerTaskUsd + mtok * s.cacheRead);
  const moveUsd =
    n * (winner.costPerTaskUsd + mtok * w.cacheRead) +
    mtok * (w.cacheWrite - w.cacheRead);
  const pays =
    objective === "score"
      ? winner.rawScore > stay.rawScore
      : objective === "speed"
        ? winner.latencyMs != null &&
          stay.latencyMs != null &&
          winner.latencyMs < stay.latencyMs * 0.9
        : moveUsd < stayUsd * 0.95;
  return { pays, stayUsd, moveUsd, requests: n };
}
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
  // The whole allowed list is routed, not just the model the chat started on. The
  // starting pair is only the reference for receipts and, when the data is old, the
  // quality floor. When it has no evidence (an effort the benchmarks do not name, a
  // model they do not cover), the pair now holding the cache stands in, then the
  // strongest routable pair.
  const routable = models.filter((m) => m.routable && m.evidence);
  const same = (model, effort) => (m) =>
    m.runtimeId === model && m.effort === (effort ?? null);
  const baseline =
    routable.find(same(original.model, original.effort)) ??
    (lastModel ? routable.find(same(lastModel, lastEffort)) : undefined) ??
    [...routable].sort(
      (a, b) =>
        (b.evidence.scores?.general ?? 0) - (a.evidence.scores?.general ?? 0),
    )[0];
  if (!baseline?.evidence) return hold(original, "baseline_evidence_unknown");
  if (!Number.isFinite(inputTokens) || inputTokens < 0)
    return hold(original, "context_tokens_unknown");
  const risky =
    intent.risk !== "normal" ||
    intent.difficulty === "complex" ||
    intent.failures >= 2;
  const stale = now - fetchedAt > 72 * 3600000;
  const compatible = routable.filter(
    (m) =>
      m.evidence.benchmarkVersion === baseline.evidence.benchmarkVersion &&
      m.context >= inputTokens &&
      thinkingMode(m) === thinkingMode(baseline),
  );
  const scored = (m, index) => finite(m.evidence?.scores?.[index]) !== null;
  // The task's own index is used only when every compared pair has it. Otherwise
  // general intelligence stands in for all of them, so the pairs stay comparable.
  const basis =
    scored(baseline, task) && compatible.every((m) => scored(m, task))
      ? task
      : "general";
  if (!scored(baseline, basis))
    return hold(original, "baseline_evidence_unknown");
  let eligible = compatible.filter((m) => scored(m, basis));
  // Old data cannot be trusted to place a cheaper pair, so it may not go below the
  // reference. Fresh data lets the task's tier set the floor instead.
  if (stale)
    eligible = eligible.filter(
      (m) => m.evidence.scores[basis] >= baseline.evidence.scores[basis],
    );
  const candidates = eligible.map((m) => ({
    model: m.runtimeId,
    effort: m.effort ?? undefined,
    rawScore: m.evidence.scores[basis],
    benchmarkVersion: m.evidence.benchmarkVersion,
    costPerTaskUsd: finite(m.evidence.benchmarkCostPerTask),
    costUpperUsd: forecastCost(m.evidence, inputTokens, m.outputCap),
    latencyMs: m.evidence.latencyMs,
    record: m,
  }));
  const cacheModel = lastModel ?? original.model;
  const r = selectPair(
    candidates,
    control.mode,
    cacheModel +
      "|" +
      (lastModel ? (lastEffort ?? "default") : (original.effort ?? "default")),
    { tier: tierFor(intent) },
  );
  if (r.kind !== "select") return hold(original, r.reason);
  let winner = r.selected;
  let reason = control.mode + "_policy";
  // Standard tasks keep the previous pair for one more step rather than flap.
  if (lastModel && winner.model !== lastModel && stepsOnModel < 2 && !risky) {
    const previous = r.ranked.find(
      (p) => p.model === lastModel && p.effort === lastEffort,
    );
    if (previous) {
      winner = previous;
      reason = "switch_hysteresis";
    }
  }
  // A different model has to store the whole conversation again; the model that
  // holds it only reads it. The move is made when it pays back over the next few
  // requests, or when no effort of the current model reaches the task's floor.
  if (winner.model !== cacheModel) {
    const stay = r.ranked.find((p) => p.model === cacheModel);
    if (stay) {
      const move = switchPayback(
        winner,
        stay,
        inputTokens,
        MODES[control.mode]?.objective,
      );
      if (!(move?.pays === true)) {
        winner = stay;
        reason = move ? "switch_does_not_pay_back" : "switch_cost_unknown";
      }
    }
  }
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
    reason,
    estimate: winner.costUpperUsd,
    ranked: r.ranked.map(({ record, ...p }) => p),
    task,
    scoreBasis: basis,
    tier: r.tier,
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
  finish(id, usage, cost, status = "complete", completedAt = Date.now()) {
    const e = this.events.find((e) => e.id === id);
    if (!e || this.finished.has(id)) return;
    this.finished.add(id);
    if (this.finished.size > 2000)
      this.finished.delete(this.finished.values().next().value);
    e.status = status;
    e.completedAt = completedAt;
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
