import test from "node:test";
import assert from "node:assert/strict";
import {
  summariseOverhead,
  overheadText,
} from "../plugins/apex/core/overhead.mjs";

const usage = {
  context: {
    window: 200000,
    tokens: 90000,
    breakdown: {
      totalTokens: 90000,
      percentage: 45,
      categories: [
        {
          name: "System prompt",
          tokens: 3000,
          kind: "used",
          isDeferred: false,
        },
        { name: "MCP tools", tokens: 9000, kind: "used", isDeferred: false },
        { name: "Memory files", tokens: 6000, kind: "used", isDeferred: false },
        { name: "Messages", tokens: 60000, kind: "used", isDeferred: false },
        { name: "Free space", tokens: 100000, kind: "free", isDeferred: false },
        {
          name: "Deferred tools",
          tokens: 5000,
          kind: "deferred",
          isDeferred: true,
        },
      ],
      mcpTools: [
        { name: "a", serverName: "big", tokens: 2500, isLoaded: true },
        { name: "b", serverName: "big", tokens: 1500, isLoaded: true },
        { name: "c", serverName: "small", tokens: 200, isLoaded: true },
        { name: "d", serverName: "off", tokens: 9999, isLoaded: false },
      ],
      memoryFiles: [
        { path: "/home/x/proj/CLAUDE.md", type: "Project", tokens: 4500 },
        { path: "/home/x/.claude/MEMORY.md", type: "User", tokens: 1200 },
      ],
      skills: {
        totalSkills: 80,
        includedSkills: 60,
        tokens: 3500,
        skillFrontmatter: [],
      },
      slashCommands: { totalCommands: 30, includedCommands: 30, tokens: 900 },
      agents: [{ agentType: "x", source: "s", tokens: 400 }],
    },
  },
};

test("fixed load excludes the conversation, free space and deferred tools", () => {
  const o = summariseOverhead(usage, 5);
  assert.equal(o.fixedTokens, 18000);
  assert.equal(o.messageTokens, 60000);
  assert.equal(o.at, 5);
  assert.equal(o.percent, 45);
});

test("servers are grouped, unloaded ones ignored, paths shortened to file names", () => {
  const o = summariseOverhead(usage);
  assert.deepEqual(
    o.servers.map((s) => [s.name, s.tokens, s.tools]),
    [
      ["big", 4000, 2],
      ["small", 200, 1],
    ],
  );
  assert.deepEqual(
    o.memory.map((m) => m.name),
    ["CLAUDE.md", "MEMORY.md"],
  );
  assert.ok(!JSON.stringify(o).includes("/home/x"));
});

test("advice names only things over fixed thresholds", () => {
  const o = summariseOverhead(usage);
  const text = o.advice.join("\n");
  assert.match(text, /big: 4000 tokens/);
  assert.match(text, /CLAUDE\.md: 4500 tokens/);
  assert.match(text, /skill listing costs 3500/);
  assert.doesNotMatch(text, /small|MEMORY\.md|off/);
});

test("a missing or malformed breakdown reads as no reading, never a crash", () => {
  assert.equal(summariseOverhead(null), null);
  assert.equal(summariseOverhead({ context: { window: 1 } }), null);
  assert.match(overheadText(null), /No context breakdown yet/);
  const o = summariseOverhead({
    context: {
      window: 10,
      breakdown: { categories: [{ name: "x", tokens: "bad", kind: "used" }] },
    },
  });
  assert.equal(o.fixedTokens, 0);
  assert.match(overheadText(o), /Nothing stands out/);
});

// Category names and kinds as Claude Code 2.1.317 reported them for a fresh chat.
test("a real fresh-chat breakdown sums to the host's own total, deferred tools left out", () => {
  const o = summariseOverhead({
    context: {
      window: 1000000,
      breakdown: {
        totalTokens: 34428,
        percentage: 3,
        categories: [
          {
            name: "System prompt",
            tokens: 2282,
            kind: "used",
            isDeferred: false,
          },
          {
            name: "System tools",
            tokens: 29980,
            kind: "used",
            isDeferred: false,
          },
          {
            name: "System tools (deferred)",
            tokens: 19897,
            kind: "deferred",
            isDeferred: true,
          },
          { name: "Skills", tokens: 2166, kind: "used", isDeferred: false },
          {
            name: "Autocompact buffer",
            tokens: 33000,
            kind: "buffer",
            isDeferred: false,
          },
          {
            name: "Free space",
            tokens: 932572,
            kind: "free",
            isDeferred: false,
          },
        ],
        mcpTools: [],
        memoryFiles: [],
        agents: [],
        skills: { totalSkills: 15, includedSkills: 15, tokens: 2166 },
        slashCommands: {
          totalCommands: 15,
          includedCommands: 15,
          tokens: 1403,
        },
      },
    },
  });
  assert.equal(o.fixedTokens, 34428);
  assert.equal(o.messageTokens, 0);
  assert.deepEqual(o.advice, []);
});
