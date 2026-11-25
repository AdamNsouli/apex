# Changelog

## 0.21.0-beta.1

New: `/apex report`, the "is it working" view.

- Each finished request adds one row to a local record in APEX's store, shared by every chat: time, the chat's model setting, the model and effort APEX asked for, the model Claude reports answered, the tier, and whether it was a subagent. No prompt text, paths or outputs. Rows older than 35 days are dropped; at most 4,000 rows.
- `/apex report` prints the last 7 days as block charts: model that answered (dated IDs count as their model), APEX changed the model vs kept your setting, and requests per day. It says when an answer came from a different model than APEX asked for.
- The rail gets a "This week" view with the same charts drawn natively: stacked model bar, changed/kept bars, and a column per day stacked by model. Open it from the "This week" button or `/apex report`.
- Counts start once 0.21 is installed. Earlier chats are not read.


## 0.20.0-beta.1

Charts instead of plain text, drawn with Claude's native boxes and text (no images, no frames), checked in a real terminal:

- **Plan usage gauges (rail):** 5-hour and week as coloured bars (green; amber at the lean line, 80% / 90%; red at the Save line, 95% / 97%) with the percentage, the reset time and where APEX starts leaning cheaper.
- **Model mix (rail):** one stacked bar of the models APEX asked for in this chat, with a colour key and each share (`Sonnet 5.5 38% (3)`).
- **Recent requests (rail):** a column chart, one column per request: colour = model (Haiku green, Sonnet blue, Opus orange), height = effort.
- **Strip:** small 5-hour and week meters replace `5h 82% · week 41%`, and a six-request track sits next to APEX. Extras join only while the next pick's name still fits; "near limit: cheaper" sits beside the meters in amber.
- **Inspector:** "This pick vs your setting" bars for task score and benchmark cost per task, and the top five candidates as bars on one scale with the forecast cost; the chosen one is marked ◆.
- **Evidence:** intelligence and benchmark cost per task as bars for each model; ◆ marks models eligible on your plan.
- **`/apex demo`** now shows eight made-up requests across Haiku, Sonnet and Opus with made-up candidate figures, so every chart can be checked without spending usage.
- Terminal screenshots replaced.


## 0.19.0-beta.1

Interface refresh (strip above the prompt and the compact rail), checked in a real terminal at 144, 80 and 44 columns:

- **Next pick by name:** model IDs without a discovered display name read "Sonnet 5.5", not `claude-sonnet-5-5`.
- **Plan usage:** wide strips and the rail show `5h 82% · week 41%`, plus "near limit: one step cheaper" or "near limit: Save" when the 0.17 lean applies. Strips 48–77 columns wide show the 5-hour figure when there is room.
- **Why and what:** the second strip row and the rail say why the last pick was made (`Hard task · best value for the task`) and what APEX did in this chat (`2 model switches · 3 outputs trimmed · 1 subagent hint`). Problems that need you (setup, a pending mode) still take that row first.
- **Plain words:** the status reads Routing, Paused, Watching only or Old benchmarks, and the messages say what to do. In the inspector, "Chat setting", "APEX asked for", "Answered by", "Effort actually used" and "Benchmarks used" replace Native/Outgoing/Response/Effective effort/Recorded evidence, along with "Benchmark entry", "Benchmark method" and "Benchmark cost per task". Costs read "Estimated at API prices · your plan's real usage is not reported".
- **`/apex demo [off]`:** three made-up requests and a made-up plan reading, labelled "Demo data", to look at the strip and rail without spending usage. Nothing is sent.
- Terminal screenshots replaced. The old ones still showed the pre-0.10 Sports mode.

The browser dashboard is unchanged.

## 0.18.0-beta.1

New: delegation notes that save usage and raise quality. A subagent starts with a small context, and APEX routes search agents as quick tasks, so exploration sent to one costs a fraction of the same calls in a long main chat, where every call re-reads everything.

