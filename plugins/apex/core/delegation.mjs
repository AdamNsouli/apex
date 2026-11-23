// Delegation. A subagent starts with a small context and APEX routes search agents
// as quick tasks (a cheaper model), so exploration sent to one costs a fraction of
// the same calls in a long main chat, where each call re-reads everything. On the
// maintainer's 21 days, 122 long chats (context ≥ 100k) ran 4+ searches in a row in
// the main chat and then 404 more, re-reading about 126M tokens; the main chat
// started an Agent 46 times in all. Mods cannot force a subagent, so APEX attaches
// one hidden note at the right moment and lets Claude decide.

export const EXPLORE_STREAK = 4;
export const EXPLORE_CONTEXT = 100000;
const SEARCH_TOOLS = new Set(["Read", "Grep", "Glob", "LS", "NotebookRead"]);
const SEARCH_BASH =
  /^\s*(?:cd\s+[^;&|]+(?:&&|;)\s*)?(?:rg|grep|find|ls|fd|cat|sed\s+-n|head|tail|wc|tree|git\s+(?:log|show|grep|ls-files|blame))\b/;

export const isExploration = ({ tool, command, isReadOnly }) =>
  SEARCH_TOOLS.has(tool) ||
  (tool === "Bash" &&
    (isReadOnly === true || SEARCH_BASH.test(String(command ?? ""))));

const k = (n) => Math.round(n / 1000) + "k";
export const exploreNote = (tokens) =>
  `APEX: this chat carries about ${k(tokens)} tokens, and every further search here re-reads all of it. If more searching or reading is still needed, hand it to one Explore subagent (Agent tool, subagent_type "Explore") with a precise question, and ask for file paths with line numbers and a short conclusion only; APEX runs search agents on a cheaper model. Keep edits and decisions here. Ignore this if you already have what you need.`;

// One step of the main chat's tool stream → { state, note }. The note is given at
// most once per prompt, after EXPLORE_STREAK exploration calls in a row.
export function exploreStep(state, call, { tokens, agents = "auto" } = {}) {
  const s = state ?? { streak: 0, noted: false };
  if (agents === "off" || call.agentId) return { state: s, note: null };
  if (!isExploration(call)) return { state: { ...s, streak: 0 }, note: null };
  const streak = s.streak + 1;
  if (!s.noted && streak >= EXPLORE_STREAK && (tokens ?? 0) >= EXPLORE_CONTEXT)
    return { state: { streak, noted: true }, note: exploreNote(tokens) };
  return { state: { ...s, streak }, note: null };
}

// Best (and Max Power once): a big task split for speed and quality.
export const teamNote = () =>
  "APEX: this is a big task. Split independent parts across a small team of parallel subagents (Agent tool), each with a bounded, non-overlapping job and a clear deliverable. Send searching and reading to Explore agents that return paths and conclusions only (APEX runs them on a cheaper model). Keep design decisions and edits that touch the same files in this chat. Before finishing, have one fresh reviewer subagent check the result against the request and report concrete defects only.";

// A critical software change in Balanced or Best: one independent review.
export const reviewNote = () =>
  "APEX: a wrong result here is costly. When the change is made, before you report it done, start one reviewer subagent (Agent tool) with the request and the diff, asking for concrete defects with file and line only; fix what it confirms. One reviewer, not a team.";

export function wantsReview({
  mode,
  tier,
  task,
  execution,
  agents = "auto",
  fresh,
}) {
  return (
    fresh === true &&
    agents === "auto" &&
    tier === "critical" &&
    ["balanced", "best"].includes(mode) &&
    ["coding", "agentic_coding"].includes(task) &&
    execution !== "specified"
  );
}
