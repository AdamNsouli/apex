// Large output guard. Long Bash output that Claude did not bound itself is saved in
// full to a file, and Claude reads the head, the tail, the error-looking lines from
// the middle and the path. On the maintainer's 21 days Bash was 53% of all tool
// output, and every character of a tool result is re-read on every later request
// of that chat, so a cut here is repaid many times over.
//
// Never touched: failed commands (errors are passed through whole), commands that
// bound their own output (head, tail, sed -n, grep -m, wc, awk NR...), deliberate
// file dumps (cat, sed, nl, bat), diffs and patches (git diff/show/log -p), output
// from background commands, images, and anything at or under the limit.

export const OUTPUT_LIMIT = 8000;
export const HEAD_CHARS = 2500;
export const TAIL_CHARS = 3500;
export const MAX_SIGNAL_LINES = 30;

const BOUNDED =
  /(?:^|[|;&]\s*|\s)(?:head|tail|wc|less|more)\b|\bsed\s+-n\b|\bgrep\b[^|;&]*\s-(?:\w*m\s*\d|-max-count)|\bawk\b[^|;&]*\bNR\b|\bjq\b[^|;&]*\blimit\(/;
const DUMP = /^\s*(?:cd\s+[^;&|]+(?:&&|;)\s*)?(?:cat|sed|nl|bat|less)\b/;
const DIFF =
  /\bgit\s+(?:diff|show|format-patch)\b|\bgit\s+log\b[^|;&]*\s-p\b|\bdiff\s+-u\b/;
const SIGNAL =
  /\b(?:error|errors|failed|failure|fail|fatal|exception|traceback|panic|warning|warn|not ok|assert(?:ion)?)\b|✗|✖|\(fail\)/i;

export function wantsTrim({
  command,
  stdout = "",
  stderr = "",
  setting = "trim",
  isError,
  background,
}) {
  if (setting === "off" || isError || background) return false;
  const c = String(command ?? "");
  if (/apex-output/.test(c)) return false;
  if (BOUNDED.test(c) || DUMP.test(c) || DIFF.test(c)) return false;
  return String(stdout).length + String(stderr).length > OUTPUT_LIMIT;
}

// Cut the middle of one stream, keeping head and tail on line boundaries and the
// signal lines from what was cut. Returns { text, cutLines, cutChars }.
export function trimText(text, { head = HEAD_CHARS, tail = TAIL_CHARS } = {}) {
  const s = String(text ?? "");
  if (s.length <= head + tail + 200)
    return { text: s, cutLines: 0, cutChars: 0 };
  let h = s.lastIndexOf("\n", head);
  if (h < head / 2) h = head;
  let t = s.indexOf("\n", s.length - tail);
  if (t < 0 || t > s.length - tail / 2) t = s.length - tail;
  const middle = s.slice(h, t);
  const lines = middle.split("\n");
  const signals = lines
    .filter((l) => SIGNAL.test(l))
    .map((l) => l.slice(0, 300));
  const kept = signals.slice(0, MAX_SIGNAL_LINES);
  return {
    head: s.slice(0, h),
    tail: s.slice(t),
    signals: kept,
    moreSignals: Math.max(0, signals.length - kept.length),
    cutLines: lines.length,
    cutChars: middle.length,
  };
}

export function trimmedOutput({ stdout = "", stderr = "", path }) {
  const out = trimText(stdout);
  const err = trimText(stderr, { head: 1500, tail: 2000 });
  const cutLines = out.cutLines + err.cutLines;
  const cutChars = out.cutChars + err.cutChars;
  const join = (r, name) => {
    if (!r.cutChars) return r.text;
    return (
      r.head +
      `\n\n[APEX: ${r.cutLines} lines (${r.cutChars} chars) of ${name} cut from the middle` +
      (r.signals.length
        ? `; lines from it that look like errors or warnings:\n` +
          r.signals.join("\n") +
          (r.moreSignals ? `\n…and ${r.moreSignals} more` : "")
        : "; none of them look like errors or warnings") +
      `\nFull output: ${path} — read or grep it if you need the rest.]\n\n` +
      r.tail
    );
  };
  return {
    stdout: join(out, "stdout"),
    stderr: join(err, "stderr"),
    cutLines,
    cutChars,
  };
}

export function outputText(setting, stats) {
  const on = setting !== "off";
  return (
    (on
      ? `APEX trims Bash output over ${OUTPUT_LIMIT} characters that the command did not bound itself, keeping the head, tail and error-looking lines, and saves the full output to a file Claude can read. Failed commands, diffs and deliberate file dumps are never cut.`
      : "APEX leaves Bash output as it is.") +
    (stats?.count
      ? ` This chat: ${stats.count} outputs trimmed, ${stats.chars} characters kept out of the context.`
      : "") +
    " Use /apex output trim|off."
  );
}