- **Explore note (every mode):** after four exploration calls in a row in the main chat (Read, Grep, Glob, LS, or read-only Bash such as `rg`, `find`, `git log`) with the context at 100k+ tokens, the fourth result carries one hidden note: hand any further searching to one Explore subagent with a precise question, and ask for paths, line numbers and a short conclusion only. At most once per prompt; never in subagents. On the maintainer's 21 days it would have fired 122 times. The 404 main-chat search calls after those points re-read about 126M tokens. The main chat started an Agent 46 times in all.
- **Reviewer note (Balanced and Best):** a fresh critical software change (coding or agentic work at the critical tier, not specified execution) gets one note: when the change is made, start one reviewer subagent on the request and the diff, asking for concrete defects with file and line, and fix what it confirms. Save never adds it. The tier is the word-rule tier at submit time; the Haiku reading arrives later.
- **Team note (Best, unchanged triggers):** it now says how to split the work: bounded non-overlapping jobs, Explore agents for reading, shared-file edits kept in the main chat, and one fresh reviewer at the end.

All of it is guidance; a mod cannot start a subagent itself. `/apex agents off` stops the notes along with agent routing; `/apex doctor` counts the notes given in this chat. Savings are not measured yet.

## 0.17.0-beta.1

New: plan-limit awareness. Claude Code reports the subscription's `five_hour` and `seven_day` windows (percent used and reset time) from the last response. At five_hour ≥ 80% or seven_day ≥ 90%, APEX routes main requests and subagents one mode step toward Save (Best → Balanced → Save). At ≥ 95% / ≥ 97% it uses Save. Save never lowers a critical task's floor, and Max Power once is never leaned. Receipts carry `limitLean` (window, percent, steps) next to `mode` and `baseMode`. `/apex limits auto|off` is shared across chats; `/apex limits` prints the windows, the lean and the reset time, and `/apex doctor` lists them. With no reading (before the first reply, or on API billing) nothing changes. The thresholds are judgment calls, not measured.

## 0.16.0-beta.1

New: large output guard. Every character of a tool result is re-read on every later request in that chat, and Bash was 53% of all tool output on the maintainer's 21 days. A successful Bash command whose output is over 8,000 characters and that did not bound itself is now saved whole to `$TMPDIR/apex-output/bash-<id>.txt`. Claude reads the first ~2,500 and last ~3,500 characters, up to 30 lines from the middle that look like errors or warnings, and the file path. Never cut: failed commands, commands with `head`, `tail`, `sed -n`, `grep -m`, `wc` or `awk NR`, deliberate dumps (`cat`, `sed`, `nl`, `bat`), diffs and patches (`git diff/show`, `git log -p`, `diff -u`), background commands, images, and reads of the saved file. If saving fails, nothing is cut. `/apex output trim|off` (shared); `/apex output` and `/apex doctor` show how many outputs were trimmed in this chat. The transcript shows the trimmed text too.

On the same 21 days, the rule would have trimmed 171 outputs and cut 1.49M of 24.1M Bash characters, roughly 50M tokens of later re-reading before any compaction. This is an estimate from transcripts, not a measured saving.

Compatibility: the saved-copy location uses `TMPDIR` because the oldest supported engine (2.1.292) refuses a module that names `$.session.info`.

## 0.15.0-beta.1

New: a model-assisted task reader. The word rules matched the labelled tier on 96 of the maintainer's 200 hand-labelled prompts; 42 of 48 hard prompts were read as everyday, and 27 ordinary prompts were made critical by one risky word. Now each fresh prompt (not a continuation, slash command or under 20 characters) gets one Haiku call at low effort through Claude Code's own client: no tools, no history, the prompt cut to 3,000 characters, at most 300 output tokens and a 2.5 s limit. It is started when the prompt is submitted and awaited at the turn's first step. Haiku returns a tier, task kind and importance. Code keeps the safety rules: a prompt with a local high-risk word stays at least hard, an importance-4+ prompt is never quick, failed checks still escalate, and a specified implementation keeps its own steps. Any timeout, error or unreadable reply keeps the word rules. `/apex reader auto|local` (shared), `/apex doctor` shows the last reading.

Measured offline: the reader's exact instructions run on Haiku over the 200 prompts (text only, in batches of 50 via subagents, not the single production call). Tier exact 96 → 123, too low 52 → 23, importance-4+ too low 18 → 4, critical caught 14 → 18 of 19. Routing replay with those readings (`scripts/replay.mjs --readings`), from Opus 5.5 high: Balanced important under-served 15% → 8% (all prompts 6% → 9%), usage 94% → 95% of staying put; Save important 38% → 10%, usage 78% → 79%; Best important 13% → 0%. Haiku's own call is not in those usage figures (~1k tokens a prompt). No live inference was run.

## 0.14.0-beta.1

