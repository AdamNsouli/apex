// What every message of a chat carries before the person types: system prompt and
// tools, memory files, MCP tool declarations, skill and command listings, agents.
// Built from the host's own context breakdown. APEX only reports it; it never
// edits instruction files or switches servers off.
const num = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : 0);
const base = (p) =>
  String(p ?? "")
    .split(/[\\/]/)
    .pop() || "unknown";
const top = (rows, n) =>
  [...rows].sort((a, b) => b.tokens - a.tokens).slice(0, n);

// A loaded MCP server or a long memory file is worth a line of advice only when it
// is a real share of the fixed load; the thresholds are fixed so the same numbers
// always give the same advice.
const SERVER_ADVICE_TOKENS = 3000;
const MEMORY_ADVICE_TOKENS = 4000;

export function summariseOverhead(usage, at = null) {
  const ctx = usage?.context;
  const b = ctx?.breakdown;
  if (!b || !Array.isArray(b.categories)) return null;
  const used = b.categories.filter(
    (c) => c.kind === "used" || c.kind === "deferred",
  );
  const rows = used
    .map((c) => ({
      name: String(c.name),
      tokens: num(c.tokens),
      deferred: c.isDeferred === true,
    }))
    .filter((c) => c.tokens > 0);
  const messages = rows.filter((c) => /message/i.test(c.name));
  const fixed = rows.filter((c) => !/message/i.test(c.name) && !c.deferred);
  const fixedTokens = fixed.reduce((a, c) => a + c.tokens, 0);
  const servers = new Map();
  for (const t of b.mcpTools ?? []) {
    if (t.isLoaded === false) continue;
    const s = servers.get(t.serverName) ?? {
      name: String(t.serverName),
      tokens: 0,
      tools: 0,
    };
    s.tokens += num(t.tokens);
    s.tools++;
    servers.set(t.serverName, s);
  }
  const memory = (b.memoryFiles ?? []).map((f) => ({
    name: base(f.path),
    type: String(f.type ?? ""),
    tokens: num(f.tokens),
  }));
  const skills = b.skills
    ? {
        tokens: num(b.skills.tokens),
        included: num(b.skills.includedSkills),
        total: num(b.skills.totalSkills),
      }
    : null;
  const commands = b.slashCommands
    ? {
        tokens: num(b.slashCommands.tokens),
        included: num(b.slashCommands.includedCommands),
        total: num(b.slashCommands.totalCommands),
      }
    : null;
  const agents = (b.agents ?? []).reduce((a, x) => a + num(x.tokens), 0);
  const advice = [];
  for (const s of top([...servers.values()], 3))
    if (s.tokens >= SERVER_ADVICE_TOKENS)
      advice.push(
        `${s.name}: ${s.tokens} tokens of tool declarations (${s.tools} ${s.tools === 1 ? "tool" : "tools"}) ride along on every message. If you do not use it in this chat, disconnect it.`,
      );
  for (const m of memory)
    if (m.tokens >= MEMORY_ADVICE_TOKENS)
      advice.push(
        `${m.name}: ${m.tokens} tokens loaded on every message. Moving sections you rarely need into a skill or a path-scoped rule would shrink it.`,
      );
  if (skills && skills.tokens >= SERVER_ADVICE_TOKENS)
    advice.push(
      `The skill listing costs ${skills.tokens} tokens (${skills.included} of ${skills.total} skills listed). Plugins you do not use add to it.`,
    );
  return {
    at,
    window: num(ctx.window),
    tokens: num(b.totalTokens ?? ctx.tokens),
    percent: Number.isFinite(b.percentage) ? Math.round(b.percentage) : null,
    fixedTokens,
    messageTokens: messages.reduce((a, c) => a + c.tokens, 0),
    categories: top(fixed, 8),
    servers: top([...servers.values()], 5),
    memory: top(memory, 5),
    skills,
    commands,
    agentTokens: agents,
    advice,
  };
}

export function overheadText(o) {
  if (!o)
    return "No context breakdown yet. Send a message first, then run /apex overhead.";
  const lines = [
    `Every message in this chat re-reads about ${o.fixedTokens} tokens before you type (${o.window ? Math.round((o.fixedTokens / o.window) * 100) : "?"}% of the ${o.window}-token window). Conversation so far: ${o.messageTokens} tokens.`,
  ];
  for (const c of o.categories) lines.push(`  ${c.name}: ${c.tokens}`);
  if (o.servers.length)
    lines.push(
      "MCP servers: " +
        o.servers
          .map(
            (s) =>
              `${s.name} ${s.tokens} (${s.tools} ${s.tools === 1 ? "tool" : "tools"})`,
          )
          .join(", "),
    );
  if (o.memory.length)
    lines.push(
      "Memory files: " +
        o.memory.map((m) => `${m.name} ${m.tokens}`).join(", "),
    );
  if (o.skills)
    lines.push(
      `Skills listing: ${o.skills.tokens} (${o.skills.included} of ${o.skills.total})`,
    );
  if (o.commands) lines.push(`Slash commands listing: ${o.commands.tokens}`);
  if (o.agentTokens) lines.push(`Agent descriptions: ${o.agentTokens}`);
  lines.push(
    o.advice.length
      ? "Worth a look:\n" + o.advice.map((a) => "  - " + a).join("\n")
      : "Nothing stands out as unusually large. These are estimates from Claude Code's own breakdown; APEX changes none of it.",
  );
  return lines.join("\n");
}
