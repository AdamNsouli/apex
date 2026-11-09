# core — Index

Current status: APEX 0.11.1-beta.1 executable beta.
Code and assets are public; dataset and inference fixtures are synthetic.
See the root README and verification document for actual limits.

- [catalogue.mjs](./catalogue.mjs) — release source or supporting artifact.
- [router.mjs](./router.mjs) — release source or supporting artifact.
- [scoring.mjs](./scoring.mjs) — the tier policy: floor, wait limit and value (score minus cost over the worth of a point).
- [task-scores.mjs](./task-scores.mjs) — dated per-task benchmark snapshot (coding, agentic, reasoning, knowledge) from AA model pages; written by scripts/refresh-task-scores.mjs.
- [presentation.mjs](./presentation.mjs) — shared readiness, pending controls, main/agent scope and readable facts.
- [receipt.mjs](./receipt.mjs) — immutable evidence snapshots and historical receipt adapters.
