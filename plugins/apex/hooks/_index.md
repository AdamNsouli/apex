# hooks — Index

Current status: APEX 0.7.1-beta.1, premium native rail and route workspace.
Code and assets are public; dataset and inference fixtures are synthetic.
See the root README and verification document for actual limits.

- [hooks.json](./hooks.json) — release source or supporting artifact.
- [register.mjs](./register.mjs) — release source or supporting artifact.
- [router.test.ts](./router.test.ts) — release source or supporting artifact.

- [interface.mjs](./interface.mjs) — native prompt dock and inspector rendering with host primitives.
- [interface.test.ts](./interface.test.ts) — official native UI harness tests for dock, integrated views, setup, consent and surfaces.
- [ultracode.test.ts](./ultracode.test.ts) — official native harness tests for holding a critical task, switching ultracode on and off, and the `/apex ultracode` command.
- [agents.test.ts](./agents.test.ts) — official native harness test for routing subagents and `/apex agents auto|off`.
- [policy.test.ts](./policy.test.ts) — official native harness tests for the tier policy through the hook chain, the daily change record and `/apex confirm-models`.
