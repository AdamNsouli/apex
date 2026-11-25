// Native charts for the strip and rail, drawn with the host's own Box and Text:
// coloured block runs, never an SVG in a frame. Every chart keeps a short text
// figure beside it, so the number is still readable where colour is not.
import { LEAN_AT, SAVE_AT, readLimits, untilText } from "../core/limits.mjs";
import { modelName, effortLabel } from "../core/presentation.mjs";

const RIGHT = "▏▎▍▌▋▊▉"; // 1/8 … 7/8 of a cell, filled from the left
const UP = "▁▂▃▄▅▆▇█"; // 1/8 … 8/8 of a cell, filled from the bottom

// Theme keys, so light and dark themes both keep their contrast.
export function modelColor(id) {
  const s = String(id ?? "");
  if (/haiku/i.test(s)) return "success";
  if (/sonnet/i.test(s)) return "suggestion";
  if (/opus/i.test(s)) return "claude";
  if (/fable/i.test(s)) return "merged";
  return "subtle";
}
// How hard the model was asked to think, as a share of the tallest column.
export function effortHeight(effort) {
  return (
    { low: 0.25, medium: 0.5, high: 0.75, xhigh: 0.875, max: 1 }[effort] ?? 0.5
  );
}
export function usageTone(kind, percent) {
  return percent >= (SAVE_AT[kind] ?? 95)
    ? "error"
    : percent >= (LEAN_AT[kind] ?? 80)
      ? "warning"
      : "success";
}
// "█████▌" for 5.5 of `width` cells, and the track that completes it.
export function barRuns(value, max, width) {
  const w = Math.max(1, Math.floor(width));
  const share =
    Number.isFinite(value) && Number.isFinite(max) && max > 0
      ? Math.min(1, Math.max(0, value / max))
      : 0;
  const eighths = Math.round(share * w * 8);
  const full = Math.floor(eighths / 8),
    part = eighths % 8;
  const fill = "█".repeat(full) + (part ? RIGHT[part - 1] : "");
  return { fill, track: "░".repeat(Math.max(0, w - fill.length)) };
}
const row = (Box, children, props = {}) =>
  Box({ flexDirection: "row", flexWrap: "nowrap", children, ...props });

