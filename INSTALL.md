# Install APEX

This repository is the **apex-tools marketplace**, containing the **apex** native mod.

## Requirements

- Claude Code CLI **2.1.292 or newer**. Native mods first appeared earlier, but this build was tested on 2.1.292. Older CLI installations cannot execute these hooks.
- Node.js **22+** for the local dashboard. The native routing hook runs inside Claude Code's mod runtime.
- A personal Artificial Analysis API key and permitted use of its data.
- A working Claude account or Anthropic API configuration. APEX does not log you in.

Check `claude --version` and `node --version`. If prerequisites are missing, upgrade through the official installers before installing this mod. APEX does not silently update Claude or global Node installations.

## Installation

```sh
claude plugin marketplace add AdamNsouli/apex
claude plugin install apex@apex-tools --scope user
```

Inside Claude Code the corresponding commands are `/plugin marketplace add AdamNsouli/apex` and `/plugin install apex@apex-tools`. Follow Claude's native trust prompts. Reload using `/reload-plugins` if available, or restart the session.

The terminal prompt dock appears automatically. Open `/apex` and run `/apex doctor`. `/apex dashboard` is optional. The latter prints a clickable private loopback URL. Keep its fragment token private. Node must be on Claude's PATH; `APEX_NODE` can select an explicit executable when it is not.

## Activate evidence-backed routing

1. Supply `APEX_AA_API_KEY` in the Claude process environment for a browser-free setup, or open **Settings** in the dashboard and enter your AA key. A key entered in the browser stays in companion memory and disappears when the companion closes. Do not put credentials in Git, prompts or the installation command.
2. In the native **Controls** tab, select your actual account backend and enter exact available model IDs. Native **Models** shows discovered pairs and AA variant slugs. The browser **Models** page additionally has complete selection forms. Confirm availability. Verify exact benchmark variant and effort mappings when IDs differ. Model/effort support comes from the discovered runtime capabilities, not a guessed model-family list.
3. Select a mode. If you pinned model or effort in settings/environment, or used `/model`, `/effort` or `/config` to override them, explicitly resume with `/apex auto` after verifying setup. APEX uses manual hold until you choose to relinquish that override.

For a direct API backend, APEX holds native settings until you explicitly permit routing in native **Controls** (enter a positive estimate budget and select **Allow within estimate budget**) or with browser **Allow credits** and an estimate budget, or `/apex credits allow 5` for a $5 API-equivalent routing budget. Consent resets on a new or cleared session. This grants consent to APEX; it does not change account billing or guarantee a $5 bill cap. Use `/usage-credits` yourself for Claude account extra usage.

## Commands

| Command                                                           | Effect                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/apex`                                                           | Open native control pane                                         |
| `/apex live`, `/apex timeline`, `/apex receipt`, `/apex controls` | Open a native inspector tab                                      |
| `/apex dock expanded`, `compact`, `hidden`                        | Persist the terminal dock display preference                     |
| `/apex dashboard`                                                 | Start/open link for authenticated local dashboard                |
| `/apex mode eco`                                                  | Change mode; accepts `balanced`, `quality`, `sports` too         |
| `/apex auto`                                                      | Resume automatic routing and relinquish APEX's detected pin hold |
| `/apex hold`                                                      | Keep native request settings                                     |
| `/apex why`                                                       | Latest request receipt                                           |
| `/apex models`                                                    | Joined model/effort catalogue and exclusions                     |
| `/apex doctor`                                                    | Host, discovery, data, pin and backend status                    |
| `/apex refresh`                                                   | Request background refresh within daily source limits            |
| `/apex credits allow USD_CAP`                                     | Grant APEX routing consent and estimate budget                   |
| `/apex credits off`                                               | Revoke APEX consent; account billing unchanged                   |
| `/apex allow-models subscription ID...`                           | Confirm model access; `api` also accepted                        |
| `/apex map RUNTIME_ID AA_SLUG EFFORT`                             | Save verified exact mapping; effort may be `default`             |

Native model and effort overrides suspend APEX. Live mode changes acknowledge a revision; the current streamed response is never interrupted or restarted by the mode switch.

## Update or remove

Update with `claude plugin marketplace update apex-tools`, then `claude plugin update apex@apex-tools` and reload/restart. Remove with `claude plugin uninstall apex@apex-tools --scope user`, then `claude plugin marketplace remove apex-tools` if no longer needed. Closing the browser does not stop routing; use `/apex hold` or disable/uninstall the mod. The local companion shuts down on normal native session exit, or after ten minutes without a native heartbeat.

Local preferences and cached benchmarks are managed by Claude's plugin store. Export your session receipts before restarting; do not expect the current in-memory timeline to survive reloads.

## Installer helper

After cloning and reviewing this repository, `node scripts/install.mjs` runs the same two official installation commands. `node scripts/install.mjs --local` installs from the inspected checkout. It checks versions and never changes global installations or billing.