New: context budget. Every request re-reads the whole conversation, so in a long chat the context size times the number of requests is most of the usage. When a main turn ends above 200k tokens with no agent still running, APEX adds one row above the prompt: how much this chat re-reads per request, how that compares with a fresh chat's fixed load (from the 0.12 overhead reading), and two buttons, **Compact now** (`k`) and **Not now**. Compact runs Claude Code's own compaction with a keep-list: goal and plan, every file changed and why, decisions, open errors and failing checks, and the verifying commands. APEX never compacts on its own. The offer comes back only after another 100k tokens, and re-arms after a compaction or `/clear`. `/apex context off|on|<N>k` (50k–900k) sets it for every chat; `/apex doctor` shows the setting and the current size. This follows Claude Code's cost guidance (`/compact` with instructions, `/clear` between tasks).

On the maintainer's last 21 days (45,832 main requests), 69% carried over 200k tokens; the rule would have offered 317 times across 79 chats. If every offer had been taken and compaction brought a chat back to ~90k, up to 72% of re-read tokens on those requests would not have been re-read. That is an upper bound, not a measured saving. No routing change.

## 0.13.0-beta.1

Fix: effort-only changes were assumed to keep the prompt cache. Claude Code 2.1.330's mod API documents effort as a setting of the whole request unless the user sets `CLAUDE_CODE_MODEL_CAPABILITIES=per_turn_effort` (first-party API only), and Anthropic's prompt-caching page lists an effort change as invalidating cached messages. APEX now prices an effort move as one conversation rewrite and makes it only when it repays that over five benchmark-equivalent requests, when it raises the task benchmark score, or when the current effort is below the floor. The cross-model barrier is unchanged and stays conservative. Receipts record `cacheAssessment`; new reasons `effort_change_does_not_pay_back` and `effort_change_cost_unknown`.

New: `core/anthropic-guidance.mjs` and `/apex guidance [MODEL_ID]`: dated profiles for Haiku, Sonnet and Opus 5.5 (and Fable 5.2, which stays unconfirmed) with API default effort (Haiku and Opus medium, Sonnet high), starting-effort advice, thinking limits and source links, plus a 30-day review warning in `/apex doctor`. Advice never grants model access or replaces benchmark scores.

Per-task scores refreshed from AA's public model pages. Both replay scripts count effort-related rewrites.

Offline, 200 labelled prompts, three modes, two starting pairs: the important-below-proxy rate is unchanged in all six combinations. Balanced from Opus 5.5 high over a clean 14-step task: 199 → 172 modeled cache rewrites, about 6.7% lower estimated cost; single-prompt cost slightly higher; from Sonnet essentially no change. Simulations, not measured quality or subscription savings. Docs and README no longer say effort changes keep the cache; the README's six-mode hotkeys now read `s`, `b`, `e`.

## 0.12.0-beta.1

New: `/apex overhead` and an inspector section, "What every message carries". They report what each chat re-reads before you type, from Claude Code's own context breakdown: system prompt and tools, memory files, MCP servers, the skill and command listings, agent descriptions, and the conversation so far. If one item is large (an MCP server over 3,000 tokens, a memory file over 4,000, a skill listing over 3,000) it says so in one line. APEX only reports; it changes no instruction file and disconnects nothing. Nothing is shown until the host has given a reading, and file paths are shortened to file names.

On the maintainer's last 21 days the median chat re-read about 74,000 tokens before the first message, and the median request carried about 333,000 tokens in total, so the fixed load is roughly a fifth of what is re-read.

New: a settings-wiring check in `npm run check` (`scripts/settings-wiring.mjs`). Every setting the change handler accepts must be declared with where it lives (default, `/apex` command, web page, companion allowed list), and the source must match: a setting added in one place and forgotten in another now fails the check instead of failing quietly. `ultracode` and `agents` are declared command-only on purpose.

No routing behaviour changed.

## 0.11.1-beta.1

Fix: Save (and Balanced) kept choosing Opus xhigh after harmless tool errors. Any two failed tool calls in a prompt made the rest of it "critical", which every mode answers with the strongest pair. A search that found nothing, a missing file, a refused call or a browser-tool hiccup counted. On the maintainer's last 21 days, 7% of prompts reached two errors, but they were the long ones: 24% of all main-chat requests came after the second.

Now only real failed checks count: a failed command that is not a search with no match, and a failed Edit, Write or notebook edit. Searches (`grep`, `rg`, `diff`, `test`, `find`, `which`, `git diff --quiet`) that exit 1, Read errors, refusals and connector or browser tool errors are ignored. Escalation is gradual: two failures make the task at least hard, three make it critical (a specified implementation keeps its own steps). The receipt reads `failure_escalation` with a plain explanation instead of `save_policy`.

