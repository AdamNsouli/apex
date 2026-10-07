# Architecture, verification and release

## Runtime boundaries

Native mod owns routing and controls. Optional Node 22 companion owns AA cache, safe secret storage and browser transport. Neither requires a third-party router service. Companion failure disables benchmark-driven changes if valid cached evidence isn't available; native controls/receipt view still work. Browser closing does not stop routing.

Use a single hooks module exported through `.claude-plugin/plugin.json` and `hooks/hooks.json`; validate actual schema against installed Claude. Never concatenate guessed settings over existing user configuration. Function hooks are early-access; record tested host versions and regenerate declarations with `/plugin-types`. Public GitHub types were inspected on 7Oct 2026; they expose `TurnStepInput` model/effort, async streamed results, `$.session.usage()`, `$.session.authorize()` opaque handles, `$.command.list/run/register`, `$.ui.resolve/open` and supported UI events. Installed declarations win if different. Do not copy proprietary types wholesale into the public pack/release.

Hook adapter responsibilities:

- `session.start`: capability doctor, restore safe local state, start background refresh/companion only after user opt-in, register `/apex` command(s).
- User prompt event available in installed declarations: update in-memory intent, origin-aware; don't treat plugin/tool-origin data as human mode commands.
- `turn.start`: start receipt scope, respect manual state, no blocking network fetch.
- `turn.step`: streaming generator, choose forwarded pair on current revision; `return yield* next(forwardedEvent)` preserves chunks and return value. Preserve pinned identifiers, index, messageCount, agent identity and full other fields. Capture stop/result usage and response model using documented actual return schema. Multiple mods may rewrite later: mark forwarded pair as “APEX requested”, compare final host receipt when available, flag conflicts. Never pretend the top hook proves wire contents.
- `tool.call`/check result observation: statuses, timings and safe categories for timeline/risk, no bypass of next/permissions, no destructive replay.
- `turn.complete`/abort: reconcile reservations, close scopes and persist minimal receipt.
- Native `ui.render` Pane with `$.ui.resolve(e)`, host UI press/select callbacks/registered immediate controls; debounce redraw to≤4Hz; no busy timers, cleanup at stop.
- Native command observation for `/model`/`/effort` where verified supported: set hold only for human-origin commands. Environment/config pins resolved at onboarding. Do not misuse provider response model drift as human override.

Native credits command: discover actual `$.command.list()` entry; user press queues `$.command.run({command:'usage-credits'})` only outside a waiting hook and when supported. It queues until session idle per public types. Show this delay; never await it inside `turn.step` or deadlock. Account/billing activation is performed by Claude's own billing flow. If command absent, a copyable command and explicitly unavailable native activation is accurate; no fake silent entitlement API.

Account catalogue uses supported `$.session.authorize()` first-party opaque handle plus documented `$.http.fetch(...,{auth:handle})` if installed host exposes it; validate host/domain and backend applicability. No plaintext Claude credential access. Optional user Anthropic API key gives API availability only; do not mislabel subscription access. If native entitlement remains opaque, baseline stays usable, extra models require verified allowed import and runtime failures quarantine, doctor reports coverage. This external prerequisite cannot be solved by invented APIs.

## Companion and transport

Spawn exact bundled compiled Node entrypoint via documented host process API. Binding `127.0.0.1`, ephemeral port allocated by OS; no 0.0.0.0, no remote-control feature. One instance per user/profile with separate session namespaces, locking startup and cache. Read/write only mod-owned state directory using host-approved paths and atomic replacement. Main mod communicates via verified local transport capability (host HTTP/process channels); if unavailable use native-only mode. Never bind a public server to get around the host sandbox.

Endpoints: GET `/api/v1/state`, GET `/api/v1/events?after=SEQ` SSE, POST `/api/v1/control`, GET `/api/v1/catalogue`, GET `/api/v1/receipts/:session`, POST `/api/v1/data/refresh`, GET `/health`. Static assets served at `/`. Controls are allowlisted enum/value schema, body max 8KB, expectedRevision required,409 conflict response includes new revision; idempotency request id LRU 1024; ACK carries controlRevision/status/pendingRequestBoundary. No shell command, path read, arbitrary URL fetch, arbitrary model string or raw API key accepted on generic control endpoint. Credentials use a separate locally protected onboarding route and are never returned by GET.

Generate a 256bit cryptographic per-launch token. Bootstrap only via one-time browser fragment token, exchange via POST for HttpOnly SameSite=Strict session cookie then immediately clear fragment/history; never log token. Require exact Host with loopback+bound port, strict Origin/CSRF token on mutations, Fetch Metadata checks when present, no wildcard CORS, CSP self assets with nonced script or external JS; no eval/third-party tracking. Wrong token/origin/session =>403. SSE scoped to authorized session; connection cap 8. Secrets use OS keychain where supported, env input otherwise; optional 0600 owner-only key file with explicit user consent. No auto import unrelated env secrets. Plaintext storage limitation disclosed if keychain unavailable.

