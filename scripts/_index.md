# scripts — Index

Current status: APEX 0.11.1-beta.1 executable beta.
Code and assets are public; dataset and inference fixtures are synthetic.
See the root README and verification document for actual limits.

- [check.mjs](./check.mjs) — release source or supporting artifact.
- [replay-sessions.mjs](./replay-sessions.mjs) — multi-step replay with failures part-way and model-switch cache cost, for comparing modes and versions.
- [refresh-task-scores.mjs](./refresh-task-scores.mjs) — re-reads per-task benchmark scores from AA model pages into core/task-scores.mjs.
- [replay.mjs](./replay.mjs) — replays labelled prompts through the router offline and scores each mode against always using the starting pair.
- [install.mjs](./install.mjs) — release source or supporting artifact.

- [native-preview.mjs](./native-preview.mjs) — labeled screenshot reference generated from shipped native UI component functions.

- [native-paint.py](./native-paint.py) — development-only real host PTY capture; isolated dummy configuration, pyte/Pillow, no inference.
