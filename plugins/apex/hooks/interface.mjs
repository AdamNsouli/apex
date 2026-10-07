// Native host primitives only: no private terminal patching or browser dependency.
export const MODES = {
  eco: {
    label: "Eco",
    color: "#3ECF8E",
    detail: "Lower cost within the quality floor",
  },
  balanced: {
    label: "Balanced",
    color: "#5B8CFF",
    detail: "Quality, speed and cost",
  },
  quality: {
    label: "High Quality",
    color: "#B6A0FF",
    detail: "Strongest available task evidence",
  },
  sports: {
    label: "Sports",
    color: "#E8A33D",
    detail: "Near-best quality, faster delivery",
  },
};
export const REASONS = {
  manual_hold: "Your native model and effort settings are in control.",
  evidence_missing_or_expired:
    "Connect fresh Artificial Analysis evidence before automatic switching.",
  backend_not_confirmed:
    "Confirm your billing backend and available model IDs in Controls.",
  baseline_evidence_unknown:
    "The native model / effort pair needs verified benchmark evidence.",
  context_tokens_unknown: "Waiting for Claude to report context usage.",
  no_eligible_evidence:
    "No verified model meets the capability and evidence requirements.",
  incomparable_benchmarks: "Benchmark versions cannot be fairly compared.",
  missing_task_evidence: "This task has no comparable benchmark evidence.",
  quality_floor: "Kept the native pair to preserve quality on this task.",
  baseline_quality_floor:
    "The alternative falls below the baseline quality floor.",
  cache_payback_unknown_or_negative:
    "A cheaper switch does not justify its cache transition cost.",
  paid_routing_consent_required:
    "API-funded changes require explicit APEX credit consent.",
  api_equivalent_budget:
    "The switch would exceed the APEX estimate budget, or its cost is unknown.",
  switch_hysteresis:
    "Retained the recent pair to avoid unnecessary model switching.",
  agent_native_settings:
    "This subagent keeps its native model and effort settings.",
  eco_utility: "Selected for lower cost within the quality floor.",
  balanced_utility: "Selected for the balance of quality, speed and cost.",
  quality_utility: "Selected for the strongest available task evidence.",
  sports_utility:
    "Selected for faster delivery near the best available quality.",
};
const colors = {
  muted: "#9BA3B5",
  dim: "#858EA1",
  line: "#303645",
  green: "#3ECF8E",
  red: "#E5544B",
  blue: "#5B8CFF",
};
export const money = (n) =>
  typeof n === "number" && Number.isFinite(n)
    ? "≈ $" + n.toFixed(4)
    : "unknown";
export const short = (s, width = 45) =>
  String(s ?? "unknown").length > width
    ? String(s).slice(0, Math.max(1, width - 1)) + "…"
    : String(s ?? "unknown");
export const reason = (code) =>
  REASONS[code] ??
  "Native settings retained; inspect /apex why for the receipt.";