// One horizontal bar: coloured fill, dim track.
export function bar(elements, { value, max = 100, width, color }) {
  const { Box, Text } = elements;
  const { fill, track } = barRuns(value, max, width);
  return row(Box, [
    ...(fill ? [Text({ children: fill, color, wrap: "truncate" })] : []),
    ...(track
      ? [Text({ children: track, dimColor: true, wrap: "truncate" })]
      : []),
  ]);
}
// The strip's inline meter: "5h ██████▌░ 82%".
export function meter(elements, kind, percent, width = 8) {
  const { Box, Text } = elements;
  const name = kind === "five_hour" ? "5h" : "week";
  return row(
    Box,
    [
      Text({ children: name, dimColor: true }),
      bar(elements, { value: percent, width, color: usageTone(kind, percent) }),
      Text({ children: Math.round(percent) + "%" }),
    ],
    { columnGap: 1 },
  );
}
export function meters(elements, rateLimits, width = 8) {
  const l = readLimits(rateLimits);
  return ["five_hour", "seven_day"]
    .filter((k) => l[k])
    .map((k) => meter(elements, k, l[k].percent, width));
}
// The rail's plan-usage gauges, one row per window, with the reset time and the
// line where APEX starts to lean toward Save.
export function usageGauges(elements, rateLimits, width, now) {
  const { Box, Text } = elements;
  const l = readLimits(rateLimits);
  const barWidth = Math.max(8, Math.min(40, width - 16));
  return ["five_hour", "seven_day"]
    .filter((k) => l[k])
    .map((k) =>
      Box({
        flexDirection: "column",
        children: [
          row(
            Box,
            [
              Text({
                children: (k === "five_hour" ? "5-hour" : "Week").padEnd(6),
                bold: true,
              }),
              bar(elements, {
                value: l[k].percent,
                width: barWidth,
                color: usageTone(k, l[k].percent),
              }),
              Text({ children: Math.round(l[k].percent) + "%", bold: true }),
            ],
            { columnGap: 1 },
          ),
          Text({
            children:
              " ".repeat(7) +
              [
                untilText(l[k].resetsAt, now),
                "leans to Save at " + LEAN_AT[k] + "%",
              ]
                .filter(Boolean)
                .join(" · "),
            dimColor: true,
            wrap: "truncate",
          }),
        ],
      }),
    );
}
// Share of requests per model, in request order of first use.
export function modelMix(state, events) {
  const counts = new Map();
  for (const e of events) {
    const id = e.apexRequested?.model;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()].map(([id, n]) => ({
    id,
    name: modelName(state, id),
    count: n,
    share: total ? n / total : 0,
    color: modelColor(id),
  }));
}
// One stacked bar of the model mix, then a colour key with each share.
export function mixChart(elements, state, events, width) {
  const { Box, Text } = elements;
  const mix = modelMix(state, events);
  if (!mix.length) return [];
  const w = Math.max(10, Math.min(48, width));
  let used = 0;
  const runs = mix.map((m, i) => {
    const cells =
      i === mix.length - 1 ? w - used : Math.max(1, Math.round(m.share * w));
    used += cells;
    return Text({
      children: "█".repeat(Math.max(0, cells)),
      color: m.color,
      wrap: "truncate",
    });
  });
  return [
    row(Box, runs),
    Box({
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: 2,
      children: mix.map((m) =>
        row(Box, [
          Text({ children: "■ ", color: m.color }),
          Text({
            children:
              m.name + " " + Math.round(m.share * 100) + "% (" + m.count + ")",
          }),
        ]),
      ),
    }),
  ];
}
// Column chart of recent requests: one column each, coloured by model, as tall
// as the effort asked for. Columns are two cells apart so each stays distinct.
export function requestColumns(elements, events, width, height = 4) {
  const { Box, Text } = elements;
  const fit = Math.max(1, Math.floor((width - 2) / 2));
  const list = events.slice(-fit);
  if (!list.length) return [];
  const rows = [];
  for (let r = 0; r < height; r++) {
    const base = (height - 1 - r) * 8;
    rows.push(
      row(Box, [
        Text({ children: "▕", dimColor: true }),
        ...list.map((e) => {
          const total = Math.round(
            effortHeight(e.apexRequested?.effort) * height * 8,
          );
          const cell = Math.min(8, Math.max(0, total - base));
          return Text({
            children: (cell ? UP[cell - 1] : " ") + " ",
            color:
              e.status === "error"
                ? "error"
                : modelColor(e.apexRequested?.model),
            dimColor: e.status === "streaming",
          });
        }),
      ]),
    );
  }
  rows.push(
    Text({
      children: "└" + "─".repeat(Math.min(width - 1, list.length * 2 + 1)),
      dimColor: true,
      wrap: "truncate",
    }),
  );
  return rows;
}
// The strip's tiny track: the last few picks as one coloured column each.
export function sparkline(elements, events, count = 6) {
  const { Box, Text } = elements;
  const list = events.slice(-count);
  if (!list.length) return null;
  return row(
    Box,
    list.map((e) =>
      Text({
        children: UP[Math.round(effortHeight(e.apexRequested?.effort) * 7)],
        color: modelColor(e.apexRequested?.model),
      }),
    ),
  );
}
// Labelled horizontal bars sharing one scale:
// [{ label, value, text?, note?, color?, strong? }].
export function hbars(elements, items, width, { max } = {}) {
  const { Box, Text } = elements;
  if (!items.length) return [];
  const top =
    max ??
    Math.max(...items.map((i) => (Number.isFinite(i.value) ? i.value : 0)));
  const labelWidth = Math.min(
    22,
    Math.max(...items.map((i) => String(i.label).length)),
  );
  const barWidth = Math.max(6, Math.min(30, width - labelWidth - 14));
  return items.map((i) =>
    row(
      Box,
      [
        Text({
          children:
            (i.strong ? "◆ " : "  ") +
            String(i.label).padEnd(labelWidth).slice(0, labelWidth),
          bold: Boolean(i.strong),
          dimColor: !i.strong,
        }),
        bar(elements, {
          value: Number.isFinite(i.value) ? i.value : 0,
          max: top || 1,
          width: barWidth,
          color: i.strong ? (i.color ?? "claude") : "subtle",
        }),
        Text({
          children:
            i.text ?? (Number.isFinite(i.value) ? String(i.value) : "?"),
          bold: Boolean(i.strong),
        }),
        ...(i.note ? [Text({ children: i.note, dimColor: true })] : []),
      ],
      { columnGap: 1 },
    ),
  );
}
export const pairShort = (state, p) =>
  p ? modelName(state, p.model) + " " + effortLabel(p.effort) : "unknown";
