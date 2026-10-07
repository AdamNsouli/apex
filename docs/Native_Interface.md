# Native interface — 0.2.0-beta.1

The primary interface uses Claude Code's [public native UI hooks](https://code.claude.com/docs/en/plugins/mods/interface). No private terminal patch, companion process or browser is required for the dock and inspector. AA can be connected through `APEX_AA_API_KEY`; the optional browser provides a masked key field and complete catalogue pickers.

| Surface                | Behavior                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Terminal `AbovePrompt` | Persistent model/effort/status strip, modes and Inspect shortcut; expanded, compact or hidden preference          |
| Terminal `Pane`        | Five-tab native inspector; host chooses sidebar versus inline placement                                           |
| Desktop `Pane`         | Same native primitives and callbacks; harness validated, actual host paint unverified                             |
| Other host surfaces    | No promise of native dock or inspector integration; browser console is available on supported companion platforms |

The prompt dock is a terminal-only site in the host contract. It returns the downstream tree unchanged when hidden or when `hasSurvey` is true. Otherwise it nests the downstream tree before APEX's dock. It sizes text to `bodyColumns`, respects available row hints and leaves the host in charge of wrapping, scrolling and focus. An agent transcript shows that agent's observed pair and says native settings; it does not mislabel it as an automatically routed main request.

The terminal person can focus the band with `ctrl+x tab` or a click. Mode hotkeys there are letters `e`, `b`, `q`, `s`, and Inspect is `i`. Digits are deliberately not bound in the band, because the native host may trigger digit buttons from an empty composer. In the focused inspector, `l/t/r/m/c` select tabs and `1/2/3/4` select modes. Normal Tab/Enter navigation and Esc remain host-owned. These hotkeys are active while their native site has focus; they do not capture ordinary prompt typing.

| Tab      | What it shows and does                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live     | Current or last main pair, requested effort, response model, selection reason, partial cost provenance and recent work; four live modes                          |
| Timeline | Most recent 30 retained events, newest first; selecting a row opens its receipt                                                                                  |
| Receipt  | Original/outgoing pair, provider-reported model, effective-effort unknown, task/risk, reason, forecasts and candidates; print complete JSON                      |
| Models   | First 30 joined pairs and AA variants, eligibility/exclusions, intelligence/task score, token prices, AA benchmark cost/task and exact slugs                     |
| Controls | Modes, hold/resume, explicit credit consent and positive estimate budget, revoke, dock display, backend, available IDs, task evidence, exact mapping and refresh |

The catalogue and ledger remain complete even when the native list limits its visible rows. `/apex models` prints the full joined catalogue; `/apex why` prints the latest ledger event. The browser provides the full retained timeline, export and complete model selectors.

Mode and routing changes use the same expected-revision validation as the existing commands and dashboard. A changed mode can appear beside a still-streaming pair: the pane labels it queued for the next request. It does not claim the current provider invocation changed. Credit consent requires a positive finite estimate budget; invalid input displays an error and leaves consent unchanged. It is APEX routing consent, not account extra-usage activation or a purchase. Actual billed credits and effective provider effort remain unknown.

Dock display preference is local and persistent. Selected tab, receipt and input drafts are UI state; they do not change the routing policy. Credits reset on a new/cleared session as before. A hidden dock is recoverable with `/apex` or `/apex dock expanded`. Manual model/effort overrides continue to suspend routing until explicitly resumed.

Native typography, button chrome, focus, pane placement and scrolling belong to the host. The [native reference image](screenshots/native-interface-reference.png) is rendered from the shipped component functions with visibly labeled synthetic state. It is not a live terminal screenshot. The official native harness validates elements and callbacks on terminal/desktop but does not paint either host. [Browser captures](screenshots/_index.md) use the working browser app with a labeled synthetic native bridge. No image represents real benchmark performance, provider inference or billing.
