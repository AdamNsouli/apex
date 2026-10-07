import {
  MODES,
  REASONS,
  present,
  money,
  short,
  reason,
  modelName,
  pairLabel,
  effortLabel,
} from "../core/presentation.mjs";
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
        { hotkey: ["e", "b", "q", "s"][i] },
      ),
    ),
  );
}
function modeButton(k, state, actions, width = 72) {
  return k.button(
    "mode-toggle",
    (width < 48 && state.control.mode === "quality"
      ? "Quality"
      : MODES[state.control.mode].label) + " ▾",
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
function receipt(k, state, e, actions) {
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
    k.text("Native: " + pairLabel(state, e.original)),
    k.text("Outgoing: " + pairLabel(state, e.apexRequested), { bold: true }),
    k.muted("Response: " + (e.responseModel ?? "not reported")),
    k.muted("Effective effort: not reported"),
    k.rule("WHY"),
    k.text(reason(e.reason)),
    k.muted(
      "Task " +
        e.task +
        " · " +
        (MODES[e.mode]?.label ?? "Native") +
        (e.onceRevision ? " · Quality once" : ""),
    ),
    k.muted("Risk " + e.risk + " · revision " + e.revision),
    k.rule("COST"),
    k.text("Observed " + money(e.observedUsd)),
    k.muted("Request forecast " + money(e.estimateUsd)),
    k.muted("API-equivalent estimates · actual charge unknown"),
  );
  const evidence = e.decisionSnapshot?.selected,
    baseline = e.decisionSnapshot?.baseline;
  out.push(k.rule("RECORDED EVIDENCE"));
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
      k.muted("Methodology " + evidence.benchmarkVersion),
      k.muted(
        "Fetched " +
          (e.decisionSnapshot.fetchedAt
            ? new Date(e.decisionSnapshot.fetchedAt).toISOString()
            : "unknown"),
      ),
      k.muted(
        "AA benchmark USD/task " +
          money(evidence.benchmarkCostPerTask) +
          " · separate from this request forecast",
      ),
    );
  else
    out.push(
      k.muted("This historical receipt has no frozen evidence snapshot."),
    );
  for (const p of (e.ranked ?? []).slice(0, 5))
    out.push(
      k.muted(
        short(p.model, 32) +
          " / " +
          effortLabel(p.effort) +
          " · task " +
          p.rawScore +
          " · forecast " +
          money(p.costUpperUsd),
      ),
    );
  out.push(
    k.button("receipt-json", "Print JSON receipt", () => actions.print(e)),
  );
  return out;
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
  else if (width < 78)
    rows.push(
      k.row([
        k.text("APEX", { bold: true }),
        k.text(
          short(
            pair,
            Math.max(8, width - MODES[state.control.mode].label.length - 26),
          ),
          { bold: true },
        ),
        mode,
        inspect,
      ]),
    );
  else
    rows.push(
      k.row([
        k.text("APEX", { bold: true }),
        k.muted(d.status),
        k.text(
          short(pair, width - MODES[state.control.mode].label.length - 39),
          { bold: true },
        ),
        mode,
        inspect,
      ]),
    );
  if (state.ui.dock !== "compact" && (props.maxRows ?? 2) >= 2) {
    let line = d.pendingText ?? d.blocker;
    if (scope !== "main")
      line =
        "Agent · native settings · " +
        (d.active?.status ?? d.latest?.status ?? "idle");
    if (!line)
      line =
        width < 48
          ? d.status + " · " + pair
          : width < 78
            ? d.status + " · " + (d.active ? "streaming" : "idle")
            : d.scoped
                .filter((e) => e.kind !== "tool")
                .slice(-3)
                .map(
                  (e, i, a) =>
                    (i &&
                    (a[i - 1].apexRequested?.model !== e.apexRequested?.model ||
                      a[i - 1].apexRequested?.effort !==
                        e.apexRequested?.effort)
                      ? "└─ "
                      : i
                        ? "── "
                        : "") +
                    (e.status === "streaming" ? "●" : "○") +
                    String(e.sequence).padStart(2, "0"),
                )
                .join(" ") +
              " · Main · " +
              (d.active ? "streaming" : "idle");
    if (!d.latest && !d.pendingText && !d.blocker)
      line = "Your first request will appear here.";
    rows.push(k.muted(short(line, width)));
  }
  if (state.ui.modeMenu && width >= 30) rows.push(chooser(k, state, actions));
  return k.stack(rows, { paddingX: 1 });
}
function evidenceRows(k, state, actions) {
  const out = [
      k.text("Evidence", { bold: true }),
      k.muted(
        "Artificial Analysis indices and prices; unavailable fields remain unknown.",
      ),
    ],
    page = state.ui.evidencePage ?? 0,
    list = state.catalogue.slice(page * 15, page * 15 + 15),
    task = state.control.taskOverride ?? state.intent.task;
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
        "AA benchmark USD/task " + money(m.evidence?.benchmarkCostPerTask),
      ),
      k.muted("AA variant " + (m.evidence?.slug ?? "unmapped")),
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
    k.text("APEX by Kavren Labs"),
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
      ]),
      k.muted((d.active ?? d.latest)?.status ?? "No request yet"),
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
    body.push(
      k.button("settings", d.blocker ? "Set up" : "Settings", () =>
        actions.view("settings"),
      ),
    );
  } else if (view === "settings")
    body.push(...settings(k, elements, state, actions, props));
  else if (view === "credits")
    body.push(...credits(k, elements, state, actions));
  else if (view === "evidence") body.push(...evidenceRows(k, state, actions));
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
      ...receipt(k, state, d.selected, actions),
      k.rule("INTERVENE"),
      k.button(
        "auto",
        d.status === "Held" ? "Resume routing" : "Hold native settings",
        actions.toggle,
      ),
      k.button(
        "quality-once",
        state.control.qualityOnce ? "Cancel quality once" : "Quality once",
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
