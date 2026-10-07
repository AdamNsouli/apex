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
      const effort =
        LEVELS.find((k) => new RegExp("\\(" + k + "\\)$", "i").test(m.name)) ??
        null;
      return {
        id: m.id,
        slug: m.slug,
        name: m.name,
        effort,
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
// Only an exact slug match or a user-confirmed version/effort mapping is joined.
// Human name similarity is displayed as a setup aid, never routing authority.
export function joinCatalogue(runtime, aa, mappings = [], verifiedIds = []) {
  const allowed = new Set(verifiedIds);
  return runtime.flatMap((m) => {
    const explicit = mappings.filter((x) => x.runtimeId === m.id);
    const matches = explicit.length
      ? explicit.map((map) => ({
          a: aa.find((a) => a.slug === map.aaSlug),
          effort: map.effort,
          verified: true,
        }))
      : aa
          .filter((a) => a.slug === m.id)
          .map((a) => ({ a, effort: a.effort, verified: false }));
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
    return matches.map(({ a, effort, verified }) => {
      const exclusions = [];
      if (!a) exclusions.push("mapped_benchmark_missing");
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
        mappingVerified: verified,
        exclusions,
        routable: exclusions.length === 0,
      };
    });
  });
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
