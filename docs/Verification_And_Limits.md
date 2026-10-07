# Verification and limits — 0.1.0-beta.2

Tested on macOS arm64 with Claude Code 2.1.292 in an isolated CLI installation. The user's older global CLI was not changed. Tests below perform no paid inference.

- Native `claude plugin test`: main model forwarding, streamed chunks/result preservation, native mode buttons, switching mode during a stream then changing model and effort on the next request, and manual model hold/resume.
- Node core/transport suite: model discovery/effort flags, exact mapping and new-generation exclusion, missing evidence, account access, paid routing consent, budget reservations, unknown-cache cost handling, failed-cost liability retention, thinking compatibility, freshness, risk, revision conflicts, bounded pagination and methodology consistency. Real local HTTP/Unix-socket transport checks bootstrap authentication, Host/Origin/CSRF guards, allowlisted controls and native revision acknowledgment.
- Chromium browser integration: control acknowledgment, preserving in-flight settings, credit consent, availability/mapping forms, receipts/export, all four views at 1440/980/768/390 pixels, light theme, disconnected disabled controls and absence of browser/CSP errors. Screenshots are explicitly labeled synthetic offline test fixtures.
- Official CLI validation checks both marketplace and plugin hooks.
- Clean GitHub marketplace add/install succeeded in an isolated Claude configuration; the installed beta was listed as enabled. See Release_Results.md.

Not verified: live authenticated AA API ingestion with a real key; live Anthropic provider acceptance and billing; savings or task-quality improvements; desktop/mobile native surfaces; subscription entitlement; Windows named-pipe transport. The local companion currently uses Unix sockets and is intended for macOS/Linux/WSL, not native Windows. Static assets still work only through the authenticated local server, not by opening the HTML as a file.

The native harness is evidence of correct official hook forwarding with mocked downstream inference. It does not prove a live provider honored the request or benchmark estimates match your workload. Review the receipt in a real session after supplying your own permitted data and access. APEX never starts a paid verification task by itself.

No standalone skill can turn unsupported old Claude versions into a native mod runtime. Install a current compatible CLI first. Do not enable permission bypass, scrape login credentials or patch private internals to make installation succeed.
