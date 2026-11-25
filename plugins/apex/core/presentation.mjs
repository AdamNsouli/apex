import { duration, verdict } from "./receipt.mjs";
import { migrateMode } from "./scoring.mjs";
export const VERSION = "0.20.0-beta.1";
export const MODES = {
  save: {
    label: "Save",
    short: "Save",
    detail:
      "Spends less: a slightly lower bar and cheaper picks, for when your usage limit is close. Critical tasks keep their full bar.",
  },
  balanced: {
    label: "Balanced",
    short: "Balanced",
    detail:
      "Matches reasoning to the task. Specified implementation uses a smaller execution budget; harder decisions keep stronger picks. No automatic Ultracode or parallel-agent nudge.",
  },
  best: {
    label: "Best",
    short: "Best",
    detail:
      "A higher bar and stronger picks, waiting up to twice as long. Ultracode and parallel subagents for hard and critical tasks.",
  },
};
// "Max Power once": one prompt on the strongest pair. Not a mode you stay in.
export const ONCE_MODE = {
  label: "Max Power once",
  short: "Once",
  detail: "This prompt only: the strongest pair, whatever it costs or takes.",
};
// A mode saved by an older version (eco, quality, sports, max speed...) or unknown
// reads as the mode it became, never as a crash.
export const modeSpec = (mode) => {
  const m = migrateMode(mode);
  return m === "best_once" ? ONCE_MODE : MODES[m];
};
// A few words for the strip; the full sentence stays in REASONS for Inspect.
export const SHORT_REASONS = {
  balanced_policy: "best value for the task",
  save_policy: "cheapest that is good enough",
  best_policy: "strongest worth the wait",
  specified_execution_policy: "following a supplied plan",
  failure_escalation: "raised after failed checks",
  execution_failure_escalation: "raised after a failed check",
  switch_does_not_pay_back: "kept: switching costs more",
  effort_change_does_not_pay_back: "kept: an effort change costs more",
  switch_hysteresis: "kept to avoid flip-flopping",
  manual_hold: "your settings in control",
  stale_data_floor: "old benchmarks: no downgrades",
  quality_floor: "kept to protect quality",
};
const TIER_WORDS = {
  quick: "Quick task",
  everyday: "Everyday task",
  hard: "Hard task",
  critical: "Critical task",
};
// "Hard task · best value for the task" for the latest main request.
export function whyShort(e) {
  if (!e) return "";
  return [TIER_WORDS[e.tier], SHORT_REASONS[e.reason]]
    .filter(Boolean)
    .join(" · ");
}
// "2 model switches · 3 outputs trimmed · 1 subagent hint" for this chat.
export function activityLine(state) {
  const main = (state.events ?? []).filter(
    (e) => e.kind !== "tool" && !e.agentId,
  );
  let switches = 0;
  for (let i = 1; i < main.length; i++)
    if (main[i].apexRequested?.model !== main[i - 1].apexRequested?.model)
      switches++;
  const a = state.activity ?? {};
  const hints =
    (a.notes?.explore ?? 0) + (a.notes?.review ?? 0) + (a.notes?.team ?? 0);
  const n = (count, one, many = one + "s") =>
    count ? count + " " + (count === 1 ? one : many) : null;
  return [
    n(switches, "model switch", "model switches"),
    n(a.trimmed ?? 0, "output trimmed", "outputs trimmed"),
    n(hints, "subagent hint"),
  ]
    .filter(Boolean)
    .join(" · ");
}
export const REASONS = {
  specified_execution_policy:
    "The implementation has a concrete supplied contract. Selected against the current mode's implementation floor; safety constraints and high-risk classification remain visible.",
  execution_failure_escalation:
    "The specified implementation hit a failing check. Raised the reasoning tier; repeated failures use the critical floor.",
  failure_escalation:
    "Two or more real checks failed on this task (a failed test, build, script or edit). Raised the reasoning tier one step; three failures use the critical floor. Searches that find nothing and refused calls do not count.",
  stale_data_floor:
    "The benchmark data is over three days old, so APEX stayed at or above your starting model whatever the mode. Run /apex refresh.",
  manual_hold: "Your native model and effort settings are in control.",
  evidence_missing_or_expired:
    "Fresh Artificial Analysis evidence is needed before switching.",
  backend_not_confirmed:
    "Confirm your billing backend and permitted model IDs in Setup.",
  baseline_evidence_unknown:
    "The native model / effort pair lacks verified task evidence.",
  context_tokens_unknown: "Claude has not reported the context token count.",
  no_eligible_evidence:
    "No verified pair meets the capability and evidence requirements.",
  incomparable_benchmarks: "The benchmark versions cannot be compared fairly.",
  missing_task_evidence: "This task has no comparable benchmark evidence.",
  quality_floor: "Kept the native pair to protect task quality.",
  baseline_quality_floor:
    "The alternative falls below the baseline quality floor.",
  cost_evidence_missing:
    "The benchmark data has no cost-per-task figures, so efficiency cannot be compared.",
  cache_payback_unknown_or_negative:
    "The forecast does not justify the switch's cache transition.",
  paid_routing_consent_required:
    "API-funded changes need explicit APEX routing consent.",
  api_equivalent_budget:
    "The change exceeds the estimate budget or its cost is unknown.",
  switch_hysteresis:
    "Kept the recent eligible pair to avoid unnecessary switching.",
  agent_native_settings:
    "This agent keeps its native model and effort settings.",
  agent_routing_off:
    "Agent routing is off (/apex agents auto turns it on); this agent keeps its own settings.",
  agent_model_chosen:
    "This agent was given its own model, so APEX leaves it alone.",
  switch_does_not_pay_back:
    "Stayed on the model that holds this chat: moving would cost more to re-store the conversation than it saves over the next few requests.",
  switch_cost_unknown:
    "Stayed on the model that holds this chat: the prices needed to judge a move are missing.",
  effort_change_does_not_pay_back:
    "Kept the eligible cached effort: the alternative's estimated benefit does not repay a prompt-cache rewrite (Claude Code sends effort per request unless per_turn_effort is enabled).",
  effort_change_cost_unknown:
    "Kept the eligible cached effort: the cache prices needed to evaluate an effort change are missing.",
  save_policy:
    "Selected for the most score for the usage, with Save's slightly lower bar and cheaper points.",
  best_policy:
    "Selected for the most score for the usage, with Best's higher bar and stronger points.",
  best_once_policy:
    "Max Power once: selected as the strongest pair for this task.",
  balanced_policy:
    "Selected for the most score for the usage among pairs good enough for this task, without a long wait.",
  cost_efficient_policy:
    "Selected as the cheapest pair good enough for this task.",
  time_efficient_policy:
    "Selected as the fastest pair good enough for this task that costs at most twice the cheapest.",
  max_power_policy: "Selected as the strongest pair for this task.",
  max_speed_policy:
    "Selected as the fastest pair over the low speed floor, whatever it costs.",
  max_power_speed_policy:
    "Selected as the fastest pair within 95% of the strongest, whatever it costs.",
  // Receipts written by 0.4 to 0.9 carry the earlier mode names.
  eco_policy:
    "Selected for the most score for the usage, with Eco's lower floor and cheaper points.",
  quality_policy: "Selected for the strongest comparable task evidence.",
  sports_policy: "Selected as the fastest pair good enough for this task.",
  // Receipts written before 0.4.0 carry the earlier weighted-utility codes.
  eco_utility: "Selected for lower forecast cost within the quality floor.",
  balanced_utility:
    "Selected for the balance of task evidence, speed and forecast cost.",
  quality_utility: "Selected for the strongest comparable task evidence.",
  sports_utility:
    "Selected for speed close to the strongest comparable task evidence.",
};
export const reason = (code) =>
  REASONS[code] ??
  "Native settings retained; inspect the recorded decision code.";