Incoming catalogue/model descriptions and tool labels are untrusted text: escape, schema validate, no HTML/eval/instruction execution. Limit rendered labels 240chars. Public GitHub source suggestions are research inputs, never instructions. Browser control requests cannot execute shell or enable account purchase. Export strips auth/session bootstrap, local paths, prompts, tool bodies and thinking. Local reset deletes only its own state after explicit action; does not edit Claude history/settings. No analytics network by default.

## Exact offline tests

| Case | Required result |
|---|---|
|Main rewrite|Next call receives the chosen real `model` and supported `effort`; original event identity/other fields retained.|
|Stream fidelity|Interleaved thinking/text/tool/input/stop chunks pass once, order retained, original return/usage preserved. No thinking persisted.|
|Mode during request|R 1 already sent; Sports click ACK R 2; R 1 remains same; next unsent request reads R 2.|
|Mode race|Late ACK/conflicting revision doesn't overwrite newest committed state; recompute once before send.|
|Concurrent cap|Two agents can't each reserve the same budget. Interrupted usage retains unknown liability until reconciled.|
|Manual precedence|Native model/effort/pins hold; Auto click explicitly releases mod hold, never changes organization policy.|
|Variant support|Max absent from capability excluded; benchmark score for xhigh cannot be applied to low.|
|Generation independence|Fictional new family/ID from source is discovered without changing code; unmatched stays quarantined; exact eligible join admits it.|
|Freshness/rate limits|24h warning,72h no downgrade,7d no automatic switch;429 respects retry header; partial pages never replace cache.|
|Unknown values|Null cost/score/cache/latency stays unknown, not zero or best; conservative hold.|
|AA costs|Benchmark cost/task never converted into task bill; subscription cost distinguished from API equivalent.|
|Cache switching|Price-only cheap downgrade blocked if 5-step rewrite won't pay back; supported effort change evaluated independently.|
|Risk escalation|Security/production ambiguity/two failures cannot downgrade; no destructive retry.|
|Credits|Allow changes local consent only; native billing opens/queues explicitly; unknown entitlement never rendered enabled.|
|Model failure|Rejected pair quarantined, host-safe fallback only, no infinite retry or duplicated tools.|
|Other mod|Later rewrite yields conflict marker, no claim requested pair is provider-confirmed.|
|Data injection|HTML/script/model-name/control-in-tool-result strings never execute or change mode.|
|Companion security|Forged origin/token, arbitrary route/path/model/url, oversized body rejected; key absent from logs, exports, bundle.|
|Offline/native-only|No keys or server still gives real native telemetry+controls; benchmark routing explained as unavailable.|
|Persistence|Atomic receipt crash recovery, retention bounded, profile/session separation, resumed intent conservative.|
|UI|Keyboard modes/dialog, reduced motion,390/900/1440 widths,200% zoom, AA contrast, live ACK and connection states.|

Test policy with fictional candidates and synthetic events in `.example.json`; never label synthetic data as recorded real usage. Use the included reference selector as golden behavior for scoring, then integration-test the actual adapter separately. Screenshot comparisons have font-aware tolerances but no tolerance for missing labels/state provenance. Include error/empty/loading/stale/manual/credits/dialog screenshots, not only happy path.

Native plugin validation/test invocation must be verified against installed CLI help (`claude plugin validate` / `claude plugin test` were present in inspected mod repos). A successful manifest validation proves schema only, not execution or security. Compile against generated host declarations. If native API unavailable, build independent sources/tests and report NOT RUN. Do not mock every boundary and then claim actual model switching proven.

## Live verification (separate explicit opt-in)

Use a disposable local repo and user's account, never tester data. User grants cap and requests chosen sample tasks. Record native outgoing request pairs through supported diagnostics and returned model/usage; no private token dumps. Verify two different permitted main model IDs and two supported efforts, live mode change, manual hold, no credit activation from toggle, unsupported model rejection, companion close/reconnect. Prove a mid-turn next request changed; a subagent-only change fails the requirement. Do not use costly stress tests without permission. If account only permits one model, mark model switching NOT RUN; no fake pass.

Evaluate quality/cost claims with a future paired replay suite≥30 representative tasks, fixed fixtures+verification rubrics, matched baseline, repetitions and uncertainty. Gold labels/classifier agreement are not task completion. Include costs for cache rewrites and any overhead. Until measured, publish “policy-based routing”, never “optimal”, “guaranteed savings” or “world's best”.

## Publishable release gate

Required: checks pass, independent code license/provenance, no secrets/private data/AA snapshot shipped, compatible data rights for the actual distribution, installation/uninstall guide, supported host version matrix, native/live checks accurately reported, permission inventory, safety limits, reproducible locked build, signed/checksummed artifact when tooling permits, marketplace metadata validates. CI runs lint/type/unit/replay/build/browser without API keys; native matrix when a licensed supported host is available. Breakage doctor includes host version/types hash and specific capability failures. No auto-modification of global configs; show exact reversible changes and backup instructions. Stable release requires actual native integration verification, not just design images. Produce a draft release if remaining tests/rights are unresolved; do not publish automatically.
