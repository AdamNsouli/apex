# hooks — Index

Current status: APEX 0.24.0-beta.1, premium native rail and route workspace.
Code and assets are public; dataset and inference fixtures are synthetic.
See the root README and verification document for actual limits.

- [steps.test.ts](./steps.test.ts) — native tests: more effort after a failed tool, less for routine steps only with per-message effort.
- [learning.test.ts](./learning.test.ts) — native tests: a complaint or resend raises the next pick, clean answers wear strikes off, `/apex learning reset`.
- [report.test.ts](./report.test.ts) — native tests that finished requests are recorded without prompt text and `/apex report` charts them.
- [specified.test.ts](./specified.test.ts) — native synthetic specified-execution routing, bounded guidance, independent mapper budgets and critical/reviewer protection.
- [failures.test.ts](./failures.test.ts) — native tests that searches with no match and refused calls do not raise the tier, and real failed checks do, with the receipt reason.
- [overhead.test.ts](./overhead.test.ts) — native tests for `/apex overhead` with and without a host breakdown.

- [hooks.json](./hooks.json) — release source or supporting artifact.
- [register.mjs](./register.mjs) — release source or supporting artifact.
- [router.test.ts](./router.test.ts) — release source or supporting artifact.

- [interface.mjs](./interface.mjs) — native prompt dock and inspector rendering with host primitives.
- [charts.mjs](./charts.mjs) — native charts (bars, gauges, stacked mix, request columns) built from Box and Text.
- [charts.test.ts](./charts.test.ts) — native tests that the rail and inspector draw their charts, and draw none when empty.
- [interface.test.ts](./interface.test.ts) — official native UI harness tests for dock, integrated views, setup, consent and surfaces.
- [ultracode.test.ts](./ultracode.test.ts) — official native harness tests for holding a critical task, switching ultracode on and off, and the `/apex ultracode` command.
- [agents.test.ts](./agents.test.ts) — official native harness test for routing subagents and `/apex agents auto|off`.
- [policy.test.ts](./policy.test.ts) — official native harness tests for the tier policy through the hook chain, the daily change record and `/apex confirm-models`.
- [fanout.test.ts](./fanout.test.ts) — official native harness tests for the parallel-subagents note the speed modes attach to a fresh prompt.
