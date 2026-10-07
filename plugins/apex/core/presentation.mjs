import { duration, verdict } from "./receipt.mjs";
export const VERSION = "0.3.0-beta.1";
export const MODES = {
  eco: {
    label: "Eco",
    detail: "Favor lower cost within the protected quality floor.",
  },
  balanced: {
    label: "Balanced",
    detail: "Balance task evidence, estimated cost and speed.",
  },
  quality: {
    label: "High Quality",
    detail: "Favor the strongest comparable task evidence.",
  },
  sports: {
    label: "Sports",
    detail: "Favor speed close to the strongest task evidence.",
  },
};
export const REASONS = {
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
export function modelName(state, id) {
  return (
    state.runtime?.find((m) => m.id === id)?.name ??
    id ??
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
  let status = "Routing enabled",
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
    status = "Held";
    tone = "attention";
    blocker = "Native overrides are active. Resume routing explicitly.";
  } else if (age === null || age > 7 * 86400000) {
    status = "Observing only";
    tone = "attention";
    blocker =
      age === null
        ? "Connect benchmark evidence in Setup."
        : "Evidence expired. Refresh when eligible.";
  } else if (
    !["api", "subscription"].includes(control.backend) ||
    !control.verifiedIds?.length
  ) {
    status = "Observing only";
    tone = "attention";
    blocker = "Confirm backend and permitted model IDs in Setup.";
  } else if (!state.catalogue?.some((m) => m.routable)) {
    status = "Observing only";
    tone = "attention";
    blocker = "Confirm exact model / effort evidence mappings in Setup.";
  } else if (control.backend === "api" && !control.creditsConsent) {
    status = "Observing only";
    tone = "attention";
    blocker = "Allow APEX API routing within an estimate budget.";
  } else if (age > 72 * 3600000) {
    status = "Limited evidence";
    tone = "attention";
    blocker = "Quality downgrades are suspended until evidence refreshes.";
  }
  const pending =
    (control.modeRevision ?? 0) > (control.modeConsumedRevision ?? 0);
  const mode = MODES[control.mode] ?? MODES.balanced;
  const pendingText = control.qualityOnce
    ? "High Quality once saved · next main request"
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
  return {
    control,
    mode,
    status,
    tone,
    blocker,
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
