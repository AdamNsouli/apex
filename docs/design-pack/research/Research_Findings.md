# Research findings — 7 October 2026

## Scope and screening

[Public mods catalogue](https://github.com/karanb 192/awesome-claude-code-mods/blob/main/catalogue.md), dated 6October and scanned against Claude Code 2.1.291:2,685 listings across 1,312 candidate repositories. Parsed every row inside its scan section;374 matched routing/effort/timeline/cost/usage keywords. [Catalogue_Screening.json](./Catalogue_Screening.json) preserves method, full-source hash and relevant names/links. Broad keyword matches include unrelated tools; matching is not endorsement. The catalogue is independent and GitHub discovery is incomplete. Repository stars do not establish mod quality.

The following comparisons are based on source/documentation inspection, not installing or benchmarking every mod. No existing tool was found in the examined shortlist that establishes all requested functions plus dynamic AA task evidence and truthful subscription billing. This is a scoped finding, not a universal claim.

| Reference | Observed useful pattern | Gap for this request |
|---|---|---|
|[Jev Gate](https://github.com/MongLong 0214/jev-gate)|Native main model+effort rewrite, policy/receipts; release 0.8.11 source checked in earlier session.|Does not establish requested AA-driven product/UI/account controls; use integration pattern, original code.|
|[effort-router](https://github.com/totally-tim/effort-router)|Shadow/enforce modes, conservative uncertainty floors, manual precedence, request effort receipt.|Effort focus; default external TypeSafe classifier and data disclosure; APEX defaults no third-party inference.|
|[effort-cycle](https://github.com/Anerco/effort-cycle-mod)|Mid-work per-agent effort controls, native footer feedback.|Manual effort UI, generation-specific defaults in current implementation; not complete automatic main model router.|
|[Flightdeck](https://github.com/scasella/claude-flightdeck)|Native live timeline, agents, cost/context evidence.|Visibility does not itself change main model/effort; use compact truthful event design.|
|[agent-flow](https://github.com/Charlie 0113-T/claude-agent-flow)|Agent-flow visibility reference.|Not verified as full automatic main request optimizer; separate observation from enforcement.|
|[cctop](https://github.com/tomstagl/cctop)|Local usage/context/cache coach and native pane; useful evidence/provenance design.|Broad observer/coach rather than all specified controls and AA variant routing.|
|[jev-router](https://github.com/xafold/jev-router)|Proxy model/effort routing, catalogue refresh and cache payback reasoning.|Wrapper/proxy with external classifier, not the desired native mod; published outcome claims were not independently reproduced.|
|[Switchboard](https://github.com/ruban-24/switchboard)|Model/effort wrapper approach from earlier research.|Conversation pair held fixed; does not satisfy live next-step controls.|
|[Claude router](https://github.com/serhiileniv/claude-router)|API routing proxy alternative from earlier research.|Separate inference transport/billing, not selected architecture.|
|[Model-router plugin](https://github.com/nobodyohm-web/claude-code-model-router)|Delegation model choices from earlier research.|Subagent selection is not main request switching.|

Additional catalogue UI references include [token-ledger](https://github.com/Arunjay 4213/claude-mods/tree/main/plugins/token-ledger), [quota-meter](https://github.com/Arunjay 4213/claude-mods/tree/main/plugins/quota-meter), [HUD](https://github.com/hoobnn/hoobnn-agent-mods/tree/main/claude-code/hud) and [receipt](https://github.com/hoobnn/hoobnn-agent-mods/tree/main/claude-code/receipt). These are discovered references, not all source-audited or runtime-verified. We do not copy their code/art or imply compatibility simply because the catalogue scanner validates a manifest.

## Primary capability sources

[Official mods reference](https://code.claude.com/docs/en/plugins/mods/reference) and [events guide](https://code.claude.com/docs/en/plugins/mods/events): native request rewriting/streamed hooks and host-managed UI are the relevant integration. [Public declaration file](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts) was fetched live. Main `TurnStepInput` contains model and rewritable effort, pinned turn/index/agent/messageCount. Results include reported usage. Command run queues until idle; immediate mod controls must not await a billing command inside the request hook. Opaque first-party authorization handles avoid credential scraping. Build against locally generated types because early-access APIs change.

[Anthropic model-list API](https://platform.claude.com/docs/en/api/models/list): model discovery/capabilities are account/backend scoped. API model availability is not subscription billing entitlement. [Effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort): support varies by model/variant and beta; capability checks matter. Do not hardcode today's model generation or infer high effort always wins.

[Claude commands](https://code.claude.com/docs/en/commands): usage credits are an account/billing workflow. No inspected documented mod method provides a universal silent account billing toggle. That is why APEX separates routing consent, cap and account state.

## Artificial Analysis evidence and limits

[Requested leaderboard](https://artificialanalysis.ai/leaderboards/models), [Data API tiers](https://artificialanalysis.ai/data-api) and [API documentation](https://artificialanalysis.ai/data-api/docs) were examined. Use official keyed API rather than HTML scraping. Free endpoint supplies headline indices, capability indices and pricing/performance fields; tier-specific detail may be absent. Benchmarks/effort variants and methodology versions must match before comparison. Cost/task describes AA's evaluation tasks, not arbitrary user work. Missing values aren't zeros. Its benchmark scores do not establish success probabilities for a repository.

At inspection, free API was 100requests/24h and internal use with attribution/no redistribution; Pro had restricted external use, commercial redistribution separately licensed. Respect current terms at release; code publication does not authorize republishing data. Every dashboard evidence view includes attribution/time/methodology. The pack intentionally contains no AA dataset or real scores. Broad domain strengths follow actual supplied benchmark categories, not generated marketing descriptions.

## Design conclusions (our inference)

Use native `turn.step` enforcement, minimal pane, optional local dashboard, background cached catalogue, exact variant join, conservative unknown behavior, and receipts that distinguish planned/requested/response facts. Sports is a chosen near-best quality/latency policy, not a source-backed claim of optimality. Mathematical utility weights and budget defaults are original product hypotheses to evaluate. The supplied screenshots are synthetic UI evidence only. These boundaries make the eventual mod reviewable and publishable without pretending a prompt solves external credentials, account capabilities or data rights.
