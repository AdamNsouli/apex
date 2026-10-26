# Changelog

## 0.7.1-beta.1

The publisher line now reads "APEX by Zoran".

The publisher's company was renamed, so the line under the APEX title, the browser header and the companion page show Zoran and its Three Lifts symbol in place of the old name and K mark. The Archivo font licence is removed because it only covered the old glyph. Routing is unchanged.

The hygiene check, plugin validation, Node tests and native tests pass locally; the browser checks run only in CI. Update the marketplace and the plugin, then restart: chats that were already open keep the previous code.

## 0.7.0-beta.1

APEX moves between models, not only efforts.

Three things held routing at the model a chat started on. Only models with exactly the same thinking flags as that model were compared, and Haiku, Sonnet and Opus 5.5 each have different extra flags (Haiku can turn thinking off, Sonnet can think between tools), so they never replaced each other: only the effort changed. A chat that started on a pair the benchmarks do not name (for example no effort set) was not routed at all. And a prompt with a risky word could not go below the starting pair's score or effort, so starting on Opus max kept every such prompt there.

Now every confirmed model is a candidate. Models are compared by thinking mode (adaptive where a model has it), not by every flag. The starting pair is only the reference for receipts and, when benchmark data is more than three days old, the floor; when it has no evidence the pair holding the cache, then the strongest routable pair, stands in. High-risk and twice-failing tasks are held to the critical tier instead of the starting pair.

The test for moving to another model is rewritten. It was "one request on the new model is 5% cheaper than one on the old", computed from upper bounds, and ignored that the new model has to store the whole conversation again. Now staying (five requests on the best acceptable effort of the current model, reading the cache) is compared with moving (five requests on the new model plus one cache write of the whole context). Sports judges the wait and High Quality the score. Missing prices keep the current model; a model with no effort that reaches the floor is left regardless.

Subagents are routed too, under the base mode, each with its own cache memory: search agents (Explore and similar) as quick tasks, others as the main chat's task. An agent that asks for a different model from the session's keeps it. `/apex agents auto|off` (default auto).

`scripts/replay.mjs` replays labelled prompts through the router offline, with no model calls, and reports per mode and starting pair how often model and effort move, how many prompts get less than their labelled tier, and usage and wait against always using the starting pair. On 200 of the maintainer's own prompts (kept off the repository) with the current benchmark data, starting on Opus 5.5 max: Balanced used 28% of always-max usage (37% before), Eco 18% (37% before), with no more under-served important prompts than before; starting on Sonnet 5.5 medium, Balanced moved to Opus on 87% of prompts where it had stayed on Sonnet. The replay also shows that the local classifier rates most hard and critical prompts as everyday, which this release does not change.

The hygiene check, plugin validation, 92 Node tests (8 new) and 29 native tests (1 new; 3 updated for the new behaviour) pass locally; the browser checks run only in CI. No live inference was run. Update the marketplace and the plugin, then restart: chats that were already open keep the previous code.

## 0.6.1-beta.1

More tasks count as simple, so the cheaper model is chosen more often.

Before, a prompt was simple only if it began with "format", "copy", "rename" or "explain this line", so in Balanced nearly everything stayed on the strongest model at a lower effort and the model itself rarely changed. Now a mechanical edit or lookup named by its first word is simple (summarise, translate, proofread, list, define, reword, shorten, convert, sort, count, fix a typo), and so is a short factual question of 80 characters or fewer. A question that asks for judgment, a plan or new work ("should", "best", "why", "write", "build", "plan" and similar) is not simple however short, and risky and complex prompts are unaffected. This is a wording heuristic, not a measure of difficulty.

"proofread" no longer counts as a mathematical proof: the word "proof" is now matched as a whole word.

The hygiene check, plugin and marketplace validation, 84 Node tests (4 new) and 28 native tests pass locally; the browser checks run only in CI. No paid inference, real-key AA ingestion or billing verification was performed.

## 0.6.0-beta.1

Ultracode follows the mode instead of a separate opt-in.

In 0.5.0-beta.1 ultracode was off until `/apex ultracode auto` and then applied to critical tasks in any mode. Now choosing the mode is the opt-in: Sports uses ultracode for hard and critical tasks, High Quality (and Quality once) for critical tasks, and Balanced and Eco never use it. The setting defaults to `auto`; `/apex ultracode off` rules ultracode out in every mode. Ordinary messages are never held, in any mode. The mode descriptions say so, and the held-message notice no longer says "critical".

This changes the default: an installation on Sports or High Quality will start using ultracode for those tasks after updating, which uses far more than a normal request. Everything else about the hold, send and switch-off sequence, and all model and effort routing, is unchanged.

The hygiene check, plugin and marketplace validation, 80 Node tests and 28 native tests pass locally; the browser checks run only in CI. No paid inference, real-key AA ingestion or billing verification was performed. Update the marketplace and the plugin, then restart: chats that were already open keep running the previous code.

## 0.5.0-beta.1

APEX can use ultracode for critical tasks. Off by default.

Ultracode is Claude Code's multi-agent mode. It is a session switch (`/effort ultracode on|off`), not a field of a request, so APEX could not choose it the way it chooses model and effort, and a keyword a plugin adds to a prompt does not opt the turn in. With `/apex ultracode auto`, a newly classified critical task (complex and high risk) typed at an idle prompt is held for a moment: APEX turns ultracode on, sends the message as your own words, and turns ultracode off when that turn ends. `/apex ultracode off` is the default, because ultracode uses far more than a normal request and has no benchmark to judge it by.

Ordinary and hard tasks, continuations such as "yes", slash commands, messages with attachments and messages typed over a running turn are sent as typed. Held routing and pins leave ultracode alone. If a session ends while it is on, the next session start turns it off. `/apex doctor` shows the setting. Routing of model and effort is unchanged.

The hygiene check, plugin and marketplace validation, 78 Node tests (4 new) and 27 native tests (5 new) pass locally; the browser checks run only in CI. The hold, switch-on, send and switch-off sequence was run once in a live session with a throwaway plugin; a real multi-agent run under it was not observed. No paid inference, real-key AA ingestion or billing verification was performed. Update the marketplace and the plugin, then restart: chats that were already open keep running the previous code.

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

Rebuilt the browser as a route workspace with stepped request history, recorded-time view, scoped agents, frozen receipts, guided exact mappings, complete pagination, local licensed fonts, dark/light themes and compact display. Added original APEX vectors and the monochrome publisher mark.

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
