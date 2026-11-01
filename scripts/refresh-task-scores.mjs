// Refresh the per-task benchmark snapshot (plugins/apex/core/task-scores.mjs).
//
//   node scripts/refresh-task-scores.mjs [--ids claude-haiku-5-5,claude-sonnet-5-5,...]
//
// AA's free API gives only the overall and sector indices for current models, so
// coding, agentic work, reasoning and knowledge scores are read from each effort
// variant's public model page (robots.txt allows it). Run it after AA adds a model
// or re-scores one; the router ignores the snapshot once AA's index version moves on.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_FIELDS } from "../plugins/apex/core/catalogue.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "../plugins/apex/core/task-scores.mjs");
const LEVELS = ["low", "medium", "high", "xhigh"];
const i = process.argv.indexOf("--ids");
const ids = (
  i > 0
    ? process.argv[i + 1]
    : "claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5"
).split(",");

// One model object in the page data starts with {"id":"<uuid>","slug":...; the
// record for `slug` runs until the next one, so a missing field cannot be read
// from a neighbour.
export function readRecord(html, slug) {
  const s = html.replace(/\\"/g, '"');
  // Anchored on the model object's own id: a nested "release" object carries the
  // bare slug and name too.
  const at = new RegExp(
    '\\{"id":"[0-9a-f-]{36}","slug":"' +
      slug.replace(/[.-]/g, "\\$&") +
      '","name"',
  ).exec(s);
  if (!at) return null;
  const start = at.index + 1;
  const next = s.slice(start + 10).search(/\{"id":"[0-9a-f-]{36}","slug":"/);
  const seg = s.slice(start, next < 0 ? start + 12000 : start + 10 + next);
  const row = {};
  for (const f of ["intelligenceIndex", ...EVAL_FIELDS]) {
    const m = new RegExp('"' + f + '":(-?[0-9.]+(?:e-?[0-9]+)?|null)').exec(
      seg,
    );
    row[f] = m && m[1] !== "null" ? Number(Number(m[1]).toFixed(4)) : null;
  }
  return row;
}

const models = {};
let version = null;
for (const id of ids)
  for (const slug of [...LEVELS.map((l) => id + "-" + l), id]) {
    const r = await fetch("https://artificialanalysis.ai/models/" + slug, {
      headers: { "user-agent": "apex-router task-score refresh" },
    });
    if (!r.ok) {
      console.error(slug, "HTTP", r.status, "(skipped)");
      continue;
    }
    const html = await r.text();
    version ??= /Intelligence Index v(\d+)/.exec(html)?.[1] ?? null;
    const row = readRecord(html, slug);
    if (!row || EVAL_FIELDS.every((f) => row[f] == null)) {
      console.error(slug, "no per-task data (skipped)");
      continue;
    }
    models[slug] = row;
    console.log(slug, JSON.stringify(row));
  }
if (!version || !Object.keys(models).length) {
  console.error("Nothing read; snapshot left as it was.");
  process.exit(1);
}
const body =
  "// Per-task benchmark scores from Artificial Analysis model pages, written by\n" +
  "// scripts/refresh-task-scores.mjs. Used only while AA's index version matches.\n" +
  "export const TASK_SCORES = Object.freeze(" +
  JSON.stringify(
    {
      version,
      capturedAt: new Date().toISOString().slice(0, 10),
      source: "https://artificialanalysis.ai/models/<slug>",
      models,
    },
    null,
    2,
  ) +
  ");\n";
await writeFile(out, body);
console.log("wrote", path.relative(process.cwd(), out));
