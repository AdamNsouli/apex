import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runtimeModels,
  aaModels,
  joinCatalogue,
  fetchAAPages,
} from "../plugins/apex/core/catalogue.mjs";
import {
  route,
  initialControl,
  applyControl,
  classifyIntent,
  estimatedCost,
  Ledger,
} from "../plugins/apex/core/router.mjs";
import { selectPair } from "../plugins/apex/core/scoring.mjs";
const evidence = (slug, score, effort = "high") => ({
  id: slug,
  slug,
  name: slug,
  effort,
  benchmarkVersion: "synthetic",
  scores: { general: score, agentic_coding: score },
  prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
  latencyMs: 1000,
});
const runtime = ["a", "b"].map((id) => ({
  id,
  name: id,
  efforts: ["high"],
  effortSupported: true,
  context: 100000,
  outputCap: 1000,
  capabilities: {},
}));
const models = joinCatalogue(
  runtime,
  [evidence("a", 40), evidence("b", 60)],
  [],
  ["a", "b"],
);
const options = () => ({
  original: { model: "a", effort: "high" },
  control: {
    ...initialControl(),
    mode: "quality",
    backend: "subscription",
    verifiedIds: ["a", "b"],
  },
  intent: {
    task: "general",
    risk: "normal",
    difficulty: "standard",
    failures: 0,
  },
  models,
  fetchedAt: 1000000000,
  now: 1000000000,
  inputTokens: 1000,
});
test("real pair selection changes model", () =>
  assert.equal(route(options()).pair.model, "b"));
test("manual hold dominates quality", () => {
  const o = options();
  o.control.routing = "manual_hold";
  assert.equal(route(o).pair.model, "a");
});
test("unknown account prevents switch", () => {
  const o = options();
  o.control.backend = "unknown";
  assert.equal(route(o).reason, "backend_not_confirmed");
});
test("API consent is required", () => {
  const o = options();
  o.control.backend = "api";
  assert.equal(route(o).reason, "paid_routing_consent_required");
});
test("concurrent reservation enforces estimate budget", () => {
  const o = options();
  o.control = {
    ...o.control,
    backend: "api",
    creditsConsent: true,
    budgetUsd: 0.004,
  };
  o.reservedUsd = 0.002;
  assert.equal(route(o).reason, "api_equivalent_budget");
});
test("stale snapshot disables automatic switch", () => {
  const o = options();
  o.now += 8 * 86400000;
  assert.equal(route(o).reason, "evidence_missing_or_expired");
});
test("missing context is not message count", () => {
  const o = options();
  o.inputTokens = null;
  assert.equal(route(o).reason, "context_tokens_unknown");
});
test("unsupported effort excluded", () => {
  const joined = joinCatalogue(runtime, [evidence("a", 40, "max")], [], ["a"]);
  assert.equal(joined[0].routable, false);
  assert.ok(joined[0].exclusions.includes("unsupported_effort"));
});
test("new model without exact join is quarantined", () =>
  assert.equal(
    joinCatalogue(
      [{ ...runtime[0], id: "new-generation" }],
      [evidence("a", 40)],
      [],
      ["new-generation"],
    )[0].routable,
    false,
  ));
test("new generation exact mapping works without code change", () =>
  assert.equal(
    joinCatalogue(
      [{ ...runtime[0], id: "unknown-new" }],
      [evidence("aa-new", 70)],
      [{ runtimeId: "unknown-new", aaSlug: "aa-new", effort: "high" }],
      ["unknown-new"],
    )[0].routable,
    true,
  ));
test("AA null prices remain null", () => {
  const result = aaModels({
    intelligence_index_version: 4.3,
    data: [
      {
        id: "fake",
        name: "fake (high)",
        slug: "fake",
        model_creator: { name: "Anthropic" },
        evaluations: { artificial_analysis_intelligence_index: 50 },
        pricing: { price_1m_input_tokens: null },
        performance: {},
      },
    ],
  });
  assert.equal(result[0].prices.input, null);
  assert.equal(result[0].scores.coding, null);
});
test("runtime capability flags determine efforts", () =>
  assert.deepEqual(
    runtimeModels({
      data: [
        {
          id: "future",
          display_name: "Future",
          capabilities: {
            effort: {
              supported: true,
              low: { supported: true },
              max: { supported: false },
            },
          },
        },
      ],
    })[0].efforts,
    ["low"],
  ));
test("partial catalogue refresh rejects", async () =>
  await assert.rejects(
    fetchAAPages(async (page) => ({
      intelligence_index_version: 4.3,
      pagination: { page, total_pages: 21, has_more: true },
      data: [],
    })),
    /page limit/,
  ));
test("concurrent methodology change rejects", async () =>
  await assert.rejects(
    fetchAAPages(async (page) => ({
      intelligence_index_version: page === 1 ? 4.3 : 5,
      pagination: { page, total_pages: 2, has_more: page === 1 },
      data: [],
    })),
    /methodology/,
  ));
test("revision conflict does not silently update mode", () =>
  assert.throws(
    () =>
      applyControl(initialControl(), {
        kind: "mode",
        mode: "sports",
        expectedRevision: 3,
      }),
    /conflict/,
  ));
