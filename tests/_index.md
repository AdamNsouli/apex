# tests — Index

Current status: APEX 0.11.1-beta.1 executable beta.
Code and assets are public; dataset and inference fixtures are synthetic.
See the root README and verification document for actual limits.

- [browser.cjs](./browser.cjs) — release source or supporting artifact.
- [failures.test.mjs](./failures.test.mjs) — which tool errors count as real failures and how failures raise the tier.
- [companion.test.mjs](./companion.test.mjs) — release source or supporting artifact.
- [core.test.mjs](./core.test.mjs) — release source or supporting artifact.
- [presentation.test.mjs](./presentation.test.mjs) — dispatch consumption, frozen evidence and shared UI state contracts.
- [ultracode.test.mjs](./ultracode.test.mjs) — which prompts qualify for ultracode and the setting itself.
- [simple.test.mjs](./simple.test.mjs) — which prompts the classifier treats as simple.
- [unanchored.test.mjs](./unanchored.test.mjs) — routing across models from any starting pair, the cache payback sum, the stale-data floor and the replay on example prompts.
- [fixtures](./fixtures/_index.md) — example data for tests; made up, never real prompts.
- [policy.test.mjs](./policy.test.mjs) — tier policy, automatic effort mapping and the daily change record, on synthetic benchmark data.
- [value.test.mjs](./value.test.mjs) — how prompts are read (task kind, high stakes), the per-task snapshot, and value picks on data shaped like the real models.
- [specified.test.mjs](./specified.test.mjs) — specified implementation versus unresolved decisions, failure escalation and independent read-only worker budgets; synthetic handoffs only.
- [modes.test.mjs](./modes.test.mjs) — the six modes on synthetic data: each picks what its name says, critical floors hold, old names migrate, ultracode and subagent rules per mode.
