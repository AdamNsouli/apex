// Context budget. Every request re-reads the whole conversation, so in a long chat
// context size times number of requests is most of the usage (on the maintainer's
// 21 days: ~70% at API price ratios, median 333k tokens per request against ~74k
// for a fresh chat). APEX never compacts on its own: after a turn ends with the
// context over a threshold and nothing still running, it offers one line with
// "Compact now" or "Not now". Claude Code's own guidance is the same pair:
// /compact with instructions for what to keep, or /clear between unrelated tasks
// (https://code.claude.com/docs/en/costs).

export const CONTEXT_DEFAULT = 200000;
export const CONTEXT_MIN = 50000;
export const CONTEXT_MAX = 900000;
// After "Not now" (or a shown offer) the next one waits for this much more context.
export const CONTEXT_STEP = 100000;

export const COMPACT_INSTRUCTIONS =
  "Keep: the user's goal and the agreed plan with its next steps; every file created or changed and why; decisions made and the reasons; open questions, unresolved errors and failing checks with their exact messages; the commands that verify the work. Drop: tool output already acted on, superseded drafts, exploration that led nowhere.";

// The stored setting: "off", or the threshold in tokens. Anything else is the default.
export function contextSetting(value) {
  if (value === "off") return "off";
  return Number.isInteger(value) && value >= CONTEXT_MIN && value <= CONTEXT_MAX
    ? value
    : CONTEXT_DEFAULT;
}

// "/apex context 150k", "on", "off", "200000" → a stored setting, or null.
export function parseContextArg(arg) {
  const a = String(arg ?? "")
    .trim()
    .toLowerCase();
  if (a === "off") return "off";
  if (a === "on" || a === "suggest") return CONTEXT_DEFAULT;
  const m = /^(\d+(?:\.\d+)?)\s*(k)?$/.exec(a);
  if (!m) return null;
  const n = Math.round(Number(m[1]) * (m[2] ? 1000 : 1));
  return n >= CONTEXT_MIN && n <= CONTEXT_MAX ? n : null;
}

const k = (n) => Math.round(n / 1000) + "k";

// Decide after a main turn ends. `armedAt` is the context size the next offer waits
// for (null: the first crossing of the threshold). Returns the offer to show (or
// null) and the new `armedAt`.
export function contextOffer({
  setting,
  tokens,
  fixedTokens = null,
  armedAt = null,
  reason = "answer",
  busy = false,
}) {
  const threshold = contextSetting(setting);
  if (threshold === "off" || !Number.isFinite(tokens))
    return { offer: null, armedAt };
  // Below the threshold (a compaction or /clear happened): re-arm.
  if (tokens < threshold) return { offer: null, armedAt: null };
  if (reason !== "answer" || busy) return { offer: null, armedAt };
  if (armedAt !== null && tokens < armedAt) return { offer: null, armedAt };
  const fresh =
    Number.isFinite(fixedTokens) && fixedTokens > 0 && fixedTokens < tokens
      ? fixedTokens
      : null;
  const ratio = fresh ? Math.round((tokens / fresh) * 10) / 10 : null;
  return {
    offer: {
      tokens,
      threshold,
      fresh,
      text:
        `This chat re-reads ${k(tokens)} tokens on every request` +
        (fresh
          ? `; a fresh chat starts near ${k(fresh)} (${ratio}× less per request).`
          : ".") +
        " Compact keeps the plan, changed files and open items.",
    },
    armedAt: tokens + CONTEXT_STEP,
  };
}

export function contextText(setting, tokens = null) {
  const s = contextSetting(setting);
  const now = Number.isFinite(tokens) ? ` This chat: ${k(tokens)}.` : "";
  return s === "off"
    ? "APEX context offers are off. Use /apex context on (200k) or /apex context 150k." +
        now
    : `APEX offers to compact once a turn ends above ${k(s)} tokens, then again every ${k(CONTEXT_STEP)} more. It never compacts on its own. Use /apex context off|on|<N>k.` +
        now;
}
