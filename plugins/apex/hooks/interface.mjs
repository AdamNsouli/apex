import {
  MODES,
  modeSpec,
  REASONS,
  present,
  money,
  short,
  reason,
  modelName,
  pairLabel,
  effortLabel,
  whyShort,
  activityLine,
} from "../core/presentation.mjs";
import { limitLabel, limitLean, readLimits } from "../core/limits.mjs";
import {
  meters,
  usageGauges,
  mixChart,
  requestColumns,
  sparkline,
  hbars,
  modelColor,
  dayColumns,
} from "./charts.mjs";
// The lean note alone, for the row under the meters.
function leanNote(state) {
  const lean = limitLean(
    state.hostUsage?.rateLimits,
    state.control.limits ?? "auto",
  );
  return lean.steps === 2
    ? "near limit: Save"
    : lean.steps
      ? "near limit: cheaper"
      : "";
}
// One plain line on plan usage: the reading, and the lean when one applies.
function usageLine(state) {
  const rl = state.hostUsage?.rateLimits;
  const lean = limitLean(rl, state.control.limits ?? "auto");
  const label = limitLabel(rl);
  if (!label) return "";
  return lean.steps
    ? label +
        (lean.steps === 2 ? " · near limit: Save" : " · near limit: cheaper")
    : label;
}
// The second strip row when nothing needs attention: why the last pick, and what
// APEX did in this chat.
function summaryLine(state, d, withUsage) {
  return [
    state.demo ? "Demo data" : "",
    withUsage === "lean" ? leanNote(state) : withUsage ? usageLine(state) : "",
    whyShort(d.latest),
    activityLine(state),
  ]
    .filter(Boolean)
    .join(" · ");
}
import { duration, verdict } from "../core/receipt.mjs";
export { MODES, REASONS, money, short, reason };
export const describe = (state) =>
  present(state, {
    scope: state.ui?.scope === "auto" ? "main" : (state.ui?.scope ?? "main"),
    selectedId: state.ui?.selectedId,
  });
function kit(elements, width) {
  const { Box, Text, Button } = elements;
  return {
    text: (children, props = {}) => Text({ children, wrap: "wrap", ...props }),
    muted: (children) => Text({ children, dimColor: true, wrap: "wrap" }),
    row: (children, props = {}) =>
      Box({
        flexDirection: "row",
        flexWrap: "wrap",
        columnGap: 1,
        children,
        ...props,
      }),
    stack: (children, props = {}) =>
      Box({ flexDirection: "column", children, ...props }),
    rule: (label) =>
      Text({
        children: label
          ? "── " +
            label +
            " " +
            "─".repeat(Math.max(0, width - label.length - 5))
          : "─".repeat(width),
        dimColor: true,
        wrap: "truncate",
      }),
    button: (key, label, onPress, props = {}) => {
      const { disabled, ...supported } = props;
      return disabled
        ? Text({
            children: label + " · unavailable",
            dimColor: true,
            wrap: "wrap",
          })
        : Button({ key, label, onPress, plain: true, ...supported });
    },
  };
}
function chooser(k, state, actions) {
  return k.stack(
    Object.entries(MODES).map(([mode, spec], i) =>
      k.button(
        "mode-" + mode,
        (state.control.mode === mode ? "● " : "  ") + spec.label,
        async () => {
          await actions.change({ kind: "mode", mode });
          actions.modeMenu();
        },
        { hotkey: ["s", "b", "e"][i] },
      ),
    ),
  );
}
function modeButton(k, state, actions, width = 72) {
  return k.button(
    "mode-toggle",
    (width < 48
      ? modeSpec(state.control.mode).short
      : modeSpec(state.control.mode).label) + " ▾",
    actions.modeMenu,
    { hotkey: "m" },
  );
}
const scopeOf = (props, state) =>
  state.ui.scope === "auto" || !state.ui.scope
    ? (props.view?.agentId ?? "main")
    : state.ui.scope;
