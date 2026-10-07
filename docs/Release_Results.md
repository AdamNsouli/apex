# Release results — APEX 0.2.0-beta.1

Verified 7 October 2026. The public repository is [AdamNsouli/apex](https://github.com/AdamNsouli/apex).

- **33 Node tests passed**: routing, evidence adapters, cost reconciliation, risk/capability guards, control revisions, authenticated HTTP/Unix transport, and actual detached companion startup/shutdown.
- **8 official native harness tests passed on Claude Code 2.1.292**: main-request model forwarding and stream retention; subagent native settings preserved; native mode controls; in-flight mode change followed by a different outgoing model/effort; manual model hold/resume; dock preservation and survey yield; native budget/setup/display controls; all five tabs on terminal/desktop at 32/96 columns; populated receipt/evidence selection.
- **Browser integration passed**: actual local control transport with synthetic native bridge data, consent and mapping forms, export, reload authentication, disconnected controls, four views at four viewport widths, light theme and compact console. Captures label fixture provenance visibly.
- Official plugin and marketplace validation passed. Source checks cover syntax, JSON, matching release versions and private-material patterns.
- GitHub's [initial independent Linux run](https://github.com/AdamNsouli/apex/actions/runs/37565710991) passed all checks. [Current verification runs](https://github.com/AdamNsouli/apex/actions/workflows/verify.yml) cover subsequent release commits too.
- Public GitHub marketplace add and user-scope install succeeded using an isolated temporary Claude configuration. `plugin list` reported APEX enabled. The user's real Claude installation/settings were not changed.

These checks use mocked inference and synthetic benchmark fixtures. **Live provider acceptance, real-key AA ingestion, task-quality gains, measured savings and billing remain unverified.** No paid inference or account billing activation was performed. This is an executable beta with documented setup requirements and boundaries.
