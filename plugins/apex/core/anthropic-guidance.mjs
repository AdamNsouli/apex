// Reviewed facts and operational advice, not benchmark scores or account access.
// Runtime discovery and explicit user confirmation remain routing authority.
export const GUIDANCE_REVIEWED_AT = "2026-11-23";
export const GUIDANCE_REVIEW_DAYS = 30;
export const GUIDANCE_SOURCES = Object.freeze({
  models: "https://platform.claude.com/docs/en/models/overview",
  effort: "https://platform.claude.com/docs/en/build-with-claude/effort",
  thinking:
    "https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost",
  choosing:
    "https://platform.claude.com/docs/en/about-claude/models/choosing-a-model",
  caching:
    "https://platform.claude.com/docs/en/build-with-claude/prompt-caching",
  code: "https://code.claude.com/docs/en/model-config",
  costs: "https://code.claude.com/docs/en/costs",
});
const levels = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
const profile = (defaultEffort, purpose, startingEffort, thinking) =>
  Object.freeze({
    apiDefaultEffort: defaultEffort,
    purpose,
    startingEffort: Object.freeze(startingEffort),
    thinking: Object.freeze(thinking),
    efforts: levels,
    contextTokens: 1000000,
    maxOutputTokens: 128000,
    perMessageEffort: true,
  });
export const MODEL_GUIDANCE = Object.freeze({
  "claude-haiku-5-5": profile(
    "medium",
    "Short tools, classification, extraction and high-volume work",
    { simple: "low", specified: "medium", demanding: "high" },
    {
      default: "adaptive",
      withoutUpfront: "disabled",
      withoutUpfrontMax: "high",
    },
  ),
  "claude-sonnet-5-5": profile(
    "high",
    "Everyday coding and multistep tool workflows",
    { simple: "low or medium", specified: "medium", demanding: "high" },
    {
      default: "adaptive",
      withoutUpfront: "between_tools",
      withoutUpfrontMax: "high",
    },
  ),
  "claude-opus-5-5": profile(
    "medium",
    "Complex coding, reasoning and long-running knowledge work",
    {
      simple: "evaluate lower effort",
      specified: "medium",
      demanding: "sweep high and xhigh",
    },
    { default: "adaptive", alwaysOn: true },
  ),
  "claude-fable-5-2": profile(
    "high",
    "Demanding reasoning and long-horizon work after an evaluated capability gap",
    {
      simple: "evaluate lower effort",
      specified: "high",
      demanding: "evaluate xhigh",
    },
    { default: "adaptive", alwaysOn: true },
  ),
});

export function guidanceForModel(id) {
  if (!Object.hasOwn(MODEL_GUIDANCE, id ?? "")) return null;
  return {
    model: id,
    reviewedAt: GUIDANCE_REVIEWED_AT,
    source: GUIDANCE_SOURCES.effort,
    ...MODEL_GUIDANCE[id],
  };
}
export function guidanceStatus(now) {
  const ageDays = Number.isFinite(now)
    ? (now - Date.parse(GUIDANCE_REVIEWED_AT + "T00:00:00Z")) / 86400000
    : NaN;
  return {
    reviewedAt: GUIDANCE_REVIEWED_AT,
    stale: !Number.isFinite(ageDays) || ageDays > GUIDANCE_REVIEW_DAYS,
    effortTransport:
      "request-level unless CLAUDE_CODE_MODEL_CAPABILITIES=per_turn_effort; cache rewrite assumed",
    authority:
      "advice only; runtime capabilities and user access remain authoritative",
  };
}
export function guidanceText({
  model = null,
  runtime = [],
  verifiedIds = [],
  now,
}) {
  const status = guidanceStatus(now);
  const ids = model ? [model] : Object.keys(MODEL_GUIDANCE);
  return [
    `Anthropic guidance reviewed ${status.reviewedAt}${status.stale ? " (review overdue)" : ""}.`,
    ...ids.map((id) => {
      const g = guidanceForModel(id),
        live = runtime.find((m) => m.id === id);
      return g
        ? `${id}: API default ${g.apiDefaultEffort}; bounded implementation ${g.startingEffort.specified}; harder work ${g.startingEffort.demanding}. ${g.purpose}. Runtime efforts: ${live?.efforts?.join(", ") || "not discovered"}. User-confirmed: ${verifiedIds.includes(id) ? "yes" : "no"}.`
        : `${id}: no reviewed model-specific advice; use discovered capabilities, not a guessed alias/default.`;
    }),
    "Effort labels are model-specific; max is unconstrained spending, not a routine requirement. Evaluate quality before lowering effort or changing models.",
    "Thinking uses the output budget. Model/API defaults do not prove a native host's effective effort. Runtime limits and manual pins win.",
    "Cache: model switches rewrite context; a top-level effort change invalidates the cached messages too. Claude Code sends effort per message only when CLAUDE_CODE_MODEL_CAPABILITIES=per_turn_effort is set (first-party API, until the API refuses it); otherwise an effort change rewrites the conversation, so APEX prices effort moves as a rewrite.",
    "Benchmark USD is not subscription quota or a measured success probability. This command does not enable any model or spend credits.",
    ...Object.entries(GUIDANCE_SOURCES).map(([name, url]) => `${name}: ${url}`),
  ].join("\n");
}
