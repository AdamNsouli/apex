# Release results — APEX 0.3.0-beta.1

7 October 2026. Public repository: [AdamNsouli/apex](https://github.com/AdamNsouli/apex). Based on the preserved `v0.2.0-beta.1` tag in a separate checkout.

The story under verification is mode/consent/setup UI → authenticated loopback companion → revisioned native host acknowledgment → main dispatch → frozen readable receipt. Native UI also works without the companion.

| Boundary                  | Evidence                                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing/core/transport    | 44 Node tests: existing 31 routing safeguards, private HTTP/Unix bridge, detached startup/shutdown, shared presentation/receipt/dispatch contracts and AA first-connect/cooldown                                                                                                       |
| Official native runtime   | 9 tests on Claude Code 2.1.292: actual hook forwarding, unchanged stream, mode during stream, next-request effort change, main-only Quality once, holds, dock/survey/downstream preservation, setup/consent, terminal/desktop trees at 32/48/80/120 body columns                       |
| Browser → bridge → UI     | Chromium checks with real local companion and labeled synthetic native state: queued/consumed controls, history preservation, frozen evidence, agents, exact-effort setup, consent/revoke, export, pagination, timing, compact mode, themes, viewport reflow and disconnected controls |
| Actual terminal rendering | Genuine isolated host PTY output at 144×40 (right dock, requested 34-column body) and 80×40 (inline). Saved mode pending label and composer preserved. ANSI output rasterized using pyte and a local font; not an OS screenshot                                                        |
| Release hygiene           | Plugin/marketplace validation, JavaScript syntax, JSON, release-version agreement and private-material pattern checks                                                                                                                                                                  |

Browser layout checks cover widths 320, 390, 768, 1024 and 1440px. The reduced 720px CSS viewport exercises reflow equivalent to a 1440px window at 200%; actual browser chrome zoom and assistive-technology behavior are not certified by that check. Dialog Escape and focus restoration, menu bounds, horizontal page overflow and browser/CSP errors are checked.

The terminal capture used empty temporary workspace/configuration, a dummy credential, an unreachable loopback inference endpoint and local slash commands only. The user's installed Claude version/settings and account billing were not changed. Native event-bearing views have official harness and reference-tree coverage; these actual PTY captures intentionally contain no real request/benchmark telemetry. Live desktop paint and terminal/theme matrices beyond the recorded configurations remain unverified.

No paid inference was run. Live provider acceptance, authenticated AA ingestion with a real key, subscription entitlement, account billing, task-quality gains and measured savings remain unverified. This is an executable beta, not a guarantee of optimum decisions or a zero-maintenance future host integration.

[Current independent Linux checks](https://github.com/AdamNsouli/apex/actions/workflows/verify.yml) run the same core/native/browser paths. A clean local marketplace installation in isolated temporary Claude configuration reported APEX 0.3.0-beta.1 enabled. Public marketplace installation is checked separately during publication.