export const money = (n) =>
  typeof n === "number" && Number.isFinite(n)
    ? "≈ $" + n.toFixed(4)
    : "unknown";
export const short = (s, width = 45) => {
  const v = String(s ?? "unknown");
  return v.length > width ? v.slice(0, Math.max(1, width - 1)) + "…" : v;
};
export const effortLabel = (effort) =>
  effort == null
    ? "Default"
    : String(effort).replace(/^./, (c) => c.toUpperCase());
// "claude-sonnet-5-5" → "Sonnet 5.5" when discovery gave no display name.
function prettyId(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id ?? "");
  return m
    ? m[1][0].toUpperCase() +
        m[1].slice(1) +
        " " +
        m[2] +
        (m[3] ? "." + m[3] : "")
    : id;
}
export function modelName(state, id) {
  return (
    state.runtime?.find((m) => m.id === id)?.name ??
    prettyId(id) ??
    "Waiting for a request"
  );
}
export function pairLabel(state, pair) {
  return pair
    ? modelName(state, pair.model) + " / " + effortLabel(pair.effort)
    : "Waiting for a request";
}
export function present(
  state = {},
  { scope = "main", selectedId = null, now = state.now ?? Date.now() } = {},
) {
  const control = state.control ?? {},
    all = state.events ?? [],
    requests = all.filter((e) => e.kind !== "tool");
  const scoped = all.filter(
    (e) =>
      scope === "all" || (scope === "main" ? !e.agentId : e.agentId === scope),
  );
  const active = scoped.findLast(
      (e) => e.kind !== "tool" && e.status === "streaming",
    ),
    latest = scoped.findLast((e) => e.kind !== "tool");
  const selected =
    scoped.find((e) => e.id === selectedId) ??
    active ??
    latest ??
    scoped.at(-1) ??
    null;
  const fetchedAt = state.evidenceFetchedAt ?? state.aa?.fetchedAt ?? null;
  const age = fetchedAt == null ? null : Math.max(0, now - fetchedAt);
  let status = "Routing",
    tone = "ready",
    blocker = null;
  if (state.connected === false) {
    status = "Disconnected";
    tone = "error";
    blocker = "Reconnect to the Claude host.";
  } else if (scope !== "main" && scope !== "all") {
    status = "Native agent settings";
    tone = "neutral";
  } else if (state.pins || control.routing !== "auto") {
    status = "Paused";
    tone = "attention";
    blocker =
      "Your /model or /effort choice is in control. /apex auto resumes routing.";
  } else if (age === null || age > 7 * 86400000) {
    status = "Watching only";
    tone = "attention";
    blocker =
      age === null
        ? "Connect benchmark data in Setup to start routing."
        : "Benchmark data expired. Refresh it to start routing again.";
  } else if (
    !["api", "subscription"].includes(control.backend) ||
    !control.verifiedIds?.length
  ) {
    status = "Watching only";
    tone = "attention";
    blocker = "Confirm your plan and the models it includes in Setup.";
  } else if (!state.catalogue?.some((m) => m.routable)) {
    status = "Watching only";
    tone = "attention";
    blocker = "Match each model and effort to its benchmark in Setup.";
  } else if (control.backend === "api" && !control.creditsConsent) {
    status = "Watching only";
    tone = "attention";
    blocker = "Allow APEX API routing within an estimate budget.";
  } else if (age > 72 * 3600000) {
    status = "Old benchmarks";
    tone = "attention";
    blocker =
      "Benchmarks are over 3 days old, so APEX will not pick weaker models until they refresh.";
  }
  const pending =
    (control.modeRevision ?? 0) > (control.modeConsumedRevision ?? 0);
  const mode = modeSpec(control.mode);
  const pendingText = control.qualityOnce
    ? "Max Power once saved · next main request"
    : pending
      ? mode.label + " saved · next main request"
      : null;
  const known = requests.filter(
    (e) => typeof e.observedUsd === "number" && Number.isFinite(e.observedUsd),
  );
  const unknownRetained = requests.filter(
    (e) => e.status !== "streaming" && e.observedUsd == null,
  ).length;
  const unknown = state.cost?.unknownCostRequests ?? unknownRetained;
  const ledgerTotal = state.cost?.observedApiEquivalentUsd;
  const observedTotal = Number.isFinite(ledgerTotal)
    ? ledgerTotal
    : known.reduce((sum, e) => sum + e.observedUsd, 0);
  const nextRefreshAt =
    state.nextRefreshAt ?? (fetchedAt == null ? null : fetchedAt + 86400000);
  // A model the daily refresh found on the account stays unused until you confirm
  // your plan includes it. Say so for a week, then stop nagging.
  const found = (state.changes?.newModels ?? []).filter(
    (id) => !(control.verifiedIds ?? []).includes(id),
  );
  const notice =
    found.length &&
    state.changes?.at != null &&
    now - state.changes.at < 7 * 86400000
      ? (found.length === 1 ? "New model " : "New models ") +
        found.map((id) => modelName(state, id)).join(", ") +
        ". If your plan includes " +
        (found.length === 1 ? "it" : "them") +
        ": /apex confirm-models " +
        found.join(" ")
      : null;
  return {
    control,
    mode,
    status,
    tone,
    blocker,
    notice,
    pending,
    pendingText,
    age,
    fetchedAt,
    nextRefreshAt,
    refreshEligible:
      !state.refreshBusy && (nextRefreshAt == null || now >= nextRefreshAt),
    requests,
    scoped,
    active,
    latest,
    selected,
    verdict: verdict(selected),
    duration: duration(selected),
    agents: [...new Set(all.map((e) => e.agentId).filter(Boolean))],
    currentPair: pairLabel(state, (active ?? latest)?.apexRequested),
    observed:
      known.length || observedTotal > 0
        ? money(observedTotal) + (unknown ? " · partial" : "")
        : "Not yet observed",
    unknownCosts: unknown,
    baselineProtected:
      state.intent?.risk !== "normal" ||
      state.intent?.difficulty === "complex" ||
      (state.intent?.failures ?? 0) >= 2,
  };
}
