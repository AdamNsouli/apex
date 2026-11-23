// Plan limits. Claude Code reports the subscription's rate-limit windows
// (`five_hour`, `seven_day`, each with percentUsed and resetsAt) from the last API
// response. Near a limit APEX leans one step toward Save so the work in hand does
// not stop mid-task; very near, it uses Save. Critical tasks keep their floor in
// Save, so a risky prompt is not handed a weak model. Max Power once is the user's
// explicit choice and is never leaned.

export const LEAN_AT = { five_hour: 80, seven_day: 90 };
export const SAVE_AT = { five_hour: 95, seven_day: 97 };
const LADDER = ["save", "balanced", "best"];

export function readLimits(rateLimits) {
  const out = {};
  for (const w of Array.isArray(rateLimits) ? rateLimits : [])
    if (w && typeof w.kind === "string" && Number.isFinite(w.percentUsed))
      out[w.kind] = { percent: w.percentUsed, resetsAt: w.resetsAt ?? null };
  return out;
}

// → { steps: 0|1|2, kind, percent, resetsAt }
export function limitLean(rateLimits, setting = "auto") {
  const l = readLimits(rateLimits);
  if (setting === "off") return { steps: 0 };
  let best = { steps: 0 };
  for (const kind of Object.keys(LEAN_AT)) {
    const w = l[kind];
    if (!w) continue;
    const steps =
      w.percent >= SAVE_AT[kind] ? 2 : w.percent >= LEAN_AT[kind] ? 1 : 0;
    if (
      steps > best.steps ||
      (steps === best.steps && steps && w.percent > best.percent)
    )
      best = { steps, kind, percent: w.percent, resetsAt: w.resetsAt };
  }
  return best;
}

export function leanMode(mode, steps) {
  const i = LADDER.indexOf(mode);
  if (i < 0 || !steps) return mode;
  return LADDER[Math.max(0, i - steps)];
}

const label = { five_hour: "5h", seven_day: "week" };
// "5h 82% · week 40%" for the strip, or "" with no reading.
export function limitLabel(rateLimits) {
  const l = readLimits(rateLimits);
  return Object.keys(label)
    .filter((k) => l[k])
    .map((k) => `${label[k]} ${Math.round(l[k].percent)}%`)
    .join(" · ");
}

export function untilText(resetsAt, now) {
  const t = Date.parse(resetsAt ?? "");
  if (!Number.isFinite(t) || !Number.isFinite(now) || t <= now) return "";
  const m = Math.round((t - now) / 60000);
  return m < 90 ? `resets in ${m} min` : `resets in ${Math.round(m / 60)} h`;
}

export function limitsText(setting, rateLimits, now) {
  const reading = limitLabel(rateLimits);
  const lean = limitLean(rateLimits, setting);
  return [
    setting === "off"
      ? "APEX ignores your plan limits."
      : `APEX leans one step toward Save at 5h ${LEAN_AT.five_hour}% or week ${LEAN_AT.seven_day}%, and uses Save at ${SAVE_AT.five_hour}% / ${SAVE_AT.seven_day}%. Critical tasks keep their floor; Max Power once is never leaned.`,
    reading
      ? `Now: ${reading}.`
      : "No plan-limit reading yet (none until the first reply, and none on API billing).",
    lean.steps
      ? `Leaning ${lean.steps === 2 ? "to Save" : "one step"} because of ${label[lean.kind]} at ${Math.round(lean.percent)}%${untilText(lean.resetsAt, now) ? ", " + untilText(lean.resetsAt, now) : ""}.`
      : "",
    "Use /apex limits auto|off.",
  ]
    .filter(Boolean)
    .join(" ");
}
