# Changelog

## 0.4.0-beta.1

Routing now follows a data-driven policy and configures itself from the daily refresh.

For each request APEX classifies the task into a tier (quick, everyday, hard or critical), finds the strongest comparable score in the benchmark data and picks the cheapest model/effort pair that reaches a share of it (70%, 88%, 92% or 97%) within a wait limit. Cost is now AA's measured benchmark USD per task, not the token price times the output limit, so a high effort that burns many tokens costs more than a low one. Before, every effort of one model cost the same to the ranking, and Balanced could only choose among the top quarter of scores. Eco asks for 10 points less of the best score, High Quality takes the strongest score and Sports the fastest pair within 3% of it. Nothing in the policy names a model. When the task has no index for every compared pair, general intelligence is used for all of them and the receipt says so.

Effort variants join by themselves for a model whose access you confirmed, so `/apex map-efforts` and `/apex map` are only needed to override. This is a deliberate change from 0.3.0-beta.2, which joined a variant benchmarked with a fallback option on only through a mapping you saved: it now joins it for a confirmed model and marks it as such. Saved mappings still decide for their model. Discovery still never grants access: a model found on the account is unused until you confirm it with the new `/apex confirm-models ID...`, which adds to the confirmed list instead of replacing it.

The daily refresh now records what it changed (new or dropped models, new effort variants, and score, cost, price and speed changes for confirmed models), shows new models in the rail and browser for a week, and prints the record in `/apex doctor`.

Two guards changed. The standard-task percentile floor is gone, because the tier's share of the best score replaces it. A downgrade that changes only the effort no longer needs the cache payback test, since a change of effort keeps the prompt cache; a downgrade to another model still does. Hard, risky, ambiguous and twice-failing tasks still never go below the native score and effort. Benchmark data without cost-per-task figures keeps native settings (reason `cost_evidence_missing`). Receipts record the tier and the index actually used. Reason codes are now `<mode>_policy`; earlier receipts keep their old codes.

The hygiene check, plugin and marketplace validation, 74 Node tests (25 new) and 21 native tests (3 new) pass locally; the browser checks run only in CI. No paid inference, real-key AA ingestion or billing verification was performed. Update the marketplace and the plugin, then restart: chats that were already open keep running the previous code.

## 0.3.0-beta.2

Reliability fixes. No change to the interface or the routing policy.

Benchmark names such as "Claude Sonnet 5.5 (Medium, Default Fallback)" now state their effort, so those variants can be confirmed in the guided mapping form, and `/apex map-efforts RUNTIME_ID` confirms all of a model's exact effort variants in one step. Evidence measured with a fallback option on still joins only through a confirmed mapping, and a confirmed mapping is now checked against the effort the record states.

Open chats share one stored settings record. A chat now adopts newer saved settings before routing and applies its own change on top of them, instead of overwriting the confirmed models, backend and mappings with an older copy. Consent and the Quality once arm stay with each chat.

Model discovery starts its 24-hour wait only when it finds models, so a headless or signed-out session can no longer use the day up. A failed discovery retries after an hour, and a refresh that finds nothing no longer rewrites the saved catalogue.

The hygiene check, 49 Node tests, 18 native tests and the browser checks pass in CI. No paid inference, real-key AA ingestion or billing verification was performed. Update the marketplace and the plugin, then restart: chats that were already open keep running the previous code.

## 0.3.0-beta.1

Replaced the five-tab interface with a 34-column compact native rail, an integrated history/receipt/evidence inspector and contextual setup/consent. The two-row prompt strip preserves other mods and native surveys, adapts to width and avoids duplicate controls while docked. Historical selection and Follow live are explicit. Added honest readiness states and separate mode acknowledgment/dispatch consumption.

Rebuilt the browser as a route workspace with stepped request history, recorded-time view, scoped agents, frozen receipts, guided exact mappings, complete pagination, local licensed fonts, dark/light themes and compact display. Added original APEX vectors and the monochrome Kavren publisher mark.

Added main-only Quality once with atomic consumption, explicit cancellation, unchanged base preference and ordinary guards. Receipt snapshots freeze evidence and pricing at dispatch. Runtime discovery and the first native AA fetch have separate refresh clocks.

Offline routing/transport, official native harness, browser controls and genuine terminal painting were checked. No paid inference, real-key AA ingestion, billing or measured quality/savings verification. Existing 0.2.0-beta.1 remains available.

## 0.2.0-beta.1

Refined the Claude Code integration: a persistent terminal prompt dock, five-tab native inspector, selectable request/tool receipts, readable routing explanations, native credit budget/consent, account/backend/mapping/task controls, and saved full/compact/hidden dock preferences. The dock preserves downstream mod UI and yields to native question surveys. Terminal and desktop pane primitives pass the official native harness; actual desktop paint remains unverified.

Refined the browser console's hierarchy, typography, navigation and mode selector. Added a working compact console, native-inspector command copy, control busy states, fresh responsive screenshots and a visibly labeled native primitive-tree reference. Routing policy and request-boundary semantics are unchanged. No paid inference, real-key AA ingestion or billing verification was performed.

## 0.1.0-beta.2

The detached dashboard now shuts down immediately on ordinary native session exit through its protected Unix bridge. Added an actual starter-process test.

## 0.1.0-beta.1

Initial executable native mod release. Includes main-request model/effort forwarding, dynamic Anthropic/AA adapters, verified account/mapping setup, four live modes, conservative task-quality guards, bounded request/tool receipts, consent and reservation accounting, native controls and an authenticated local dashboard. Original design pictures and sprites are included as design history.

Native middleware and offline transport/browser integration are tested. Live provider/data-key/billing behavior and measured efficiency remain unverified. macOS/Linux/WSL companion only; subagents preserve native settings.