export function describe(state) {
  const requests = state.events.filter((e) => e.kind !== "tool");
  const active = requests.findLast(
    (e) => e.status === "streaming" && !e.agentId,
  );
  const latest = requests.findLast((e) => !e.agentId);
  const selected =
    state.events.find((e) => e.id === state.ui.selectedId) ?? active ?? latest;
  const known = requests.filter((e) => typeof e.observedUsd === "number");
  return {
    requests,
    active,
    latest,
    selected,
    mode: MODES[state.control.mode],
    cost: known.length
      ? money(state.cost.observedApiEquivalentUsd) +
        (state.cost.unknownCostRequests ? " · partial" : "")
      : "not yet observed",
  };
}
function kit(elements, width) {
  const { Box, Text, Button } = elements;
  return {
    text: (children, props = {}) => Text({ children, wrap: "wrap", ...props }),
    muted: (children) => Text({ children, color: colors.muted, wrap: "wrap" }),
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
          : "─".repeat(Math.max(1, width)),
        color: colors.line,
        wrap: "truncate",
      }),
    button: (key, label, onPress, props = {}) =>
      Button({ key, label, onPress, plain: true, ...props }),
  };
}
function modes(k, state, actions, compact = false, inDock = false) {
  return k.row(
    Object.entries(MODES).map(([mode, spec], index) =>
      k.button(
        "mode-" + mode,
        (mode === state.control.mode ? "● " : "") +
          (compact && mode === "quality" ? "Quality" : spec.label),
        () => actions.change({ kind: "mode", mode }),
        {
          hotkey: inDock ? ["e", "b", "q", "s"][index] : String(index + 1),
          dimColor: mode !== state.control.mode,
        },
      ),
    ),
    { rowGap: 0 },
  );
}
export function dock(elements, props, state, actions) {
  const width = Math.max(20, (props.bodyColumns ?? 72) - 2),
    k = kit(elements, width),
    d = describe(state);
  if (state.ui.dock === "hidden" || props.hasSurvey) return null;
  const agent = props.view?.agentId;
  const live = agent
    ? d.requests.findLast((e) => e.agentId === agent)
    : (d.active ?? d.latest);
  const label = agent
    ? "AGENT · native settings"
    : state.control.routing === "auto"
      ? "AUTO"
      : "MANUAL HOLD";
  const line = k.row([
    k.text("APEX", { bold: true, color: d.mode.color }),
    k.text(label, { color: colors.muted }),
    k.text(MODES[state.control.mode].label, { color: d.mode.color }),
    k.button("dock-inspect", "Inspect", actions.open, { hotkey: "i" }),
  ]);
  const details = k.text(
    live
      ? short(live.apexRequested.model, Math.max(14, width - 25)) +
          " / " +
          (live.apexRequested.effort ?? "default") +
          " · " +
          live.status
      : "Ready · waiting for a request",
    { color: colors.muted },
  );
  const rows = [line];
  if ((props.maxRows ?? 4) >= 2) rows.push(details);
  if (state.ui.dock === "expanded" && (props.maxRows ?? 4) >= 3)
    rows.push(modes(k, state, actions, width < 60, true));
  if (state.ui.dock === "expanded" && (props.maxRows ?? 4) >= 4)
    rows.push(
      k.muted(
        agent
          ? "Subagent settings are observed, not routed."
          : "Modes apply to the next request · /apex dock compact",
      ),
    );
  return k.stack(rows, { paddingX: 1 });
}
export function pane(elements, props, state, actions) {
  const width = Math.max(20, (props.bodyColumns ?? 72) - 4),
    k = kit(elements, width),
    d = describe(state);
  const tab = state.ui.tab,
    body = [];
  const observedLabel = "API-equivalent · token-price estimate, not a bill";
  if (tab === "live") {
    body.push(
      k.text(d.mode.label, { bold: true, color: d.mode.color }),
      k.muted(d.mode.detail),
      k.rule("CURRENT REQUEST"),
    );
    const row = d.active ?? d.latest;
    if (row) {
      body.push(
        k.text(short(row.apexRequested.model, width), { bold: true }),
        k.row([
          k.text("Requested " + (row.apexRequested.effort ?? "default"), {
            color: d.mode.color,
          }),
          k.muted(
            row.status +
              (row.status === "streaming" &&
              row.revision !== state.control.revision
                ? " · next mode queued"
                : ""),
          ),
        ]),
        k.muted("Response model: " + (row.responseModel ?? "not yet reported")),
        k.muted("Effective effort: not reported by provider"),
        k.text(reason(row.reason)),
      );
    } else
      body.push(
        k.text("Ready when you are", { bold: true }),
        k.muted(
          "Your next Claude request starts the timeline. Native settings stay active until routing has verified evidence.",
        ),
      );
    body.push(
      k.rule("SESSION"),
      k.text(d.cost),
      k.muted(observedLabel),
      k.muted(
        "Reserved forecast " +
          money(state.cost.reservedApiEquivalentUsd) +
          " · actual billed credits unknown",
      ),
      k.rule("RECENT WORK"),
    );
    for (const e of state.events.slice(-4).reverse())
      body.push(
        k.text(
          (e.status === "complete"
            ? "✓ "
            : e.status === "error"
              ? "× "
              : "◉ ") +
            (e.kind === "tool"
              ? e.tool
              : short(e.apexRequested.model, width - 16) +
                " / " +
                (e.apexRequested.effort ?? "default")) +
            " · " +
            e.status,
          { color: e.status === "error" ? colors.red : colors.muted },
        ),
      );
    if (!state.events.length)
      body.push(k.muted("No requests or tools observed yet."));
    body.push(
      k.button("live-timeline", "Open timeline", () => actions.tab("timeline")),
      k.muted(
        "AA " +
          (state.aaStatus === "connected" ? "connected" : "key needed") +
          " · " +
          state.control.verifiedIds.length +
          " verified model IDs",
      ),
    );
  } else if (tab === "timeline") {
    body.push(
      k.text("Work timeline", { bold: true }),
      k.muted("Newest first · up to 30 rows · select a receipt"),
    );
    if (!state.events.length)
      body.push(
        k.text("No work recorded yet"),
        k.muted(
          "Requests show the outgoing pair, response model and cost provenance. Tools show name and status only.",
        ),
      );
    for (const e of state.events.slice(-30).reverse()) {
      body.push(
        k.button(
          "receipt-" + e.id,
          (e.id === state.ui.selectedId ? "› " : "") +
            "#" +
            e.sequence +
            " " +
            short(
              e.kind === "tool"
                ? e.tool
                : e.apexRequested.model +
                    " / " +
                    (e.apexRequested.effort ?? "default"),
              Math.max(12, width - 18),
            ),
          () => actions.select(e.id),
        ),
        k.muted(
          "  " +
            e.status +
            (e.kind === "tool"
              ? ""
              : " · " +
                (e.agentId ? "agent" : "main") +
                " · " +
                MODES[e.mode]?.label +
                " · " +
                money(e.observedUsd)),
        ),
      );
    }
  } else if (tab === "receipt") {
    const e = d.selected;
    body.push(k.text("Decision receipt", { bold: true }));
    if (!e)
      body.push(k.muted("Select a request from Timeline once work begins."));
    else if (e.kind === "tool")
      body.push(
        k.text(e.tool),
        k.muted("Status: " + e.status),
        k.muted("Tool arguments, outputs and paths are not collected."),
      );
    else {
      body.push(
        k.muted(
          "#" +
            e.sequence +
            " · " +
            (e.agentId ? "subagent" : "main") +
            " · " +
            e.status +
            " · revision " +
            e.revision,
        ),
        k.rule("PAIR"),
        k.text(
          "Native: " +
            e.original.model +
            " / " +
            (e.original.effort ?? "default"),
        ),
        k.text(
          "Outgoing: " +
            e.apexRequested.model +
            " / " +
            (e.apexRequested.effort ?? "default"),
          { color: MODES[e.mode]?.color },
        ),
        k.muted("Response: " + (e.responseModel ?? "not reported")),
        k.muted("Effective effort: not reported"),
        k.rule("WHY"),
        k.text(reason(e.reason)),
        k.muted(
          "Task " + e.task + " · risk " + e.risk + " · " + MODES[e.mode]?.label,
        ),
        k.rule("COST"),
        k.text(
          "Observed " +
            money(e.observedUsd) +
            " · forecast " +
            money(e.estimateUsd),
        ),
        k.muted(observedLabel),
        k.rule("CANDIDATES"),
      );
      for (const pair of (e.ranked ?? []).slice(0, 5))
        body.push(
          k.text(
            short(pair.model, width - 12) + " / " + (pair.effort ?? "default"),
          ),
          k.muted(
            "  Task score " +
              (pair.rawScore ?? "unknown") +
              " · forecast " +
              money(pair.costUpperUsd),
          ),
        );
      if (!e.ranked?.length)
        body.push(
          k.muted("No comparable eligible candidates in this receipt."),
        );
      body.push(
        k.button("receipt-json", "Print complete JSON receipt", () =>
          actions.print(e),
        ),
      );
    }
  } else if (tab === "models") {
    body.push(
      k.text("Model evidence", { bold: true }),
      k.muted("Artificial Analysis indices and prices · unknowns stay unknown"),
    );
    if (!state.catalogue.length)
      body.push(
        k.text("Evidence is not connected yet"),
        k.muted(
          "Set APEX_AA_API_KEY before launching Claude. Discovery uses the Models API. Confirm availability and exact mappings in Controls.",
        ),
      );
    for (const m of state.catalogue.slice(0, 30)) {
      body.push(
        k.rule(),
        k.text(
          short(m.runtimeId, width - 10) + " / " + (m.effort ?? "default"),
          { bold: true, color: m.routable ? colors.green : colors.muted },
        ),
        k.muted(
          m.routable
            ? "Eligible · verified account access and mapping"
            : "Excluded · " + m.exclusions.join(", "),
        ),
        k.text(
          "Intelligence " +
            (m.evidence?.scores?.general ?? "unknown") +
            " · task " +
            (m.evidence?.scores?.[
              state.control.taskOverride ?? state.intent.task
            ] ?? "unknown"),
        ),
        k.muted(
          "USD / 1M input " +
            (m.evidence?.prices?.input ?? "unknown") +
            " · output " +
            (m.evidence?.prices?.output ?? "unknown"),
        ),
        k.muted(
          "AA benchmark cost / task " +
            money(m.evidence?.benchmarkCostPerTask) +
            " · not your task's bill",
        ),
      );
    }
    if (state.catalogue.length > 30)
      body.push(
        k.muted(
          "First 30 pairs shown. /apex models prints the complete catalogue.",
        ),
      );
    if (state.aaVariants?.length) {
      body.push(
        k.rule("AA VARIANTS"),
        k.muted("Exact slugs for the verified mapping field in Controls."),
      );
      for (const variant of state.aaVariants.slice(0, 30))
        body.push(
          k.text(variant.slug + " / " + (variant.effort ?? "default")),
          k.muted(
            "Intelligence " +
              (variant.scores?.general ?? "unknown") +
              " · index v" +
              (variant.benchmarkVersion ?? "unknown"),
          ),
        );
      if (state.aaVariants.length > 30)
        body.push(
          k.muted(
            "First 30 AA variants shown; the browser provides the complete mapping picker.",
          ),
        );
    }
    body.push(
      k.button("evidence-refresh", "Refresh evidence", actions.refresh),
    );
  } else {
    const { Input, Select } = elements;
    body.push(
      k.text("Routing controls", { bold: true }),
      k.muted("Changes apply to the next unsent request."),
      k.button(
        "auto",
        state.control.routing === "auto"
          ? "Hold native settings"
          : "Resume automatic routing",
        actions.toggle,
      ),
      k.rule("CREDIT CONSENT"),
      k.text(
        state.control.creditsConsent
          ? "APEX allowed · estimate budget $" + state.control.budgetUsd
          : "APEX credit-funded switching is off",
      ),
      k.muted(
        "This does not enable account extra usage or purchase credits. Account billing uses Claude's /usage-credits command.",
      ),
    );
    if (Input)
      body.push(
        Input({
          key: "credit-budget",
          label: "Estimate budget USD",
          value: state.ui.budget,
          placeholder: "Enter a positive budget",
          submitLabel: "allow APEX",
          onInput: actions.budget,
          onSubmit: actions.credits,
        }),
      );
    else body.push(k.muted("/apex credits allow USD_CAP"));
    if (Input)
      body.push(
        k.button("credits-allow", "Allow within estimate budget", () =>
          actions.credits(state.ui.budget),
        ),
      );
    if (state.control.creditsConsent)
      body.push(
        k.button("credits-revoke", "Revoke APEX consent", () =>
          actions.change({ kind: "credits", allowed: false, budgetUsd: 0 }),
        ),
      );
    body.push(
      k.rule("DISPLAY"),
      k.row([
        k.button("dock-expanded", "Full dock", () => actions.dock("expanded")),
        k.button("dock-compact", "Compact dock", () => actions.dock("compact")),
        k.button("dock-hidden", "Hide dock", () => actions.dock("hidden")),
      ]),
      k.muted(
        "Current: " +
          state.ui.dock +
          " · /apex opens this pane even with the dock hidden.",
      ),
      k.rule("ACCOUNT & TASK"),
    );
    if (Select && Input) {
      body.push(
        Select({
          key: "backend",
          label: "Confirmed backend",
          value: state.ui.backend,
          options: [
            { value: "unknown", label: "Not confirmed" },
            { value: "subscription", label: "Claude subscription" },
            { value: "api", label: "Anthropic API" },
          ],
          onSelect: actions.backend,
        }),
        Input({
          key: "available-models",
          label: "Available model IDs",
          value: state.ui.ids,
          placeholder: "Exact IDs, separated by spaces",
          submitLabel: "confirm access",
          onInput: actions.ids,
          onSubmit: actions.availability,
        }),
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
              value === "auto" ? "Auto classify" : value.replaceAll("_", " "),
          })),
          onSelect: (task) =>
            actions.change({
              kind: "task",
              task: task === "auto" ? null : task,
            }),
        }),
        Input({
          key: "mapping",
          label: "Verified AA mapping",
          value: "",
          placeholder: "runtime-ID AA-slug effort",
          submitLabel: "save mapping",
          onSubmit: actions.mapping,
        }),
      );
    } else
      body.push(
        k.muted(
          "Use /apex allow-models BACKEND ID… and /apex map ID AA_SLUG EFFORT.",
        ),
      );
    body.push(
      k.muted(
        "Confirm only models your account can actually use. Task overrides reset with a new prompt.",
      ),
      k.rule("CONNECTION"),
      k.muted(
        "Claude " +
          state.hostVersion +
          " · AA " +
          state.aaStatus +
          " · billing unknown",
      ),
      k.button("refresh", "Refresh catalogue", actions.refresh),
      k.button("dashboard", "Get browser console link", actions.dashboard),
    );
  }
  return k.stack(
    [
      k.row([
        k.text("APEX", { bold: true, color: d.mode.color }),
        k.muted(
          "· " +
            state.control.routing +
            " · revision " +
            state.control.revision,
        ),
      ]),
      k.row(
        ["live", "timeline", "receipt", "models", "controls"].map((name) =>
          k.button(
            "tab-" + name,
            (name === tab ? "● " : "") + name[0].toUpperCase() + name.slice(1),
            () => actions.tab(name),
            {
              hotkey: {
                live: "l",
                timeline: "t",
                receipt: "r",
                models: "m",
                controls: "c",
              }[name],
              dimColor: name !== tab,
            },
          ),
        ),
      ),
      modes(k, state, actions, width < 60),
      ...(state.ui.notice
        ? [
            k.text(state.ui.notice, {
              color: state.ui.noticeError ? colors.red : colors.green,
            }),
          ]
        : []),
      ...(state.refreshError
        ? [k.text(state.refreshError, { color: "#E8A33D" })]
        : []),
      k.rule(),
      ...body,
      k.rule(),
      k.muted("1 Eco · 2 Balanced · 3 Quality · 4 Sports · Esc close"),
    ],
    { gap: 1, padding: 1 },
  );
}