test("unknown command never runs", () =>
  assert.throws(
    () =>
      applyControl(initialControl(), {
        kind: "exec",
        command: "bad",
        expectedRevision: 0,
      }),
    /invalid/,
  ));
test("credit consent does not set billing entitlement", () =>
  assert.equal(
    applyControl(initialControl(), {
      kind: "credits",
      allowed: true,
      budgetUsd: 1,
      expectedRevision: 0,
    }).accountBilling,
    undefined,
  ));
test("high risk and continuations retained", () => {
  const intent = classifyIntent("implement production authentication");
  assert.equal(intent.risk, "high");
  assert.deepEqual(classifyIntent("continue", intent), intent);
});
test("cost buckets exclude double counting", () =>
  assert.equal(estimatedCost(evidence("a", 1), 100, 20, 100, 0), 0.00015));
test("missing cache price cannot become zero", () =>
  assert.equal(
    estimatedCost(
      {
        ...evidence("a", 1),
        prices: { input: 1, output: 2, cacheRead: null, cacheWrite: null },
      },
      100,
      20,
      100,
      0,
    ),
    null,
  ));
test("ledger reconciles reservation and sanitizes usage", () => {
  const l = new Ledger();
  l.begin("x", { apexRequested: { model: "a" } }, 1);
  l.finish(
    "x",
    { model: "a", input_tokens: 100, output_tokens: 20, secret: "hidden" },
    0.2,
  );
  assert.equal(l.reservedUsd, 0);
  assert.equal(l.spentUsd, 0.2);
  assert.equal(l.events[0].usage.secret, undefined);
});
test("benchmark methods cannot be mixed", () =>
  assert.equal(
    selectPair(
      [
        { model: "a", rawScore: 1, benchmarkVersion: "a" },
        { model: "b", rawScore: 2, benchmarkVersion: "b" },
      ],
      "quality",
    ).kind,
    "hold",
  ));
test("unknown cost retains budget reservation and is not recorded as zero", () => {
  const l = new Ledger();
  l.begin("unknown", {}, 0.5);
  l.finish("unknown", null, null, "error");
  assert.equal(l.reservedUsd, 0.5);
  assert.equal(l.spentUsd, 0);
  assert.equal(l.unknownCosts, 1);
  assert.equal(l.events[0].observedUsd, null);
  l.finish("unknown", null, 0.2);
  assert.equal(l.spentUsd, 0);
});
test("changed thinking profile is not silently routed", () => {
  const o = options();
  o.models = o.models.map((m) => ({
    ...m,
    thinking:
      m.runtimeId === "a"
        ? { adaptive: { supported: true } }
        : { enabled: { supported: true } },
  }));
  assert.equal(route(o).pair.model, "a");
});
test("high risk never sacrifices baseline quality", () => {
  const o = options();
  o.intent = { ...o.intent, risk: "high" };
  o.control.mode = "eco";
  o.models = o.models.map((m) => ({
    ...m,
    evidence: {
      ...m.evidence,
      scores: { general: m.runtimeId === "a" ? 60 : 40 },
    },
  }));
  assert.equal(route(o).pair.model, "a");
});
test("AA variant effort is parsed, never guessed from model line", () =>
  assert.equal(
    aaModels({
      intelligence_index_version: 4.3,
      data: [
        {
          id: "x",
          name: "Future (xhigh)",
          slug: "x",
          model_creator: { name: "Anthropic" },
          evaluations: {},
        },
      ],
    })[0].effort,
    "xhigh",
  ));
test("missing cache pricing cannot produce a free cache bucket", () =>
  assert.equal(
    estimatedCost({ prices: { input: 1, output: 2 } }, 100, 20, 100, 0),
    null,
  ));
test("prototype property is not a real mode", () =>
  assert.throws(
    () =>
      applyControl(initialControl(), {
        kind: "mode",
        mode: "constructor",
        expectedRevision: 0,
      }),
    /invalid/,
  ));
test("known benchmark effort cannot be remapped to a different effort", () => {
  const r = joinCatalogue(
    runtime,
    [evidence("a", 40, "high")],
    [{ runtimeId: "a", aaSlug: "a", effort: "medium" }],
    ["a"],
  );
  assert.ok(r[0].exclusions.includes("benchmark_effort_mismatch"));
});
test("unknown effort capability remains unknown", () =>
  assert.equal(
    runtimeModels({
      data: [{ id: "future", display_name: "Future", capabilities: {} }],
    })[0].effortSupported,
    null,
  ));
test("hysteresis retains the previously dispatched eligible pair, not the native fallback", () => {
  const o = options();
  o.control.mode = "eco";
  o.models = [
    ...o.models.map((m) =>
      m.runtimeId === "b"
        ? {
            ...m,
            evidence: {
              ...m.evidence,
              prices: { input: 5, output: 10, cacheWrite: 5, cacheRead: 1 },
            },
          }
        : m,
    ),
    {
      ...o.models[1],
      runtimeId: "c",
      id: "c",
      evidence: { ...o.models[1].evidence, id: "c", slug: "c" },
    },
  ];
  o.lastModel = "b";
  o.lastEffort = "high";
  o.stepsOnModel = 1;
  const r = route(o);
  assert.equal(r.pair.model, "b");
  assert.equal(r.reason, "switch_hysteresis");
});
