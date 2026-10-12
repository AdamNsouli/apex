export const LEVELS = ["low", "medium", "high", "xhigh", "max"];
export const TASK_INDEX = Object.freeze({
  general: "artificial_analysis_intelligence_index",
  math: "artificial_analysis_intelligence_index",
  coding: "artificial_analysis_coding_index",
  agentic_coding: "artificial_analysis_agentic_index",
  engineering: "artificial_analysis_engineering_index",
  finance: "artificial_analysis_finance_and_accounting_index",
  strategy: "artificial_analysis_strategy_and_ops_index",
  legal: "artificial_analysis_legal_index",
  healthcare: "artificial_analysis_healthcare_and_medical_index",
  economics: "artificial_analysis_economics_index",
});
export const finite = (x) =>
  typeof x === "number" && Number.isFinite(x) ? x : null;
export function runtimeModels(body) {
  if (!Array.isArray(body?.data)) throw new Error("Invalid runtime catalogue");
  return body.data.map((m) => {
    if (typeof m.id !== "string" || typeof m.display_name !== "string")
      throw new Error("Invalid model identity");
    const effort = m.capabilities?.effort;
    return {
      id: m.id,
      name: m.display_name,
      line: m.line ?? null,
      efforts:
        effort?.supported === true
          ? LEVELS.filter((k) => effort[k]?.supported === true)
          : [],
      effortSupported:
        typeof effort?.supported === "boolean" ? effort.supported : null,
      context: finite(m.max_input_tokens),
      outputCap: finite(m.max_tokens),
      thinking: m.capabilities?.thinking?.types ?? null,
      capabilities: m.capabilities ?? null,
    };
  });
}
// A benchmark name states its effort as "(High)" or, when the run used the API's
// refusal fallback, "(Max, Default Fallback)". Anything else in the brackets,
// such as "Non-reasoning, High", is a different thinking mode and stays unparsed.
const EFFORT_NAME = new RegExp(
  "\\((" + LEVELS.join("|") + ")(?:,\\s*([^)]*\\bfallback))?\\)$",
  "i",
);
export function parseEffortName(name) {
  const m = EFFORT_NAME.exec(String(name ?? ""));
  return {
    effort: m ? m[1].toLowerCase() : null,
    qualifier: m?.[2]?.trim() ?? null,
  };
}
// Snapshots saved before fallback names were read have effort null: read it again.
export const withNamedEffort = (a) => {
  if (!a) return a;
  const named = parseEffortName(a.name);
  return {
    ...a,
    effort: a.effort ?? named.effort,
    qualifier: a.qualifier ?? named.qualifier,
  };
};
export function aaModels(body) {
  if (
    !Array.isArray(body?.data) ||
    finite(body.intelligence_index_version) === null
  )
    throw new Error("Invalid AA catalogue");
  return body.data
    .filter((m) => m.model_creator?.name === "Anthropic")
    .map((m) => {
      if (
        typeof m.id !== "string" ||
        typeof m.name !== "string" ||
        typeof m.slug !== "string" ||
        !m.evaluations
      )
        throw new Error("Invalid AA model");
      const p = m.pricing ?? {},
        perf = m.performance ?? {};
      const { effort, qualifier } = parseEffortName(m.name);
      return {
        id: m.id,
        slug: m.slug,
        name: m.name,
        effort,
        qualifier,
        benchmarkVersion: String(body.intelligence_index_version),
        scores: Object.fromEntries(
          Object.entries(TASK_INDEX).map(([t, k]) => [
            t,
            finite(m.evaluations[k]),
          ]),
        ),
        rawEvaluations: m.evaluations,
        prices: {
          input: finite(p.price_1m_input_tokens),
          output: finite(p.price_1m_output_tokens),
          cacheRead: finite(p.price_1m_cache_hit_tokens),
          cacheWrite: finite(p.price_1m_cache_write_tokens),
        },
        benchmarkCostPerTask: finite(
          m.artificial_analysis_intelligence_index_cost?.cost_per_task
            ?.total_cost,
        ),
        latencyMs:
          finite(perf.median_end_to_end_response_time_seconds) === null
            ? null
            : perf.median_end_to_end_response_time_seconds * 1000,
      };
    });
}
// AA publishes one record per effort level, slugged "<runtime id>-<level>" with
// the highest level under the bare runtime id. These pairs are only proposed: the
// caller saves them as explicit mappings, and the effort in the record's own name
// must agree with the level it is proposed for.
export function suggestMappings(runtimeModel, aa) {
  return LEVELS.flatMap((level) => {
    if (!runtimeModel.efforts.includes(level)) return [];
    const slug =
      level === "max" ? runtimeModel.id : runtimeModel.id + "-" + level;
    const a = withNamedEffort(aa.find((x) => x.slug === slug));
    return a?.effort === level
      ? [
          {
            runtimeId: runtimeModel.id,
            aaSlug: slug,
            effort: level,
            qualifier: a.qualifier,
          },
        ]
      : [];
  });
}
// Only exact identities are joined; human name similarity is displayed as a setup
// aid, never routing authority. Where you saved mappings for a model they are the
// whole truth for it. Otherwise the exact effort variants AA publishes for it join
// by themselves (slug "<id>-<level>", the highest level under the bare id, and the
// level the record's own name states must agree), so a new model needs no setup beyond
// confirming access. A variant benchmarked with a fallback option on joins this way
// only for a model whose access you confirmed, and stays marked as such. Failing both,
// the bare slug joins by exact identity.
export function joinCatalogue(
  runtime,
  benchmarks,
  mappings = [],
  verifiedIds = [],
) {
  const allowed = new Set(verifiedIds);
  const aa = benchmarks.map(withNamedEffort);
  return runtime.flatMap((m) => {
    const explicit = mappings.filter((x) => x.runtimeId === m.id);
    const auto = explicit.length ? [] : suggestMappings(m, aa);
    const matches = explicit.length
      ? explicit.map((map) => ({
          a: aa.find((a) => a.slug === map.aaSlug),
          effort: map.effort,
          verified: true,
          source: "user",
        }))
      : auto.length
        ? auto.map((s) => ({
            a: aa.find((a) => a.slug === s.aaSlug),
            effort: s.effort,
            verified: allowed.has(m.id),
            source: "auto",
          }))
        : aa
            .filter((a) => a.slug === m.id)
            .map((a) => ({
              a,
              effort: a.effort,
              verified: false,
              source: "slug",
            }));
    if (!matches.length)
      return [
        {
          ...m,
          runtimeId: m.id,
          effort: null,
          evidence: null,
          exclusions: ["no_exact_benchmark_match"],
          routable: false,
        },
      ];
    return matches.map(({ a, effort, verified, source }) => {
      const exclusions = [];
      if (!a) exclusions.push("mapped_benchmark_missing");
      if (a?.qualifier && !verified)
        exclusions.push("benchmark_qualifier_unconfirmed");
      if (typeof m.effortSupported !== "boolean")
        exclusions.push("effort_capability_unknown");
      if (a?.effort != null && a.effort !== effort)
        exclusions.push("benchmark_effort_mismatch");
      if (!allowed.has(m.id)) exclusions.push("account_not_confirmed");
      if (effort != null && !m.efforts.includes(effort))
        exclusions.push("unsupported_effort");
      if (effort == null && m.effortSupported)
        exclusions.push("benchmark_effort_unknown");
      if (!m.capabilities || !(m.context > 0) || !(m.outputCap > 0))
        exclusions.push("capabilities_incomplete");
      return {
        ...m,
        runtimeId: m.id,
        effort: effort ?? null,
        evidence: a ?? null,
        mappingVerified: source === "user",
        mappingSource: source,
        exclusions,
        routable: exclusions.length === 0,
      };
    });
  });
}
// What a refresh changed, in words a person can act on: models that appeared on or
// left the account, plus new effort variants and score, cost, price or speed changes
// for the models whose access you confirmed (the only ones routing can use). The
// first discovery, with nothing before it, reports no new or dropped models.
export function describeRefresh(before, after, verifiedIds = [], at = null) {
  const idsOf = (r) => new Set((r?.runtime ?? []).map((m) => m.id));
  const was = idsOf(before),
    is = idsOf(after);
  const mine = (slug) =>
    verifiedIds.some(
      (id) => slug === id || LEVELS.some((l) => slug === id + "-" + l),
    );
  const rows = (r) =>
    new Map(
      (r?.aa?.models ?? []).filter((a) => mine(a.slug)).map((a) => [a.slug, a]),
    );
  const old = rows(before),
    now = rows(after);
  const fields = {
    ...Object.fromEntries(
      Object.keys(TASK_INDEX).map((t) => [t, (a) => a.scores?.[t]]),
    ),
    input: (a) => a.prices?.input,
    output: (a) => a.prices?.output,
    "cost per task": (a) => a.benchmarkCostPerTask,
    "latency ms": (a) => a.latencyMs,
  };
  const moved = (name, a, b) => {
    if (a == null && b == null) return null;
    if (a == null || b == null)
      return name + " " + (a ?? "none") + " → " + (b ?? "none");
    const big =
      name in TASK_INDEX
        ? Math.abs(b - a) >= 0.5
        : name === "cost per task"
          ? a
            ? Math.abs(b - a) / a >= 0.1
            : b !== a
          : name === "latency ms"
            ? Math.abs(b - a) >= 2000 && Math.abs(b - a) / a >= 0.3
            : a !== b;
    return big ? name + " " + a + " → " + b : null;
  };
  const changedEvidence = [];
  for (const [slug, next] of now) {
    const prev = old.get(slug);
    if (!prev) continue;
    const changes = Object.entries(fields)
      .map(([name, read]) => moved(name, read(prev), read(next)))
      .filter(Boolean);
    if (changes.length) changedEvidence.push({ slug, changes });
  }
  return {
    at,
    newModels: was.size
      ? [...is].filter((id) => !was.has(id)).slice(0, 20)
      : [],
    droppedModels: was.size
      ? [...was].filter((id) => !is.has(id)).slice(0, 20)
      : [],
    newEvidence: old.size
      ? [...now.keys()].filter((s) => !old.has(s)).slice(0, 20)
      : [],
    changedEvidence: changedEvidence.slice(0, 20),
  };
}
export async function fetchAAPages(fetchPage) {
  const all = [];
  let version = null,
    tier = null;
  for (let page = 1; page <= 20; page++) {
    const body = await fetchPage(page);
    if (
      !body.pagination ||
      body.pagination.page !== page ||
      !Number.isInteger(body.pagination.total_pages) ||
      body.pagination.total_pages < 1
    )
      throw new Error("Invalid AA pagination");
    if (version !== null && version !== body.intelligence_index_version)
      throw new Error("AA methodology changed during refresh");
    version = body.intelligence_index_version;
    tier = body.tier;
    all.push(...aaModels(body));
    if (!body.pagination.has_more) {
      if (page !== body.pagination.total_pages)
        throw new Error("Incomplete AA pages");
      return { models: all, version: String(version), tier };
    }
  }
  throw new Error("AA page limit exceeded; prior snapshot retained");
}
