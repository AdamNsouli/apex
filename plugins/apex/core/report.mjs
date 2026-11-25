// "Is APEX changing models?" A small local record of finished requests, kept in
// APEX's own store and shared by every chat: when, what the chat was set to, what
// APEX asked for, and which model actually answered (as Claude reports it). No
// prompt text, paths or outputs. Kept for 35 days, at most 4,000 rows.

export const KEEP_DAYS = 35;
export const KEEP_ROWS = 4000;
const DAY = 86400000;

export function historyRow(at, { original, requested, answered, tier, agent }) {
  return {
    at,
    set: original?.model ?? null,
    req: requested?.model ?? null,
    eff: requested?.effort ?? null,
    ans: answered ?? null,
    tier: tier ?? null,
    agent: Boolean(agent),
  };
}

export function appendHistory(history, row, now) {
  const list = Array.isArray(history) ? history : [];
  return [...list, row]
    .filter((r) => r && Number.isFinite(r.at) && now - r.at < KEEP_DAYS * DAY)
    .slice(-KEEP_ROWS);
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

// → { total, since, models: [{ id, count, share }], days: [{ day, total,
//     models: { id: count } }], changed, kept, mismatched, agents }
export function summariseHistory(history, now, days = 7) {
  const from = now - days * DAY;
  const rows = (Array.isArray(history) ? history : []).filter(
    (r) => r && r.at >= from && r.at <= now,
  );
  const counts = new Map();
  const byDay = new Map();
  for (let i = days - 1; i >= 0; i--)
    byDay.set(dayKey(now - i * DAY), { total: 0, models: {} });
  let changed = 0,
    mismatched = 0,
    agents = 0;
  for (const r of rows) {
    // "Really used" is the model Claude says answered; the request's model when
    // the host did not report one.
    const used = undated(r.ans ?? r.req) ?? "unknown";
    counts.set(used, (counts.get(used) ?? 0) + 1);
    const d = byDay.get(dayKey(r.at));
    if (d) {
      d.total++;
      d.models[used] = (d.models[used] ?? 0) + 1;
    }
    if (r.req && r.set && r.req !== r.set) changed++;
    if (r.ans && r.req && !sameModel(r.ans, r.req)) mismatched++;
    if (r.agent) agents++;
  }
  const total = rows.length;
  return {
    total,
    since: rows.length ? Math.min(...rows.map((r) => r.at)) : null,
    models: [...counts.entries()]
      .map(([id, count]) => ({ id, count, share: total ? count / total : 0 }))
      .sort((a, b) => b.count - a.count),
    days: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
    changed,
    kept: total - changed,
    mismatched,
    agents,
  };
}
// "claude-sonnet-5-5-20261101" and "claude-sonnet-5-5" count as one model.
const undated = (id) => (id ? String(id).replace(/-\d{8}$/, "") : id);
// Claude may report a dated ID ("claude-sonnet-5-5-20261101") for the alias asked.
function sameModel(a, b) {
  return a === b || a.startsWith(b + "-") || b.startsWith(a + "-");
}

const bar = (share, width) => {
  const eighths = Math.round(Math.max(0, Math.min(1, share)) * width * 8);
  return (
    "█".repeat(Math.floor(eighths / 8)) +
    (eighths % 8 ? "▏▎▍▌▋▊▉"[(eighths % 8) - 1] : "")
  ).padEnd(width, "░");
};

// The command's text: the same picture the rail draws, in block characters.
export function reportText(summary, nameOf = (id) => id) {
  if (!summary.total)
    return "APEX report: no finished requests recorded in the last 7 days yet. APEX records them from 0.21 on, in every chat; check back after some use.";
  const pct = (n) => Math.round((n / summary.total) * 100) + "%";
  const width = 24;
  const label = Math.max(...summary.models.map((m) => nameOf(m.id).length));
  const peak = Math.max(1, ...summary.days.map((d) => d.total));
  return [
    `APEX report · last 7 days · ${summary.total} requests`,
    "",
    "Model that answered",
    ...summary.models.map(
      (m) =>
        `  ${nameOf(m.id).padEnd(label)}  ${bar(m.share, width)}  ${pct(m.count)} (${m.count})`,
    ),
    "",
    `APEX changed the model  ${bar(summary.changed / summary.total, width)}  ${pct(summary.changed)} (${summary.changed} of ${summary.total})`,
    `Kept your setting       ${bar(summary.kept / summary.total, width)}  ${pct(summary.kept)} (${summary.kept})`,
    "",
    "Requests per day",
    ...summary.days.map(
      (d) => `  ${d.day.slice(5)}  ${bar(d.total / peak, width)}  ${d.total}`,
    ),
    "",
    [
      summary.agents ? `${summary.agents} were subagent requests.` : "",
      summary.mismatched
        ? `${summary.mismatched} answered by a different model than APEX asked for.`
        : "Every answer came from the model APEX asked for.",
      "Counts only requests while APEX 0.21+ was installed; nothing leaves this computer.",
    ]
      .filter(Boolean)
      .join(" "),
  ].join("\n");
}