New `scripts/replay-sessions.mjs` replays 14-step tasks with failures part-way and counts model-switch cache costs, which the one-step replay cannot see. On the maintainer's 200 labelled prompts, starting on Opus 5.5 high (cost relative to staying put): with three harmless errors Save went 79% → 131% under 0.11 and stays 79% now; with three real failures Save is 130% and Balanced 124%. No live inference was run, and quality is not part of this cost figure.

## 0.11.0-beta.1

Treat supplied implementation contracts as execution rather than unresolved design. Require a software change request, concrete references and corroborating instructions; do not infer low decision demand from length alone. Keep risk visible and raise the reasoning tier after a failing check and repeated failures. Software implementation stays coding when medical/legal vocabulary appears in its constraints.

Balanced and Save never automatically enable Ultracode or add a parallel-agent nudge. Specified tasks get a bounded single-main-agent note instead. Best retains explicit stronger-compute behavior. This note is guidance, not a host-enforced prohibition on Agent/Workflow tools.

Workflow mapping/search labels can receive an ordinary implementation budget independent of a critical parent. Reviewers, architects and unknown workers retain the parent's demands, and explicitly selected worker models are respected. Worker failures are tracked for escalation.

Manual controls, stale/missing evidence, model availability, cache payback and API-consent/budget gates remain active. Routing tests and offline replay do not establish unchanged real-task quality or measured subscription savings. Reload/restart after updating; existing chats keep loaded plugin code.

## 0.10.0-beta.1

Three modes instead of six: Save, Balanced and Best.

The six 0.9 modes each pushed one thing to its limit, which gave answers that felt wrong: Cost Efficient chose 5.5-minute answers to save money, Max Power 11-minute ones, Max Speed handed 131 of 200 prompts a weaker model than they needed, and several modes overlapped. Now every mode uses Balanced's rule (drop pairs under the tier's floor or over its wait limit, take the most score for the usage) and differs only in how much a better answer is worth. Save values a point at 70% (same floor); Best at 6×, with a floor 10 points higher and wait limits doubled. Critical tasks keep at least Balanced's floor and point worth in Save.

Ultracode follows the size of the task within the mode: Best (and Max Power once) for hard and critical tasks, Balanced for critical ones, Save never. The note asking Claude to split work across parallel subagents goes with the same tasks when ultracode is off or not used. In Save, subagents of a task that is not critical are routed as quick tasks. Max Power once stays: one prompt on the strongest pair. Saved modes carry over (eco and Cost Efficient → Save; quality, Max Power and Max Power + Speed → Best; sports, Time Efficient and Max Speed → Balanced); old receipts keep their reasons. Hotkeys in the rail are s, b and e.

On the maintainer's 200 labelled prompts (kept off the repository) with the 30 Oct data, starting on Opus 5.5 high, per prompt in benchmark cost (AA tasks are larger than real prompts, so this compares modes rather than predicting bills): always Opus high $3.52 and 37 s; Save $2.58, typically 15 s, 43 below their labelled need; Balanced $2.96, 19 s, 14; Best $5.39, 37 s, 8; Max Power once $10.30, about 11 minutes, 0. A Save at half the point worth saved more ($2.33) but left 72 prompts below their need, so 70% was kept.

The hygiene check, Node tests, native tests, plugin validation and the browser test pass locally. No live inference was run. Update the marketplace and the plugin, then restart: chats that were already open keep the previous code.

## 0.9.0-beta.1

Six modes replace Eco, Balanced, High Quality and Sports, and each one does what its name says.

In every mode the task's tier still sets the quality floor, a critical task (money, legal, admissions, production) keeps its full floor, and a pair without benchmark cost data is never picked.

- **Balanced**: unchanged from 0.8: floor, wait limit, then the most score for the usage.
- **Cost Efficient**: the cheapest pair over the floor, with no wait limit. Ties go to the higher score, then the faster. A move to another model is judged on usage alone.
- **Time Efficient**: among pairs over the floor that cost at most three times what Balanced would pay, the fastest; ties go to the cheaper. A move is judged on the wait.
- **Max Power**: the highest score, cost and time ignored (what High Quality did). Ultracode for critical tasks.
- **Max Speed**: the fastest pair over the quick floor (40% of the best) whatever the tier, cost ignored; critical tasks keep their own floor. Ultracode for hard and critical tasks.
- **Max Power + Speed**: the fastest pair within 95% of the best score, cost ignored. Ultracode for hard and critical tasks.

