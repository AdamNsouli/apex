// Learning from bad answers. When you say an answer was wrong, or send the same
// prompt again, the pick that answered it counts against that kind of task
// (coding, general, legal …). Each strike raises the tier APEX routes that kind
// at, so the next pick is stronger; clean answers wear strikes off again.
// Saved in APEX's store, shared by every chat, shown and resettable with
// `/apex learning`. Interrupting a turn is not counted: people interrupt to add
// detail as often as to reject an answer.

export const MAX_STRIKES = 3;
// Clean answers of a kind (a fresh task follows without a complaint) that take
// one strike off.
export const CLEAN_TO_FORGIVE = 3;
const TIERS = ["quick", "everyday", "hard", "critical"];

// Short messages that say the last answer was wrong. Matched at the start, or
// as the whole point of a short message, so "fix the wrong date in the footer"
// is a task, not a complaint.
const COMPLAINT =
  /^(?:no[,.!\s]+|nope[,.!\s]*|hmm[,.\s]+|ugh[,.\s]+)?(?:that(?:'s| is| was)|this(?:'s| is)|it(?:'s| is)|you(?:'re| are))\s+(?:still\s+)?(?:wrong|incorrect|not right|not correct|not what i (?:asked|wanted|meant)|broken|bad)\b|^(?:wrong|incorrect|nope|not right|not quite)\b|^(?:still|it'?s still|that'?s still)\s+(?:broken|failing|wrong|not working)\b|^(?:it|that|this)\s+(?:still\s+)?(?:doesn'?t|didn'?t|does not|did not)\s+work\b|^you\s+(?:missed|broke|got it wrong|misunderstood|ignored)\b|^try again\b|^(?:read|look at) (?:it|that|my message) again\b/i;

const norm = (t) =>
  String(t ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// → "complaint" | "retry" | null
export function badSignal(text, previousText) {
  const t = norm(text);
  if (!t) return null;
  if (t.length <= 400 && COMPLAINT.test(t)) return "complaint";
  // Scheduled tasks and other tagged machine prompts repeat by design.
  const p = norm(previousText);
  if (p && p.length >= 12 && t === p && !t.startsWith("<")) return "retry";
  return null;
}

export function emptyLearning() {
  return { kinds: {}, recent: [] };
}
function clean(l) {
  return l && typeof l === "object" && l.kinds && typeof l.kinds === "object"
    ? { kinds: { ...l.kinds }, recent: Array.isArray(l.recent) ? l.recent : [] }
    : emptyLearning();
}
// One strike against `task`, recording what answered and why it counted.
export function addStrike(learning, { task, signal, pick, at }) {
  const l = clean(learning);
  const k = l.kinds[task] ?? { strikes: 0, clean: 0 };
  l.kinds[task] = {
    strikes: Math.min(MAX_STRIKES, k.strikes + 1),
    clean: 0,
    at,
  };
  l.recent = [
    ...l.recent,
    {
      at,
      task,
      signal,
      model: pick?.model ?? null,
      effort: pick?.effort ?? null,
    },
  ].slice(-20);
  return l;
}
// A clean answer of `task`: every CLEAN_TO_FORGIVE of them take a strike off.
export function addClean(learning, task) {
  const l = clean(learning);
  const k = l.kinds[task];
  if (!k || !k.strikes) return l;
  const n = (k.clean ?? 0) + 1;
  l.kinds[task] =
    n >= CLEAN_TO_FORGIVE
      ? { ...k, strikes: k.strikes - 1, clean: 0 }
      : { ...k, clean: n };
  if (!l.kinds[task].strikes) delete l.kinds[task];
  return l;
}
// Tier steps to add for `task`: one for the first strike, two from the third.
export function learnedSteps(learning, task) {
  const s = clean(learning).kinds[task]?.strikes ?? 0;
  return s >= MAX_STRIKES ? 2 : s ? 1 : 0;
}
export function raiseTier(tier, steps) {
  const i = TIERS.indexOf(tier);
  if (i < 0 || !steps) return tier;
  return TIERS[Math.min(TIERS.length - 1, i + steps)];
}

export function learningText(learning) {
  const l = clean(learning);
  const kinds = Object.entries(l.kinds).filter(([, k]) => k.strikes > 0);
  const lines = [
    "APEX learns from bad answers: saying an answer was wrong, or sending the same prompt again, counts a strike against that kind of task. One strike routes that kind one tier higher, three strikes two tiers. Every " +
      CLEAN_TO_FORGIVE +
      " clean answers of that kind take a strike off. Interrupting a turn does not count.",
  ];
  if (!kinds.length) lines.push("Now: no strikes. Routing is unchanged.");
  else
    lines.push(
      "Now:",
      ...kinds.map(
        ([task, k]) =>
          `  ${task.replaceAll("_", " ")}  ${"●".repeat(k.strikes)}${"○".repeat(MAX_STRIKES - k.strikes)}  ${k.strikes} strike${k.strikes === 1 ? "" : "s"} · +${k.strikes >= MAX_STRIKES ? 2 : 1} tier`,
      ),
    );
  const recent = l.recent.slice(-5);
  if (recent.length)
    lines.push(
      "Recent:",
      ...recent.map(
        (r) =>
          `  ${new Date(r.at).toISOString().slice(0, 16).replace("T", " ")}  ${r.signal}  ${r.task}  ${r.model ?? "unknown"}${r.effort ? " / " + r.effort : ""}`,
      ),
    );
  lines.push("/apex learning reset clears it.");
  return lines.join("\n");
}
