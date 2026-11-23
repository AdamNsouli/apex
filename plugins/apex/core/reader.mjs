// The model-assisted task reader. The local word rules decide alone for
// continuations, slash commands and very short messages; for any other fresh prompt
// APEX asks Haiku at low effort for one tiny rating and merges it with the local
// reading. On the maintainer's 200 hand-labelled prompts the word rules matched the
// labelled tier 96 times; most misses were hard tasks read as everyday and ordinary
// prompts made critical by one risky word.
//
// The call goes to the same provider as the chat, carries only the prompt's text
// (cut to READER_CHARS), has no tools and no history, and is bounded by a timeout.
// Any failure keeps the local reading. Safety rules stay in code: the model can
// raise a tier freely, but a prompt with a local high-risk signal never drops below
// "hard", failures still escalate, and a specified implementation keeps its own steps.

export const READER_MODEL = "haiku";
export const READER_CHARS = 3000;
export const READER_TIMEOUT_MS = 2500;
export const READER_MAX_TOKENS = 300;
const TIERS = ["quick", "everyday", "hard", "critical"];
const TASKS = [
  "coding",
  "agentic_coding",
  "reasoning",
  "knowledge",
  "math",
  "general",
];

export const READER_SYSTEM = `You rate one message a user sent to an AI coding and work assistant, so a router can pick a model. Reply with JSON only, no prose:
{"tier":"quick|everyday|hard|critical","task":"coding|agentic_coding|reasoning|knowledge|math|general","importance":1-5}

tier = the lowest level that would answer it well:
- quick: trivial or mechanical (a short factual question, rename, format, translate, summarise a short text, a yes/no).
- everyday: ordinary work with a clear path (a normal edit, explain code, draft a message, run and report checks).
- hard: needs real judgement or many steps (design or architecture, debugging an unknown cause, a multi-file feature, research and comparison, a long plan, a careful review, anything open-ended like "improve", "perfect", "make it really good").
- critical: a wrong answer is costly: money, legal, medical, exams or university admissions, security, production releases, deleting or migrating real data.
task: coding = writing or explaining code; agentic_coding = changing a project through files, tools and commands; reasoning = analysis, decisions, maths-like logic; knowledge = recall of facts; math = maths; general = anything else.
importance: 1 = throwaway, 5 = high stakes for the user.
Judge the request itself, not the words it quotes. Continuations like "yes" or "do it" inherit earlier context you cannot see: rate them everyday.`;

export function readerWanted({ text, previous, origin, setting = "auto" }) {
  if (setting === "local") return false;
  const t = String(text ?? "").trim();
  if (t.length < 20 || /^\//.test(t)) return false;
  if (previous && /^\s*(yes|continue|go ahead|do it|ok|okay)[.!\s]*$/i.test(t))
    return false;
  return ["composer", "bridge", "sdk"].includes(origin?.kind ?? "composer");
}

export function readerPrompt(text) {
  const t = String(text ?? "").replace(/<[^>]*>/g, " ");
  const body =
    t.length > READER_CHARS
      ? t.slice(0, READER_CHARS * 0.7) +
        "\n[…]\n" +
        t.slice(-Math.floor(READER_CHARS * 0.3))
      : t;
  return "Message:\n<<<\n" + body + "\n>>>";
}

// The model's reply → { tier, task, importance } or null when unusable.
export function parseReading(reply) {
  const m = /\{[^{}]*\}/.exec(String(reply ?? ""));
  if (!m) return null;
  let j;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!TIERS.includes(j.tier)) return null;
  const importance = Number.isInteger(j.importance)
    ? Math.min(5, Math.max(1, j.importance))
    : null;
  return {
    tier: j.tier,
    task: TASKS.includes(j.task) ? j.task : null,
    importance,
  };
}

// Merge a reading into the local intent. The result carries `readerTier`, which
// tierFor uses as the base tier before failure escalation.
export function mergeReading(local, reading) {
  if (!reading) return local;
  let tier = reading.tier;
  // An important task is never answered at the quick tier.
  if (tier === "quick" && (reading.importance ?? 0) >= 4) tier = "everyday";
  // A local high-risk word keeps at least "hard": the model may clear a false
  // alarm ("the word 'contract' in a code comment") but not to the cheap tiers.
  if (local.risk === "high" && TIERS.indexOf(tier) < TIERS.indexOf("hard"))
    tier = "hard";
  const task =
    local.task === "general" && reading.task && reading.task !== "general"
      ? reading.task
      : local.task;
  return {
    ...local,
    task,
    readerTier: tier,
    ...(reading.importance ? { importance: reading.importance } : {}),
  };
}

export function readerText(setting, last) {
  const on = setting !== "local";
  return (
    (on
      ? "APEX reads each fresh prompt with its word rules and one small Haiku (low effort) rating, bounded to " +
        READER_TIMEOUT_MS / 1000 +
        " s; any failure keeps the word rules."
      : "APEX reads prompts with its local word rules only; no model call.") +
    (last
      ? ` Last reading: ${last.source}${last.tier ? " → " + last.tier : ""}${last.ms ? " in " + last.ms + " ms" : ""}.`
      : "") +
    " Use /apex reader auto|local."
  );
}