In the two speed modes subagents are routed as quick tasks (the fastest pair over the quick floor) unless the main task is critical, and a freshly typed task carries a short note for Claude, attached through the `prompt.submit` context the mod API provides and not shown to you, asking it to split independent parts across parallel subagents. No note is sent with continuations, slash commands, messages typed over a running turn, with `/apex agents off`, or with a task sent under ultracode (a plugin's own resubmit cannot carry context, and ultracode is already multi-agent).

Saved settings carry over: `eco` becomes Cost Efficient, `quality` Max Power, `sports` Time Efficient, and an unknown saved mode becomes Balanced. `/apex mode` takes the new names, friendly forms (`cost`, `time`, `power`, `speed`, `power+speed`) and the old names. Quality once is now Max Power once. The mode chooser hotkeys are `b`, `c`, `t`, `p`, `s`, `x`.

On the maintainer's 200 labelled prompts (kept off the repository) with the 30 Oct benchmark data, starting on Opus 5.5 high: Cost Efficient used 48% of always staying there and Max Speed 48% with 59% of the wait; Max Power used 293%; Balanced is unchanged (84% usage, 84% wait). Time Efficient used 67% with 72% of the wait (faster than Balanced's 84%; a first draft capped it at twice the cheapest pair, which left it as slow as Cost Efficient at 495%). With benchmark data over three days old every mode stays at or above the starting pair and the receipt now says so (`stale_data_floor`) instead of naming the mode. "Max Power once" also covers that turn's subagents, and the subagent note is not added while routing is on hold or off. No live inference was run.

## 0.8.0-beta.1

APEX picks on value instead of "nearly as good as the top model".

Before, a pair qualified only if it reached 88% of the strongest score (92% for hard, 97% for critical), and the cheapest such pair won. With Opus 5.5 max at the top that meant only Opus at high effort or more, or Sonnet at max, qualified for an ordinary prompt, so a chat started on any model ended up on Opus. Coding prompts were also judged on the general score, because AA's index v5 free API no longer fills the coding or agentic index, and the prompt reader matched "code" inside words like "codex".

Now each tier has a lower floor (quick 40%, everyday 60%, hard 80%, critical 90% of the best score for that kind of task), the same kind of wait limit, and a worth for one point of score ($0.03, $0.15, $0.40, $1.20 of benchmark cost per task). Among pairs over the floor and in time, the pick has the highest `score − cost ÷ worth`, so a higher effort on a smaller model and a lower effort on a bigger one compete directly. Eco lowers floors by 5 points and values points at 60%, except for critical tasks; Sports takes the fastest pair over the floor; High Quality is unchanged.

Scores per kind of task come from a dated snapshot of AA's public model pages (`core/task-scores.mjs`, refreshed by `scripts/refresh-task-scores.mjs`): coding is Terminal-Bench 4.0 with FrontierCode 2.0, agentic work AutomationBench with Terminal-Bench 4.0, reasoning HLE-Diamond with CritPt, knowledge AA-Omniscience accuracy. It fills only scores the API leaves empty and is ignored once AA's index version changes. The reader matches whole words, reads changes to code and work through files and tools as agentic, short factual questions as knowledge, and treats tuition, fees, deadlines, admissions, patents, licences, vesting, equity, investors, wages, visas and "should I sign" as high-stakes. A move to another model is judged on score and usage together (it was usage only, so a chat could never move up to better value), and a new prompt resets the hold against flip-flopping between steps.

On 200 of the maintainer's labelled prompts (kept off the repository) with the 30 Oct benchmark data, Balanced starting on Opus 5.5 high: usage 84% of always staying there (110% before), wait 84% (141%), prompts under their labelled need 7% (10%), important prompts under it 21% (46%), and all three models used (two before). Starting on Opus max, Balanced used 29% of always-max usage (38%). The yardstick for "under" changed to the new floors and is the same for both versions. The reader still rates some hard and important prompts as everyday.

The hygiene check, 102 Node tests (9 new, 13 updated for the new policy) and 29 native tests (1 updated) pass locally; the browser checks run only in CI. No live inference was run. Update the marketplace and the plugin, then restart: chats that were already open keep the previous code.

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
