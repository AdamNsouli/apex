# Routing policy — 0.12.0-beta.1

APEX compares model/effort pairs using benchmark evidence. The policy does not establish which model will succeed on an individual task. It contains no preferred model name: refreshed scores, measured benchmark cost and latency determine the pick. Offline replays and synthetic hook tests verify the policy, not real task quality or subscription savings.

1. Respect manual hold, settings/environment pins, confirmed backend and confirmed model IDs. Retain native settings when required evidence, capabilities, current context usage or account access is unknown. Discovery alone does not grant model access.
2. Join exact model and effort identities to comparable benchmark records. Saved mappings take precedence; otherwise exact effort-qualified records join automatically when their names agree. Runtime capabilities determine supported effort and context/output limits. Unsupported, unmatched and unconfirmed pairs are excluded.
3. Use the task index only when every compared pair and the reference pair have it; otherwise use general intelligence for all. Compare only the same reported major.minor methodology version. Coding and agentic indices can be supplemented by the dated public-page snapshot only for its matching index version. The receipt records the index actually used.
4. Consider all confirmed compatible models, with sufficient context and the reference's thinking mode. The original native pair is the reference, falling back to the pair holding the cache, then the strongest routable pair if its evidence is missing. After 72 hours benchmark data cannot lower the reference score; after seven days switching stops.
5. Classify reasoning demand separately from risk. Ordinary unresolved high-risk tasks and tasks with two failures use critical; complex tasks use hard; simple low-risk requests use quick; other requests use everyday. A concretely specified software implementation starts at everyday, never quick, even when its risk label is high. One failed tool/check promotes it to hard; two promote it to critical. The risk label, approval instructions and every routing guard remain intact.
6. Apply the mode's floor, wait limit and value rule below. Missing benchmark cost prevents ranking. Missing latency does not prove a pair too slow. When all acceptable pairs exceed the wait limit, choose the fastest acceptable pair. These are benchmark-index heuristics, not success probabilities.
7. Avoid model flapping and unproductive cache moves. Ordinary eligible changes normally wait two steps. A model change must repay storing the conversation over five benchmark-equivalent requests, counting score and cost in value modes; Max Power once requires higher score. A model whose efforts cannot meet the floor is replaced directly. Missing cache prices keep the current model when it still qualifies. Effort-only changes preserve the cache.
8. Before changing a direct-API request, require APEX credit consent and reserve the upper token-cost forecast against the configured estimate budget. Unknown costs retain their reservation. This budget governs APEX routing, not all native Claude spending. It does not buy credits or activate account extra usage.

| Tier | Floor, share of strongest score | Worth of one score point | Benchmark wait limit |
| --- | --- | --- | --- |
| Quick | 40% | $0.03 | 30 s |
| Everyday | 60% | $0.15 | 60 s |
| Hard | 80% | $0.40 | 150 s |
| Critical | 90% | $1.20 | 300 s |

Balanced uses these values. Save values one score point at 70% of Balanced; critical work keeps at least Balanced's floor and point worth. Best values a point at six times Balanced, raises the floor by ten percentage points and doubles the wait limit. Eligible pairs compete on score minus benchmark cost divided by the worth of a score point. Max Power once selects the strongest eligible pair regardless of cost or wait, subject to the same guards. It applies only to one main dispatch, never a worker, and is consumed even if a guard holds native settings.

## Recognizing specified execution

The local deterministic classifier requires a software-change request, a source/specification path and corroborating instructions. A supplied/approved plan needs at least two groups of evidence: acceptance checks, preservation constraints and staged/file-level steps. An exact bounded replacement needs a path and at least one such group. Length, a path or a generic request to follow instructions is insufficient.

Explicit unresolved architecture, root-cause or competing-design work blocks this classification. Leading requests to design, investigate, diagnose, research, review or audit also remain judgment work. Software work is classified before incidental medical/legal vocabulary in its constraints; the risk signal is retained separately. Short continuations retain the prior context, while a newly classified request replaces it. This is a conservative text heuristic, not semantic proof that a plan is complete; an unrecognized handoff retains ordinary routing.

Fresh specified tasks in Balanced/Save receive a note to follow the supplied plan with one main agent, reuse research and investigate only material gaps or failures. This is guidance to Claude, not a hard block on native tools or a guarantee against fan-out. The user can still explicitly request parallel work. There is no separate classifier model call.

## Workers and Ultracode

Workers use the base mode and their own cache history. Positively labelled workflow mappers/searchers receive an everyday specified-implementation budget; reviewer, architect, security, diagnostic and unknown descriptions retain the parent risk/difficulty without inheriting its specified-execution tag. Failed worker tools escalate that worker's tier. Existing Explore/lookup types use quick; Save also uses quick for other non-critical helpers unless their parent is specified. A worker requesting a model different from the native main model keeps that choice. Turning agent routing off leaves native workers alone and suppresses APEX's parallel nudge; it does not disable Claude's tools.

Only Best and Max Power once can automatically enable Ultracode, for hard/critical tasks. Balanced and Save never do. The off switch rules it out everywhere. A qualifying fresh idle-composer prompt without attachments is held, the session switch is enabled, the original message is submitted, and the switch is disabled when its turn ends. Continuations, slash commands, running-turn input, held routing and pins do not trigger this sequence. Restart recovery disables an interrupted APEX-owned switch. Ultracode has no benchmark and can use far more than one request.

Only Best/Max Power once can inject the alternative parallel-agent note when Ultracode cannot be used. It asks for a small team, bounded non-overlapping tasks and concise findings. Balanced/Save receive no automatic parallel-agent nudge.

## Refresh, receipts and limits

Signed-in sessions refresh account discovery and benchmarks at most daily, recording changed evidence. Partial refreshes retain the prior snapshot. New account models wait for user confirmation. Closed sessions do not run a background monitor.

Receipts record original/requested pair, reason, mode/revision, task, risk, execution classification, tier, score basis, ranked comparisons, response-reported model and known token-cost equivalents. Evidence is frozen for historical receipts. Effective provider effort and actual subscription charges remain unknown. Benchmark USD/task, request forecasts and observed token-cost equivalents are separate quantities. APEX performs no automatic inference retry and does not prove equal task quality or a particular usage saving.