function eventLabel(state, e, width) {
  if (e.kind === "tool") return "▪ " + short(e.tool, width - 6);
  const mark =
    e.status === "streaming" ? "●" : e.status === "error" ? "◇" : "○";
  return (
    mark +
    " " +
    String(e.sequence).padStart(2, "0") +
    " " +
    short(modelName(state, e.apexRequested?.model), Math.max(6, width - 8))
  );
}
// The rail's picture of this chat: plan usage gauges, the model mix and a
// column per recent request. Each chart sits under a plain heading.
function overview(k, elements, state, d, width) {
  const out = [],
    rl = state.hostUsage?.rateLimits,
    main = d.scoped.filter((e) => e.kind !== "tool");
  if (Object.keys(readLimits(rl)).length)
    out.push(
      k.rule("PLAN USAGE"),
      k.stack(usageGauges(elements, rl, width, state.now ?? Date.now())),
    );
  if (main.length) {
    out.push(
      k.rule("MODELS IN THIS CHAT"),
      k.stack(mixChart(elements, state, main, width)),
      k.rule("RECENT REQUESTS"),
      k.stack(requestColumns(elements, main, Math.min(width, 50), 4)),
      k.muted("one column per request · colour = model · height = effort"),
    );
  }
  return out;
}
// Two bar pairs: the pick against your own setting, on task score and on cost.
function tradeoff(k, elements, state, e, width) {
  const sel = e.decisionSnapshot?.selected,
    base = e.decisionSnapshot?.baseline;
  if (!sel || !base) return [];
  const color = modelColor(e.apexRequested?.model);
  const out = [k.rule("THIS PICK VS YOUR SETTING"), k.muted("Task score")];
  out.push(
    k.stack(
      hbars(
        elements,
        [
          { label: "APEX pick", value: sel.taskScore, color, strong: true },
          { label: "Your setting", value: base.taskScore },
        ],
        width,
      ),
    ),
  );
  if (
    Number.isFinite(sel.benchmarkCostPerTask) &&
    Number.isFinite(base.benchmarkCostPerTask)
  )
    out.push(
      k.muted("Benchmark cost per task (shorter is cheaper)"),
      k.stack(
        hbars(
          elements,
          [
            {
              label: "APEX pick",
              value: sel.benchmarkCostPerTask,
              text: "$" + sel.benchmarkCostPerTask.toFixed(3),
              color,
              strong: true,
            },
            {
              label: "Your setting",
              value: base.benchmarkCostPerTask,
              text: "$" + base.benchmarkCostPerTask.toFixed(3),
            },
          ],
          width,
        ),
      ),
    );
  return out;
}
function candidates(k, elements, state, e, width) {
  const list = (e.ranked ?? []).slice(0, 5);
  if (!list.length) return [];
  return [
    k.rule("CANDIDATES"),
    k.muted("Task score · forecast cost for this request"),
    k.stack(
      hbars(
        elements,
        list.map((p) => ({
          label:
            short(modelName(state, p.model), 12) + " " + effortLabel(p.effort),
          value: p.rawScore,
          note: money(p.costUpperUsd),
          color: modelColor(p.model),
          strong:
            p.model === e.apexRequested?.model &&
            (p.effort ?? null) === (e.apexRequested?.effort ?? null),
        })),
        width,
      ),
    ),
  ];
}
function receipt(k, state, e, actions, elements, width = 60) {
  if (!e) return [k.muted("Select a request once work begins.")];
  const ms = duration(e),
    out = [
      k.rule("REQUEST " + e.sequence),
      k.muted(
        (e.agentId ? "Agent" : "Main") +
          " · " +
          e.status +
          (ms === null ? "" : " · " + (ms / 1000).toFixed(2) + " s"),
      ),
      k.text(verdict(e), { bold: true }),
    ];
  if (e.kind === "tool")
    return [
      ...out,
      k.text(e.tool),
      k.muted("Arguments, paths and outputs are not collected."),
    ];
  out.push(
    k.text("Chat setting: " + pairLabel(state, e.original)),
    k.text("APEX asked for: " + pairLabel(state, e.apexRequested), {
      bold: true,
    }),
    k.muted("Answered by: " + (e.responseModel ?? "not reported")),
    k.muted("Effort actually used: not reported by Claude"),
    k.rule("WHY"),
    k.text(reason(e.reason)),
    k.muted(
      "Task " +
        e.task +
        (e.scoreBasis && e.scoreBasis !== e.task
          ? " (scored on " + e.scoreBasis + ")"
          : "") +
        " · " +
        (e.mode ? modeSpec(e.mode).label : "Native") +
        (e.tier ? " · " + e.tier + " tier" : "") +
        (e.onceRevision && e.mode !== "best_once" ? " · Max Power once" : ""),
    ),
    k.muted("Risk " + e.risk + " · revision " + e.revision),
    ...(elements ? tradeoff(k, elements, state, e, width) : []),
    k.rule("COST"),
    k.text("Observed " + money(e.observedUsd)),
    k.muted("Request forecast " + money(e.estimateUsd)),
    k.muted("Estimated at API prices · your plan's real usage is not reported"),
  );
  const evidence = e.decisionSnapshot?.selected,
    baseline = e.decisionSnapshot?.baseline;
  out.push(k.rule("BENCHMARKS USED"));
  if (evidence)
    out.push(
      k.text(
        "Task index " +
          (evidence.taskScore ?? "unknown") +
          " · baseline " +
          (baseline?.taskScore ?? "unknown"),
      ),
      k.muted(
        "Intelligence " +
          (evidence.intelligence ?? "unknown") +
          (evidence.mathProxy ? " · math uses intelligence as a proxy" : ""),
      ),
      k.muted("AA " + evidence.aaSlug + " / " + effortLabel(evidence.effort)),
      k.muted("Benchmark method " + evidence.benchmarkVersion),
      k.muted(
        "Fetched " +
          (e.decisionSnapshot.fetchedAt
            ? new Date(e.decisionSnapshot.fetchedAt).toISOString()
            : "unknown"),
      ),
      k.muted(
        "Benchmark cost per task " +
          money(evidence.benchmarkCostPerTask) +
          " · separate from this request forecast",
      ),
    );
  else
    out.push(
      k.muted("This historical receipt has no frozen evidence snapshot."),
    );
  if (elements) out.push(...candidates(k, elements, state, e, width));
  else
    for (const p of (e.ranked ?? []).slice(0, 5))
      out.push(
        k.muted(
          short(p.model, 32) +
            " / " +
            effortLabel(p.effort) +
            " · task " +
            p.rawScore +
            " · forecast " +
            money(p.costUpperUsd) +
            (p.costPerTaskUsd == null
              ? ""
              : " · AA " + money(p.costPerTaskUsd) + "/task"),
        ),
      );
  out.push(
    k.button("receipt-json", "Print JSON receipt", () => actions.print(e)),
  );
  return out;
}
// One row offering to compact a long chat. Shown even when the strip is hidden:
// it appears once per threshold crossing and "Not now" clears it.
export function contextRow(elements, props, offer, actions) {
  const width = Math.max(16, (props.bodyColumns ?? 80) - 2),
    k = kit(elements, width);
  return k.row([
    k.text("APEX", { bold: true }),
    k.text(offer.text),
    k.button("context-compact", "Compact now", actions.compact, {
      hotkey: "k",
    }),
    k.button("context-dismiss", "Not now", actions.dismiss),
  ]);
}
export function dock(elements, props, state, actions) {
  if (
    state.ui.dock === "hidden" ||
    props.hasSurvey ||
    (state.ui.paneShown && state.ui.placement === "dock")
  )
    return null;
  const width = Math.max(16, (props.bodyColumns ?? 80) - 2),
    k = kit(elements, width),
    scope = props.view?.agentId ?? "main",
    d = present(state, { scope });
  const rows = [],
    pair = pairLabel(state, (d.active ?? d.latest)?.apexRequested),
    mode = modeButton(k, state, actions, width),
    inspect = k.button(
      "dock-inspect",
      "Inspect",
      () => actions.open("compact"),
      { hotkey: "i" },
    );
  if (width < 30)
    rows.push(
      k.row([
        k.text("APEX", { bold: true }),
        k.text(short(d.status, 9)),
        inspect,
      ]),
    );
  else if (width < 48)
    rows.push(k.row([k.text("APEX", { bold: true }), mode, inspect]));
  else if (width < 78) {
    // The 5-hour window as a small meter when there is room.
    const five = meters(elements, state.hostUsage?.rateLimits, 5)[0];
    const room = width - modeSpec(state.control.mode).label.length - 26;
    const showUsage = Boolean(five) && room - 13 >= 14;
    rows.push(
      k.row([
        k.text("APEX", { bold: true }),
        k.text(short(pair, Math.max(8, showUsage ? room - 13 : room)), {
          bold: true,
        }),
        ...(showUsage ? [five] : []),
        mode,
        inspect,
      ]),
    );
  } else {
    // Plan usage as two small meters, and the last few picks as a coloured
    // track (colour = model, height = effort).
    const status = d.status === "Routing" ? "" : d.status,
      allGauges = meters(elements, state.hostUsage?.rateLimits, 8),
      main = d.scoped.filter((e) => e.kind !== "tool"),
      lean = leanNote(state);
    // The pair is never cut for decoration: extras join in priority order
    // (5-hour meter, lean note, week meter, track) while they fit.
    let room =
      width -
      modeSpec(state.control.mode).label.length -
      22 -
      (status ? status.length + 1 : 0) -
      pair.length;
    const take = (cells) => (room >= cells ? ((room -= cells), true) : false);
    const gauges = [];
    if (allGauges[0] && take(16)) gauges.push(allGauges[0]);
    const showLean = Boolean(lean) && take(lean.length + 1);
    if (allGauges[1] && take(18)) gauges.push(allGauges[1]);
    const track =
      main.length && take(Math.min(6, main.length) + 1)
        ? sparkline(elements, main, 6)
        : null;
    room += pair.length;
    rows.push(
      k.row([
        k.text("APEX", { bold: true }),
        ...(track ? [track] : []),
        ...(status ? [k.muted(status)] : []),
        k.text(short(pair, Math.max(12, room)), { bold: true }),
        ...gauges,
        ...(showLean ? [k.text(lean, { color: "warning" })] : []),
        mode,
        inspect,
      ]),
    );
  }
  if (state.ui.dock !== "compact" && (props.maxRows ?? 2) >= 2) {
    // The demo shows the summary row it exists to show.
    let line = state.demo ? null : (d.pendingText ?? d.blocker ?? d.notice);
    if (scope !== "main")
      line =
        "Agent · native settings · " +
        (d.active?.status ?? d.latest?.status ?? "idle");
    if (!line)
      line =
        width < 48
          ? d.status + " · " + pair
          : summaryLine(state, d, width < 78) ||
            d.status + " · " + (d.active ? "working" : "idle");
    if (!d.latest && !d.pendingText && !d.blocker && !d.notice)
      line = "Your first request will appear here.";
    rows.push(k.muted(short(line, width)));
  }
  if (state.ui.modeMenu && width >= 30) rows.push(chooser(k, state, actions));
  return k.stack(rows, { paddingX: 1 });
}
// The weekly report: which model really answered, how often APEX changed the
// model, and requests per day as columns stacked by model.
function reportRows(k, elements, state, width) {
  const r = state.report,
    out = [k.text("This week", { bold: true })];
  if (!r || !r.total)
    return [
      ...out,
      k.muted(
        "No finished requests recorded in the last 7 days yet. APEX records them from 0.21 on, in every chat.",
      ),
    ];
  const pct = (n) => Math.round((n / r.total) * 100) + "%";
  out.push(
    k.muted(
      (r.demo ? "Includes demo data · " : "") +
        r.total +
        " requests in the last 7 days",
    ),
    k.rule("MODEL THAT ANSWERED"),
    k.stack(
      mixChart(
        elements,
        state,
        r.models.flatMap((m) =>
          Array.from({ length: m.count }, () => ({
            apexRequested: { model: m.id },
          })),
        ),
        width,
      ),
    ),
    k.rule("DID APEX CHANGE THE MODEL?"),
    k.stack(
      hbars(
        elements,
        [
          {
            label: "Changed",
            value: r.changed,
            text: pct(r.changed) + " (" + r.changed + ")",
            color: "claude",
            strong: true,
          },
          {
            label: "Kept setting",
            value: r.kept,
            text: pct(r.kept) + " (" + r.kept + ")",
          },
        ],
        width,
        { max: r.total },
      ),
    ),
    k.rule("REQUESTS PER DAY"),
    k.stack(dayColumns(elements, r.days, width)),
    k.muted(
      (r.mismatched
        ? r.mismatched + " answered by a different model than APEX asked for. "
        : "Every answer came from the model APEX asked for. ") +
        "Local record only; nothing leaves this computer.",
    ),
  );
  return out;
}
function evidenceRows(k, state, actions, elements, width = 60) {
  const out = [
      k.text("Evidence", { bold: true }),
      k.muted(
        "Artificial Analysis indices and prices; unavailable fields remain unknown.",
      ),
    ],
    page = state.ui.evidencePage ?? 0,
    list = state.catalogue.slice(page * 15, page * 15 + 15),
    task = state.control.taskOverride ?? state.intent.task;
  if (list.length && elements) {
    const w = Math.max(30, width);
    out.push(
      k.rule("INTELLIGENCE"),
      k.stack(
        hbars(
          elements,
          list.map((m) => ({
            label:
              short(modelName(state, m.runtimeId), 12) +
              " " +
              effortLabel(m.effort),
            value: m.evidence?.scores?.general,
            color: modelColor(m.runtimeId),
            strong: m.routable,
          })),
          w,
        ),
      ),
      k.rule("BENCHMARK COST PER TASK"),
      k.stack(
        hbars(
          elements,
          list.map((m) => ({
            label:
              short(modelName(state, m.runtimeId), 12) +
              " " +
              effortLabel(m.effort),
            value: m.evidence?.benchmarkCostPerTask,
            text: Number.isFinite(m.evidence?.benchmarkCostPerTask)
              ? "$" + m.evidence.benchmarkCostPerTask.toFixed(3)
              : "unknown",
            color: modelColor(m.runtimeId),
            strong: m.routable,
          })),
          w,
        ),
      ),
      k.muted("◆ = eligible on your plan"),
    );
  }
  if (!state.catalogue.length)
    out.push(
      k.muted(
        "No joined evidence yet. Connect AA and confirm exact mappings in Setup.",
      ),
    );
  for (const m of list)
    out.push(
      k.rule(),
      k.text(modelName(state, m.runtimeId) + " / " + effortLabel(m.effort), {
        bold: true,
      }),
      k.muted(
        m.routable
          ? "Eligible · account access confirmed"
          : "Excluded · " + m.exclusions.join(", "),
      ),
      k.text(
        "Intelligence " +
          (m.evidence?.scores?.general ?? "unknown") +
          " · task " +
          (m.evidence?.scores?.[task] ?? "unknown"),
      ),
      k.muted(
        "USD / 1M input " +
          (m.evidence?.prices?.input ?? "unknown") +
          " · output " +
          (m.evidence?.prices?.output ?? "unknown"),
      ),
      k.muted(
        "Benchmark cost per task " + money(m.evidence?.benchmarkCostPerTask),
      ),
      k.muted("Benchmark entry " + (m.evidence?.slug ?? "unmapped")),
    );
  out.push(
    k.row([
      k.button(
        "evidence-prev",
        "Previous",
        () => actions.page("evidencePage", -1),
        { disabled: page === 0 },
      ),
      k.text("Page " + (page + 1)),
      k.button("evidence-next", "Next", () => actions.page("evidencePage", 1), {
        disabled: (page + 1) * 15 >= state.catalogue.length,
      }),
    ]),
  );
  return out;
}
function credits(k, elements, state, actions) {
  const d = present(state),
    out = [
      k.text("APEX routing consent", { bold: true }),
      k.muted(
        "This does not buy credits or enable Claude account extra usage.",
      ),
      k.text(
        state.control.creditsConsent
          ? "Allowed · estimate budget $" + state.control.budgetUsd
          : "API-funded routing changes are off.",
      ),
      k.text("Observed " + d.observed),
      k.muted("Reservations " + money(state.cost?.reservedApiEquivalentUsd)),
      k.muted(
        "Unknown-cost requests " + d.unknownCosts + " · account charge unknown",
      ),
    ];
  if (elements.Input)
    out.push(
      elements.Input({
        key: "credit-budget",
        label: "Estimate budget USD",
        value: state.ui.budget,
        placeholder: "Positive amount",
        onInput: actions.budget,
        onSubmit: actions.credits,
      }),
      k.button("credits-allow", "Allow within estimate budget", () =>
        actions.credits(state.ui.budget),
      ),
    );
  if (state.control.creditsConsent)
    out.push(
      k.button("credits-revoke", "Revoke APEX consent", () =>
        actions.change({ kind: "credits", allowed: false, budgetUsd: 0 }),
      ),
    );
  out.push(k.muted("Account billing: run /usage-credits yourself in Claude."));
  return out;
}
function settings(k, elements, state, actions, props) {
  const { Input, Select } = elements,
    d = present(state),
    out = [
      k.text("Setup & settings", { bold: true }),
      k.rule("1 · HOST"),
      k.muted(
        "Claude " + state.hostVersion + " · " + props.placement + " pane",
      ),
      k.muted("Native typography, focus and placement belong to Claude."),
      k.rule("2 · EVIDENCE"),
      k.text(
        state.aaStatus === "connected"
          ? "AA connected"
          : "AA connection needed",
      ),
      k.muted(
        "Set APEX_AA_API_KEY before launching Claude. Keys never belong in a prompt or plain native input.",
      ),
      k.button("dashboard", "Get local browser link", actions.dashboard),
      k.muted(
        "Last good fetch " +
          (d.fetchedAt ? new Date(d.fetchedAt).toISOString() : "none"),
      ),
      k.muted(
        "Next refresh " +
          (d.nextRefreshAt
            ? new Date(d.nextRefreshAt).toISOString()
            : "eligible now"),
      ),
      k.button("refresh", "Refresh catalogue", actions.refresh, {
        disabled: !d.refreshEligible,
      }),
      k.rule("3 · ACCOUNT & MAPPING"),
    ];
  if (Select && Input) {
    out.push(
      Select({
        key: "backend",
        label: "Billing backend",
        value: state.ui.backend,
        options: [
          { value: "unknown", label: "Not confirmed" },
          { value: "subscription", label: "Claude subscription" },
          { value: "api", label: "Anthropic API" },
        ],
        onSelect: actions.backend,
      }),
    );
    if (state.runtime.length)
      out.push(
        Select({
          key: "access-id",
          label: "Discovered model",
          value: state.ui.accessId,
          options: [
            { value: "", label: "Select a model" },
            ...state.runtime.map((m) => ({
              value: m.id,
              label: m.name + " · " + m.id,
            })),
          ],
          onSelect: (value) => actions.draft("accessId", value),
        }),
        k.button(
          "confirm-id",
          "Confirm access to selected model",
          () =>
            actions.availability(
              [...new Set([...state.control.verifiedIds, state.ui.accessId])]
                .filter(Boolean)
                .join(" "),
            ),
          { disabled: !state.ui.accessId },
        ),
      );
    out.push(
      k.muted("Confirm only IDs your account can actually use."),
      Input({
        key: "available-models",
        label: "Advanced: exact permitted IDs",
        value: state.ui.ids,
        placeholder: "Space-separated IDs",
        onInput: actions.ids,
        onSubmit: actions.availability,
      }),
    );
    if (state.runtime.length && state.aaVariants.length)
      out.push(
        Select({
          key: "map-runtime",
          label: "Runtime ID",
          value: state.ui.mapRuntimeId,
          options: [
            { value: "", label: "Select runtime" },
            ...state.runtime.map((m) => ({ value: m.id, label: m.name })),
          ],
          onSelect: (value) => actions.draft("mapRuntimeId", value),
        }),
        Select({
          key: "map-slug",
          label: "Exact AA variant",
          value: state.ui.mapSlug,
          options: [
            { value: "", label: "Select AA variant" },
            ...state.aaVariants.map((m) => ({
              value: m.slug,
              label: m.name + " / " + effortLabel(m.effort),
            })),
          ],
          onSelect: (value) => actions.draft("mapSlug", value),
        }),
        Select({
          key: "map-effort",
          label: "Requested effort",
          value: state.ui.mapEffort,
          options: [
            "default",
            ...(state.runtime.find((m) => m.id === state.ui.mapRuntimeId)
              ?.efforts ?? []),
          ].map((value) => ({ value, label: effortLabel(value) })),
          onSelect: (value) => actions.draft("mapEffort", value),
        }),
        k.button(
          "confirm-mapping",
          "Confirm exact mapping",
          () =>
            actions.mapping(
              state.ui.mapRuntimeId +
                " " +
                state.ui.mapSlug +
                " " +
                state.ui.mapEffort,
            ),
          {
            disabled:
              !state.ui.mapRuntimeId ||
              !state.ui.mapSlug ||
              !state.aaVariants.some(
                (m) =>
                  m.slug === state.ui.mapSlug &&
                  m.effort ===
                    (state.ui.mapEffort === "default"
                      ? null
                      : state.ui.mapEffort),
              ),
          },
        ),
      );
    out.push(
      Input({
        key: "mapping",
        label: "Advanced: verified AA mapping",
        value: "",
        placeholder: "runtime-ID AA-slug effort",
        onSubmit: actions.mapping,
      }),
      k.rule("4 · ROUTING"),
      Select({
        key: "task",
        label: "Task evidence",
        value: state.control.taskOverride ?? "auto",
        options: [
          "auto",
          "general",
          "coding",
          "agentic_coding",
          "math",
          "healthcare",
          "legal",
          "finance",
          "economics",
          "engineering",
          "strategy",
        ].map((value) => ({
          value,
          label:
            value === "auto"
              ? "Auto classify"
              : value === "math"
                ? "Math · intelligence proxy"
                : value.replaceAll("_", " "),
        })),
        onSelect: (task) =>
          actions.change({ kind: "task", task: task === "auto" ? null : task }),
      }),
    );
  }
  out.push(
    k.button("evidence", "Compare model evidence", () =>
      actions.view("evidence"),
    ),
    k.button(
      "auto",
      d.status === "Held" ? "Resume routing" : "Hold native settings",
      actions.toggle,
    ),
    k.button("credits", "APEX routing consent", () => actions.view("credits")),
    k.rule("DISPLAY"),
    k.row([
      k.button("dock-expanded", "Two-row strip", () =>
        actions.dock("expanded"),
      ),
      k.button("dock-compact", "One-row strip", () => actions.dock("compact")),
      k.button("dock-hidden", "Hide strip", () => actions.dock("hidden")),
    ]),
    k.button("open-rail", "Open compact rail", () => actions.open("compact")),
    k.rule("ABOUT"),
    k.text("APEX by Zoran"),
    k.muted("Adaptive model routing for Claude Code."),
    k.muted(
      "Independent project · account billing and effective effort remain unknown.",
    ),
  );
  return out;
}
export function pane(elements, props, state, actions) {
  const width = Math.max(16, (props.bodyColumns ?? 72) - 4),
    k = kit(elements, width),
    scope = scopeOf(props, state),
    d = present(state, { scope, selectedId: state.ui.selectedId }),
    view = state.ui.view ?? "compact",
    body = [];
  const header = k.row([
    k.text("APEX", { bold: true }),
    k.muted(d.status),
    k.button("pane-close", "Hide", actions.close),
  ]);
  if (view === "compact") {
    body.push(
      k.text(short(d.currentPair, width), { bold: true }),
      k.row([
        modeButton(k, state, actions, width),
        k.button("inspect", "Inspect", () => actions.view("inspect")),
        k.button("report", "This week", () => actions.report?.()),
      ]),
      k.muted(
        whyShort(d.latest) ||
          ((d.active ?? d.latest)?.status ?? "Nothing routed yet"),
      ),
      ...(activityLine(state) ? [k.muted(activityLine(state))] : []),
      ...overview(k, elements, state, d, width),
      k.rule(),
    );
    let previous;
    for (const e of d.scoped.filter((e) => e.kind !== "tool").slice(-3)) {
      const changed =
        previous &&
        (previous.apexRequested.model !== e.apexRequested.model ||
          previous.apexRequested.effort !== e.apexRequested.effort);
      body.push(
        k.button(
          "receipt-" + e.id,
          (changed ? "└ " : previous ? "│ " : "") +
            eventLabel(state, e, width - 2),
          () => actions.select(e.id),
        ),
        k.muted("  " + effortLabel(e.apexRequested?.effort) + " · " + e.status),
      );
      previous = e;
    }
    if (!d.latest) body.push(k.muted("Your first request will appear here."));
    if (d.pendingText) body.push(k.text(d.pendingText));
    else if (d.blocker) body.push(k.muted(d.blocker));
    else if (d.notice) body.push(k.muted(d.notice));
    body.push(
      k.button("settings", d.blocker ? "Set up" : "Settings", () =>
        actions.view("settings"),
      ),
    );
  } else if (view === "settings")
    body.push(...settings(k, elements, state, actions, props));
  else if (view === "credits")
    body.push(...credits(k, elements, state, actions));
  else if (view === "report")
    body.push(...reportRows(k, elements, state, width));
  else if (view === "evidence")
    body.push(...evidenceRows(k, state, actions, elements, width));
  else {
    body.push(
      k.row([
        modeButton(k, state, actions, width),
        k.button("settings", "Settings", () => actions.view("settings")),
      ]),
    );
    if (d.pendingText) body.push(k.text(d.pendingText));
    if (d.agents.length && elements.Select)
      body.push(
        elements.Select({
          key: "scope",
          label: "Conversation",
          value: state.ui.scope ?? "auto",
          options: [
            { value: "auto", label: "Follow Claude view" },
            { value: "main", label: "Main" },
            ...d.agents.map((id, i) => ({
              value: id,
              label: "Agent " + (i + 1),
            })),
          ],
          onSelect: actions.scope,
        }),
      );
    const page = state.ui.historyPage ?? 0,
      rows = d.scoped
        .slice()
        .reverse()
        .slice(page * 15, page * 15 + 15);
    body.push(
      k.row([
        k.rule("HISTORY"),
        k.button(
          "follow-live",
          state.ui.selectedId ? "Follow live" : "Following live",
          () => actions.select(null),
          { disabled: !state.ui.selectedId },
        ),
      ]),
    );
    for (const e of rows)
      body.push(
        k.button(
          "receipt-" + e.id,
          (e.id === d.selected?.id ? "› " : "") +
            eventLabel(state, e, width - 2),
          () => actions.select(e.id),
        ),
      );
    if (!rows.length)
      body.push(k.muted("No observed events in this conversation."));
    if (d.scoped.length > 15)
      body.push(
        k.row([
          k.button(
            "history-prev",
            "Previous",
            () => actions.page("historyPage", -1),
            { disabled: page === 0 },
          ),
          k.text("Page " + (page + 1)),
          k.button(
            "history-next",
            "Next",
            () => actions.page("historyPage", 1),
            { disabled: (page + 1) * 15 >= d.scoped.length },
          ),
        ]),
      );
    body.push(
      ...receipt(k, state, d.selected, actions, elements, width),
      k.rule("INTERVENE"),
      k.button(
        "auto",
        d.status === "Held" ? "Resume routing" : "Hold native settings",
        actions.toggle,
      ),
      k.button(
        "quality-once",
        state.control.qualityOnce ? "Cancel Max Power once" : "Max Power once",
        () =>
          actions.change({
            kind: "quality_once",
            armed: !state.control.qualityOnce,
          }),
      ),
      k.button("credits", "APEX routing consent", () =>
        actions.view("credits"),
      ),
      k.muted(
        "Base mode " + d.mode.label + " · revision " + state.control.revision,
      ),
    );
  }
  if (state.ui.modeMenu)
    body.unshift(
      chooser(k, state, actions),
      k.muted("Baseline protection still applies when required."),
    );
  if (state.ui.notice)
    body.unshift(k.text((state.ui.noticeError ? "! " : "") + state.ui.notice));
  if (state.refreshError) body.unshift(k.muted(state.refreshError));
  if (view !== "compact")
    body.unshift(
      k.button("back-compact", "Back to compact rail", () =>
        actions.view("compact"),
      ),
    );
  return k.stack([header, ...body], {
    gap: view === "compact" ? 0 : 1,
    padding: 1,
  });
}
