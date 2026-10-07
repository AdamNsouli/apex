# Paste this into Claude Code with the full pack available

Build **APEX**, an original, publishable native Claude Code mod that actually routes the main request across available Anthropic models and supported efforts. This is an implementation task. Complete the working repository, verification and documentation in this run; repair defects before returning. Do not stop after a plan, scaffold, simulated dashboard, or delegated model selection.

Read every specification in this pack, `contracts/` and the visual/asset manifests first. Follow the supplied HTML, screenshots, dimensions, copy and design tokens. The images are design references. The reference selector is executable policy, not a replacement for host integration. Use fictional fixtures only in an explicitly labelled demo. Do not claim the mod is installed or working from the prototype.

## Authority and resolved choices

Implement the exact product, algorithm, safeguards, defaults and tests in this pack. Do not substitute your preferred design or routing scheme. Do not replace native main-request routing with subagents, a skill, a prompt pretending to switch, or a proxy. Preserve user/organization permissions. Do not install globally, change account billing, spend on live tests, publish a repo/release, or scrape private credentials without separate authorization. Local dependency installation and offline tests in the new project are permitted by this build request subject to the execution environment's permissions.

Use TypeScript, strict types, React for the browser UI, Vite, Vitest for pure unit/replay tests, Playwright for browser tests, and the installed Claude plugin test harness for native UI/hooks. Target Node 22 LTS for the local companion, ES modules. Select supported current stable package versions at build time, pin them exactly and commit the lockfile. Do not leave an arbitrary unbounded version range. Use the installed Claude-generated declarations as host authority.

Repository layout: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `src/core/`, `src/adapters/claude/`, `src/data/`, `src/ledger/`, `src/companion/`, `web/`, `assets/`, `tests/unit/`, `tests/replay/`, `tests/native/`, `tests/browser/`, `docs/`, `scripts/`, `.github/workflows/`. Include package.json, lockfile, tsconfig, license, README, SECURITY.md, CHANGELOG.md, data attribution, asset provenance and `VERIFICATION.md`.

Create an MIT license for original code/assets only; do not attach that license to third-party data. Use APEX 0.1.0 and plugin identifier `apex-router`. Name is provisional; do not claim affiliation with Anthropic/Artificial Analysis or trademark clearance.

## Ordered implementation

1. Discover `claude --version`, supported mod feature flag and `/plugin-types` output. Generate local types. Check native rewriting of `turn.step.model` and `.effort`, event streaming, manual-selection visibility and UI controls against these declarations. Record the host version/types hash and capability results. If Claude is absent, finish all independent work and mark native tests **NOT RUN**. Do not invent a host API or mark skipped checks passed. Where APIs differ, adapt the adapter to the installed declarations without changing the specified product behavior; explain a genuinely unavailable function.
2. Implement and test the pure router, revisioned control state, model/evidence join, refresh, ledger and safe local companion. Implement the native hook adapter and pane. Apply routing on every next eligible unsent main `turn.step`, not only each new user turn. Preserve the full event, change only supported model/effort fields and pass every streamed chunk through exactly once.
3. Implement the browser dashboard against the real local transport, using the supplied prototype as the visual contract. Build onboarding and all states. Run the full checks below and repair failures. Produce install/uninstall instructions using supported commands, marketplace metadata and a release artifact. Do not publish it.

## Acceptance contract

All requirements and acceptance cases in Architecture_And_Test_Spec.md must be implemented. In particular: a mid-turn mode change alters the next main request's serialized settings; request and response facts are distinct; a cost view cannot invent billing; incompatible/unknown new models cannot silently become candidates; credits consent is not account activation; manual overrides cannot be stolen by automatic routing; offline keys/data never become fake zero prices; native controls still work without the companion. The TypeScript interfaces in this pack may be extended for implementation details, never relaxed to hide invalid states.

Default classifiers are deterministic and conservative; do not add silent paid classification. Use task cues and observed tool metadata as specified, with a user task override in the details drawer. Quiet evaluation means no reasoning spam in the transcript. Every decision remains inspectable. Models' reasoning text is not collected or displayed. Model/version capability discovery, provider-aware effort support and AA benchmark variant matching are mandatory.

## Tests and delivery

Provide scripts `check`, `test`, `test:replay`, `test:native`, `test:browser`, `build`, `verify:offline`, `verify:live`, `package` and `doctor`. Offline verification must run without keys or paid inference. `verify:live` must require an explicit flag and a USD/session cap, explain whether billed costs can be enforced, and never run automatically. Native tests should use the installed harness and real hook chains with stubbed inference whenever possible. Actual live requests are a separate opt-in check.

Capture the real implemented UI at the reference sizes. Verify accessibility, no clipped content, real control ACKs, revision races and security boundaries. Add fixture replay against the supplied selector and actual hook adapter. Do not validate only a fake UI or mock that bypasses the adapter. Include adversarial data and prompt-injection fixtures. If a test reveals a specification ambiguity, use the conservative behavior explicitly specified in the pack and document it; do not invent savings or quality claims.

At completion, give: exact repository and artifact paths, installation steps, screenshots, commands/results, remaining limitations, and a compact requirements matrix with PASS / FAIL / NOT RUN / BLOCKED. List the exact external prerequisites remaining. A simulated or absent capability is not PASS. Any build blockers must leave reviewable source and a specific diagnosis; do not label a partially working mod production-ready. The finished output should need no design decisions from me; only real credential/billing/publication decisions remain mine.
