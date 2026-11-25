// Effort step by step within a task. Each main-chat step after the first looks at
// the tool calls of the step before it:
// - any tool error → "recover": one effort notch higher for this step, on the
//   same model (quality first, like a measured capability gain);
// - only clean read/search calls → "routine": one notch lower, but only while it
//   still meets the task's floor, outside critical work and repeated failures,
//   and only when Claude Code sends effort per message (per_turn_effort), since
//   otherwise each effort change rewrites the cached conversation;
// - anything else → no step hint; the task's own pick applies.
import { isExploration } from "./delegation.mjs";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export function emptyStep() {
  return { tools: 0, errors: 0, explore: 0 };
}
export function addTool(step, { tool, command, isReadOnly, isError }) {
  const s = step ?? emptyStep();
  return {
    tools: s.tools + 1,
    errors: s.errors + (isError ? 1 : 0),
    explore:
      s.explore +
      (!isError && isExploration({ tool, command, isReadOnly }) ? 1 : 0),
  };
}
// → "recover" | "routine" | null for step `index` given the previous step.
export function stepHint(index, previous) {
  if (!index || !previous || !previous.tools) return null;
  if (previous.errors) return "recover";
  if (previous.explore === previous.tools) return "routine";
  return null;
}
// "per_message" when Claude Code sends effort with each message (keeps the
// cache), "per_request" otherwise.
export function effortCacheModeFrom(capabilities) {
  return /\bper_turn_effort\b/.test(String(capabilities ?? ""))
    ? "per_message"
    : "per_request";
}
const rank = (e) => EFFORTS.indexOf(e ?? "");
// The same model one notch up (recover) or down (routine) from `winner`, from
// `pool`, or null. Unknown or default efforts are left alone.
export function stepPair(winner, pool, direction) {
  const i = rank(winner?.effort);
  if (i < 0) return null;
  const same = pool
    .filter((p) => p.model === winner.model && rank(p.effort) >= 0)
    .sort((a, b) => rank(a.effort) - rank(b.effort));
  return direction === "recover"
    ? (same.find((p) => rank(p.effort) > i) ?? null)
    : (same.filter((p) => rank(p.effort) < i).at(-1) ?? null);
}
