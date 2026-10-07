import {
  VERSION,
  MODES,
  present,
  reason,
  money,
  modelName,
  pairLabel,
  effortLabel,
} from "/presentation.mjs";
import { duration, verdict } from "/receipt.mjs";
const $ = (id) => document.getElementById(id);
let state = null,
  csrf = null,
  busy = false,
  selectedId = null,
  scope = "main",
  follow = true,
  page = 0,
  timeView = false;
let historySignature = "",
  catalogSignature = "",
  polling = false;
const pageSize = 50,
  ns = "http://www.w3.org/2000/svg";
const fmt = (n) =>
  typeof n === "number" && Number.isFinite(n) ? String(n) : "unknown";
const date = (n) =>
  Number.isFinite(n) ? new Date(n).toLocaleString() : "unknown";
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => ($("toast").hidden = true), 5000);
}
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function svgNode(tag, attrs) {
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function facts(id, rows) {
  const fragment = document.createDocumentFragment();
  for (const [key, value] of rows)
    fragment.append(node("dt", key), node("dd", String(value ?? "unknown")));
  $(id).replaceChildren(fragment);
}
async function request(url, body) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Apex-Csrf": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
async function update() {
  if (polling) return;
  polling = true;
  try {
    state = await request("/api/state");
    render();
  } catch (e) {
    if (state) {
      state = { ...state, connected: false };
      render();
    }
    $("connection").textContent = "Connection unavailable · " + e.message;
  } finally {
    polling = false;
  }
}
async function control(command) {
  if (busy || !state?.connected) return false;
  busy = true;
  render();
  const id = crypto.randomUUID();
  try {
    const latest = await request("/api/state");
    state = latest;
    await request("/api/control", {
      ...command,
      id,
      expectedRevision: latest.control.revision,
    });
    toast("Saving… waiting for Claude host acknowledgment");
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 250));
      await update();
      const ack = state.controlAcks?.find((a) => a.id === id);
      if (ack) {
        if (ack.status !== "applied")
          throw new Error(ack.reason ?? "Host rejected the change");
        toast("Saved to host · revision " + ack.revision);
        return true;
      }
    }
    throw new Error(
      "Acknowledgment timed out. The command may still apply; check host state before retrying.",
    );
  } catch (e) {
    toast(e.message);
    return false;
  } finally {
    busy = false;
    render();
  }
}
function selected(p) {
  return p.scoped.find((e) => e.id === selectedId) ?? p.selected;
}
function choose(id) {
  selectedId = id;
  follow = false;
  $("inspector").hidden = false;
  render();
}
function renderHistory(p) {
  const all = p.scoped,
    count = all.length;
  page = Math.min(page, Math.max(0, Math.ceil(count / pageSize) - 1));
  const end = Math.max(0, count - page * pageSize),
    start = Math.max(0, end - pageSize),
    list = all.slice(start, end),
    selection = selected(p);
  const signature = JSON.stringify([
    list,
    selection?.id,
    scope,
    timeView,
    matchMedia("(max-width:600px)").matches,
  ]);
  if (signature !== historySignature) {
    historySignature = signature;
    const fragment = document.createDocumentFragment();
    if (!list.length)
      fragment.append(
        node(
          "p",
          "No requests yet. Your next Claude request starts the route history.",
          "empty-history",
        ),
      );
    let previous = null;
    for (let i = 0; i < list.length; i++) {
      const e = list[i],
        pair = e.apexRequested,
        isTool = e.kind === "tool";
      const changed =
        previous &&
        pair &&
        (previous.model !== pair.model || previous.effort !== pair.effort);
      const previousX = previous?.x ?? 24,
        x = changed ? (previousX === 24 ? 50 : 24) : previousX;
      const row = node("div", null, "event-row");
      row.dataset.id = e.id;
      row.dataset.selected = String(e.id === selection?.id);
      row.dataset.status = e.status;
      row.dataset.kind = isTool ? "tool" : "request";
      const svg = svgNode("svg", {
        viewBox: "0 0 72 72",
        preserveAspectRatio: "none",
        "aria-hidden": "true",
        class: "route-mark",
      });
      // Steps mean actual model/effort changes. No tool parents are inferred.
      if (!isTool && previous)
        svg.append(
          svgNode("path", {
            d: changed ? `M${previousX} 0 V24 H${x} V72` : `M${x} 0 V72`,
          }),
        );
      else if (!isTool && i < list.length - 1)
        svg.append(svgNode("path", { d: `M${x} 36 V72` }));
      const dot = node("span", null, "node-dot");
      dot.style.left =
        (matchMedia("(max-width:600px)").matches ? (x * 2) / 3 : x) + "px";
      dot.setAttribute("aria-hidden", "true");
      const button = node("button", null, "event-pick");
      button.dataset.receipt = e.id;
      button.append(
        node(
          "span",
          isTool ? (e.tool ?? "Tool activity") : modelName(state, pair?.model),
          "event-model",
        ),
      );
      button.append(
        node(
          "span",
          isTool
            ? "Tool · " +
                (e.agentId ? "Agent " + e.agentId : "Main") +
                " · " +
                e.status
            : effortLabel(pair?.effort) +
                " requested · " +
                (e.agentId ? "Agent " + e.agentId : "Main") +
                " · " +
                e.status,
          "event-meta",
        ),
      );
      button.setAttribute(
        "aria-label",
        (isTool ? e.tool : "Request " + e.sequence) +
          " · " +
          e.status +
          " · inspect receipt",
      );
      button.onclick = () => choose(e.id);
      row.append(
        svg,
        dot,
        node(
          "span",
          isTool
            ? "TOOL"
            : String(e.sequence ?? start + i + 1).padStart(2, "0"),
          "event-sequence",
        ),
        button,
        node("span", e.status, "event-status " + e.status),
      );
      fragment.append(row);
      if (pair && !isTool) previous = { ...pair, x };
    }
    const focused = document.activeElement?.dataset?.receipt;
    $("history-rows").replaceChildren(fragment);
    if (follow && page === 0)
      $("history-rows").scrollTop = $("history-rows").scrollHeight;
    if (focused)
      [...$("history-rows").querySelectorAll("[data-receipt]")]
        .find((b) => b.dataset.receipt === focused)
        ?.focus({ preventScroll: true });
  }
  $("older").disabled = start === 0;
  $("newer").disabled = page === 0;
  $("history-range").textContent = count
    ? `${start + 1}–${end} of ${count}`
    : "0 events";
  $("follow").textContent = follow ? "Following live" : "Follow live";
  $("follow").setAttribute("aria-pressed", String(follow));
  const timed = list.filter((e) => duration(e) !== null);
  $("time-view").disabled = !timed.length;
  if (!timed.length) timeView = false;
  $("timing").hidden = !timeView;
  $("time-view").setAttribute("aria-pressed", String(timeView));
  $("sequence-view").setAttribute("aria-pressed", String(!timeView));
  if (timeView) renderTiming(timed);
}
function renderTiming(events) {
  const width = Math.max(260, $("timing").clientWidth),
    left = 92,
    usable = width - left - 12;
  const start = Math.min(...events.map((e) => e.startedAt ?? e.timestamp)),
    end = Math.max(...events.map((e) => e.completedAt));
  const span = Math.max(1, end - start),
    lanes = [...new Set(events.map((e) => e.agentId ?? "main"))];
  const svg = svgNode("svg", {
    viewBox: `0 0 ${width} ${lanes.length * 46 + 40}`,
    role: "img",
    "aria-label":
      "Recorded durations on known main and agent lanes. No parent relationships inferred.",
  });
  for (let i = 0; i <= 4; i++) {
    const x = left + (usable * i) / 4;
    const text = svgNode("text", { x, y: 16 });
    text.textContent = ((span * i) / 4 / 1000).toFixed(1) + "s";
    svg.append(text);
  }
  for (let i = 0; i < lanes.length; i++) {
    const y = 32 + i * 46;
    const label = svgNode("text", { x: 0, y: y + 13 });
    label.textContent =
      lanes[i] === "main" ? "Main" : "Agent " + lanes[i].slice(0, 6);
    svg.append(
      label,
      svgNode("line", { x1: left, x2: width, y1: y + 8, y2: y + 8 }),
    );
    for (const e of events.filter((e) => (e.agentId ?? "main") === lanes[i])) {
      const x = left + (usable * ((e.startedAt ?? e.timestamp) - start)) / span,
        w = Math.max(2, (usable * duration(e)) / span);
      const mark = svgNode(
        e.kind === "tool" ? "circle" : "rect",
        e.kind === "tool"
          ? { cx: x, cy: y + 8, r: 4 }
          : { x, y, width: w, height: 16, rx: 2 },
      );
      const title = svgNode("title", {});
      title.textContent =
        (e.tool ?? pairLabel(state, e.apexRequested)) +
        " · " +
        (duration(e) / 1000).toFixed(2) +
        "s";
      mark.append(title);
      svg.append(mark);
    }
  }
  $("timing").replaceChildren(
    svg,
    node(
      "p",
      "Elapsed from the first recorded start. Only events with recorded start and completion timestamps are plotted.",
      "secondary",
    ),
  );
}
function renderReceipt(e) {
  $("selected-label").textContent = e
    ? (e.kind === "tool" ? "TOOL" : "REQUEST " + (e.sequence ?? "?")) +
      " / RECEIPT"
    : "REQUEST / RECEIPT";
  $("verdict").textContent = verdict(e);
  $("selected-model").textContent =
    e?.kind === "tool" ? e.tool : modelName(state, e?.apexRequested?.model);
  $("selected-effort").textContent =
    e?.kind === "tool"
      ? "Tool activity · " + e.status
      : "Requested effort: " + effortLabel(e?.apexRequested?.effort);
  const d = duration(e),
    snap = e?.decisionSnapshot,
    evidence = snap?.selected;
  facts(
    "receipt-facts",
    e
      ? [
          [
            "Native pair",
            e.original ? pairLabel(state, e.original) : "unknown",
          ],
          [
            "APEX outgoing",
            e.apexRequested
              ? pairLabel(state, e.apexRequested)
              : "not a model request",
          ],
          ["Response model", e.responseModel ?? "unknown"],
          ["Effective effort", e.effectiveEffort ?? "not reported by Claude"],
          ["Preference", MODES[e.mode]?.label ?? "native"],
          ["Task category", e.task ?? "unknown"],
          ["Scope", e.agentId ? "Agent " + e.agentId : "Main"],
          ["State", e.status],
          ["Duration", d === null ? "unknown" : (d / 1000).toFixed(2) + " s"],
          ["Started", date(e.startedAt ?? e.timestamp)],
        ]
      : [],
  );
  $("receipt-reason").textContent = e
    ? e.kind === "tool"
      ? "Recorded tool activity. Arguments, paths and output are not stored."
      : reason(e.reason)
    : "APEX records decisions without storing your transcript.";
  $("receipt-protection").textContent =
    e?.onceRevision != null
      ? "Quality once was consumed by this main dispatch. Ordinary guards still applied."
      : e?.risk && e.risk !== "normal"
        ? "Baseline quality protection: " + e.risk + " risk."
        : "Unknown fields remain unknown.";
  facts(
    "evidence-facts",
    e && e.kind !== "tool"
      ? [
          ["Observed API-equivalent", money(e.observedUsd)],
          ["Baseline forecast", money(snap?.baselineForecastUsd)],
          [
            "Selected forecast",
            money(snap?.candidateForecastUsd ?? e.estimateUsd),
          ],
          ["Actual account charge", "unknown"],
          ["AA variant", evidence?.aaSlug ?? "unknown"],
          [
            "Requested effort",
            evidence ? effortLabel(evidence.effort) : "unknown",
          ],
          ["Intelligence index", fmt(evidence?.intelligence)],
          ["Baseline task index", fmt(snap?.baseline?.taskScore)],
          [
            "Task index",
            fmt(evidence?.taskScore) +
              (evidence?.mathProxy ? " · intelligence proxy" : ""),
          ],
          [
            "AA benchmark USD/task",
            evidence?.benchmarkCostPerTask == null
              ? "unknown"
              : "$" + evidence.benchmarkCostPerTask,
          ],
          ["Methodology", evidence?.benchmarkVersion ?? "unknown"],
          ["Frozen evidence fetched", date(snap?.fetchedAt)],
        ]
      : [],
  );
  $("evidence-note").textContent = snap
    ? "Frozen at dispatch. AA benchmark cost/task is not a forecast of your prompt; token forecasts and observed API-equivalent costs are separate."
    : e
      ? "This older receipt has no frozen benchmark snapshot. Current evidence is not substituted."
      : "Your first recorded decision appears here.";
  $("receipt-json").textContent = JSON.stringify(
    e ?? { status: "No request selected" },
    null,
    2,
  );
  $("receipt-export").disabled = !e;
  $("receipt-json-toggle").disabled = !e;
}
function options(id, rows) {
  const select = $(id),
    value = select.value;
  select.replaceChildren();
  for (const [v, label] of rows) {
    const o = node("option", label);
    o.value = v;
    select.append(o);
  }
  if (rows.some((r) => r[0] === value)) select.value = value;
}
function effortOptions() {
  const runtime = state?.runtime?.find((m) => m.id === $("runtime-id").value);
  options("effort", [
    ["default", "Default"],
    ...(runtime?.efforts ?? []).map((e) => [e, effortLabel(e)]),
  ]);
  mappingPreview();
}
function mappingPreview() {
  const variant = state?.aa?.models?.find((m) => m.slug === $("aa-slug").value),
    effort = $("effort").value === "default" ? null : $("effort").value;
  const valid =
    !!$("runtime-id").value && !!variant && variant.effort === effort;
  $("map").disabled = !state?.connected || busy || !valid;
  $("mapping-preview").textContent = valid
    ? "Exact effort matches. Runtime family, version and account availability are checked by the catalogue before routing."
    : "Choose a runtime and AA variant with exactly matching effort. Incompatible or unverified evidence remains excluded.";
}
function renderModels(force = false) {
  const signature = JSON.stringify([
    state.runtime,
    state.catalogue,
    state.aa?.models,
    state.control.verifiedIds,
    state.control.taskOverride,
    state.intent?.task,
  ]);
  if (!force && signature === catalogSignature) {
    mappingPreview();
    return;
  }
  // New evidence must arrive in an open setup sheet without erasing its draft.
  const draft =
    !force && $("settings-dialog").open
      ? new Map(
          [...$("availability-list").querySelectorAll("input")].map((i) => [
            i.value,
            i.checked,
          ]),
        )
      : null;
  const focusedId = document.activeElement?.closest("#availability-list")
    ? document.activeElement.value
    : null;
  catalogSignature = signature;
  const legend = node("legend", "Discovered model IDs");
  $("availability-list").replaceChildren(legend);
  if (!state.runtime?.length)
    $("availability-list").append(
      node(
        "p",
        "No runtime IDs discovered yet. Reconnect the host and refresh when eligible.",
        "secondary",
      ),
    );
  for (const m of state.runtime ?? []) {
    const label = node("label"),
      input = node("input");
    input.type = "checkbox";
    input.value = m.id;
    input.checked = draft?.has(m.id)
      ? draft.get(m.id)
      : (state.control.verifiedIds?.includes(m.id) ?? false);
    label.append(input, node("span", (m.name ?? m.id) + " · " + m.id));
    $("availability-list").append(label);
  }
  if (focusedId)
    [...$("availability-list").querySelectorAll("input")]
      .find((i) => i.value === focusedId)
      ?.focus({ preventScroll: true });
  options("runtime-id", [
    ["", "Select runtime"],
    ...(state.runtime ?? []).map((m) => [
      m.id,
      (m.name ?? m.id) + " · " + m.id,
    ]),
  ]);
  options("aa-slug", [
    ["", "Select AA variant"],
    ...(state.aa?.models ?? []).map((m) => [m.slug, m.name + " · " + m.slug]),
  ]);
  effortOptions();
  $("model-rows").replaceChildren();
  const task = state.control.taskOverride ?? state.intent?.task ?? "general";
  for (const m of state.catalogue ?? []) {
    const tr = node("tr"),
      ev = m.evidence;
    for (const text of [
      m.runtimeId + " / " + effortLabel(m.effort),
      fmt(ev?.scores?.general),
      fmt(ev?.scores?.[task]),
      fmt(ev?.prices?.input),
      fmt(ev?.prices?.output),
      ev?.latencyMs == null
        ? "unknown"
        : (ev.latencyMs / 1000).toFixed(2) + " s",
      fmt(ev?.benchmarkCostPerTask),
      m.routable ? "Eligible" : (m.exclusions?.join(", ") ?? "Excluded"),
    ])
      tr.append(node("td", text));
    $("model-rows").append(tr);
  }
}
function render() {
  if (!state) return;
  const p = present(state, { scope, selectedId: follow ? null : selectedId }),
    c = state.control ?? {};
  if (follow) selectedId = p.selected?.id ?? null;
  const agents = p.agents,
    scopeRows = [
      ["main", "Main"],
      ["all", "All activity"],
      ...agents.map((id) => [id, "Agent " + id]),
    ];
  if (
    JSON.stringify([...$("scope").options].map((o) => [o.value, o.text])) !==
    JSON.stringify(scopeRows)
  )
    options("scope", scopeRows);
  if (!scopeRows.some((r) => r[0] === scope)) scope = "main";
  $("scope").value = scope;
  $("scope-name").textContent =
    scope === "main"
      ? "MAIN"
      : scope === "all"
        ? "ALL ACTIVITY"
        : "AGENT " + scope;
  $("connection").textContent = state.connected
    ? "Connected to Claude host"
    : "Host disconnected · last facts retained";
  $("active-model").textContent = modelName(
    state,
    (p.active ?? p.latest)?.apexRequested?.model,
  );
  $("active-meta").textContent =
    (p.active
      ? "Request " + p.active.sequence + " streaming"
      : p.latest
        ? "Session idle"
        : "Waiting for a request") +
    " · " +
    ((p.active ?? p.latest)
      ? "Requested " +
        effortLabel((p.active ?? p.latest).apexRequested?.effort) +
        " effort"
      : "Native settings remain active");
  $("routing-status").textContent = p.status;
  $("routing-status").dataset.tone = p.tone;
  $("observed").textContent = p.observed;
  $("state-detail").textContent =
    p.pendingText ??
    p.blocker ??
    "Preference evaluated at each main dispatch · native guards remain active";
  document.querySelector(".state-line").dataset.pending = String(
    !!p.pendingText,
  );
  $("setup-action").hidden = !p.blocker;
  $("setup-action").disabled = !state.connected || busy;
  $("setup-action").textContent =
    p.status === "Held"
      ? "Resume routing"
      : c.backend === "api" && !c.creditsConsent && p.age !== null
        ? "Allow routing"
        : "Set up";
  $("mode-toggle").textContent = p.mode.label + " ⌄";
  $("mode-toggle").disabled = !state.connected || busy;
  $("mode-protection").textContent = p.baselineProtected
    ? "Baseline quality protection is active for this task."
    : "All modes retain capability, evidence, cost and context safeguards.";
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.setAttribute("aria-pressed", String(c.mode === b.dataset.mode));
    b.disabled = !state.connected || busy;
  });
  for (const id of [
    "auto",
    "quality-once",
    "confirm-models",
    "connect-aa",
    "allow",
    "revoke",
    "task",
    "backend",
  ])
    $(id).disabled = !state.connected || busy;
  $("confirm-models").disabled ||= !["api", "subscription"].includes(
    $("backend").value,
  );
  $("auto").textContent =
    state.pins || c.routing !== "auto"
      ? "Resume routing"
      : "Hold native settings";
  $("quality-once").textContent = c.qualityOnce
    ? "Cancel Quality once"
    : "Quality once";
  $("next-intention").textContent =
    p.pendingText ??
    "Next main request · " + p.mode.label + " preference evaluated at dispatch";
  $("compact-pair").textContent = p.currentPair;
  $("event-count").textContent =
    (state.events?.length ?? 0) +
    " retained events · " +
    p.unknownCosts +
    " unknown-cost requests";
  renderHistory(p);
  renderReceipt(selected(p));
  renderModels();
  $("host-status").textContent =
    "Claude " +
    (state.hostVersion ?? "version unknown") +
    " · " +
    (state.connected ? "connected" : "disconnected") +
    " · APEX " +
    VERSION;
  $("aa-status").textContent =
    state.refreshError ??
    (state.aa
      ? "Evidence connected · methodology " + (state.aa.version ?? "unknown")
      : state.aaStatus === "loading"
        ? "Loading evidence…"
        : "Not connected");
  $("fetched-at").textContent = "Last successful fetch: " + date(p.fetchedAt);
  $("next-refresh").textContent =
    "Next eligible refresh: " +
    (p.refreshEligible ? "now" : date(p.nextRefreshAt));
  $("refresh").disabled = !state.connected || busy || !p.refreshEligible;
  $("consent-status").textContent = c.creditsConsent
    ? "APEX routing consent on · estimate budget " + money(c.budgetUsd)
    : "APEX routing consent off";
  $("credit-liabilities").textContent =
    "Observed API-equivalent " +
    p.observed +
    " · reserved " +
    money(state.cost?.reservedApiEquivalentUsd) +
    " · " +
    p.unknownCosts +
    " unknown-cost requests · actual account charges unknown.";
  $("version").textContent =
    "Version " +
    VERSION +
    " · original route identity, monochrome publisher mark.";
}
function openDialog(id) {
  if (!state) return;
  if (id === "settings-dialog") {
    renderModels(true);
    $("backend").value = state.control.backend;
    $("task").value = state.control.taskOverride ?? "";
  }
  if (id === "credit-dialog")
    $("budget").value =
      state.control.budgetUsd > 0 ? state.control.budgetUsd : "";
  $(id).showModal();
  render();
}
function download(data, name) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    ),
    a = node("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied " + text + " · paste into Claude Code");
  } catch {
    toast("Enter " + text + " in Claude Code.");
  }
}
function modeMenu(open) {
  $("mode-menu").hidden = !open;
  $("mode-toggle").setAttribute("aria-expanded", String(open));
  if (open) {
    const rect = $("mode-menu").getBoundingClientRect(),
      overflow = rect.right - innerWidth + 16,
      underflow = 16 - rect.left;
    $("mode-menu").style.transform =
      `translateX(${overflow > 0 ? -overflow : underflow > 0 ? underflow : 0}px)`;
  } else $("mode-menu").style.transform = "";
}
$("mode-toggle").onclick = () => modeMenu($("mode-menu").hidden);
document.querySelectorAll("[data-mode]").forEach(
  (b) =>
    (b.onclick = async () => {
      modeMenu(false);
      await control({ kind: "mode", mode: b.dataset.mode });
      $("mode-toggle").focus();
    }),
);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".mode-wrap")) modeMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("mode-menu").hidden) {
    modeMenu(false);
    $("mode-toggle").focus();
  }
});
$("scope").onchange = () => {
  scope = $("scope").value;
  selectedId = null;
  follow = true;
  page = 0;
  render();
};
$("history-rows").addEventListener("scroll", () => {
  const el = $("history-rows");
  if (follow && el.scrollHeight - el.scrollTop - el.clientHeight > 8) {
    follow = false;
    $("follow").textContent = "Follow live";
    $("follow").setAttribute("aria-pressed", "false");
  }
});
$("follow").onclick = () => {
  follow = true;
  selectedId = null;
  page = 0;
  historySignature = "";
  render();
};
$("older").onclick = () => {
  page++;
  render();
};
$("newer").onclick = () => {
  page = Math.max(0, page - 1);
  render();
};
$("time-view").onclick = () => {
  timeView = true;
  render();
};
$("sequence-view").onclick = () => {
  timeView = false;
  render();
};
$("inspect-close").onclick = () => {
  $("inspector").hidden = true;
  $("inspect").focus();
};
$("inspect").onclick = () => {
  $("inspector").hidden = false;
  $("selected-label").scrollIntoView({ block: "nearest" });
};
$("settings").onclick = () => openDialog("settings-dialog");
$("credits").onclick = () => openDialog("credit-dialog");
$("setup-credits").onclick = () => {
  $("settings-dialog").close();
  openDialog("credit-dialog");
};
$("setup-action").onclick = () =>
  state.pins || state.control.routing !== "auto"
    ? control({ kind: "routing", value: "auto" })
    : $("setup-action").textContent === "Allow routing"
      ? openDialog("credit-dialog")
      : openDialog("settings-dialog");
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
document
  .querySelectorAll("[data-step]")
  .forEach(
    (b) =>
      (b.onclick = () => $(b.dataset.step).scrollIntoView({ block: "start" })),
  );
$("auto").onclick = () =>
  control({
    kind: "routing",
    value:
      state.pins || state.control.routing !== "auto" ? "auto" : "manual_hold",
  });
$("quality-once").onclick = () =>
  control({ kind: "quality_once", armed: !state.control.qualityOnce });
$("credit-form").onsubmit = async (e) => {
  e.preventDefault();
  const budget = Number($("budget").value);
  if (!Number.isFinite(budget) || budget <= 0 || !$("budget").reportValidity())
    return;
  if (await control({ kind: "credits", allowed: true, budgetUsd: budget }))
    $("credit-dialog").close();
};
$("revoke").onclick = () =>
  control({ kind: "credits", allowed: false, budgetUsd: 0 });
$("billing").onclick = () => copy("/usage-credits");
$("export").onclick = async () => {
  try {
    download(await request("/api/export"), "apex-receipts.json");
  } catch (e) {
    toast(e.message);
  }
};
$("receipt-export").onclick = () =>
  download(
    selected(present(state, { scope, selectedId })),
    "apex-receipt.json",
  );
$("receipt-json-toggle").onclick = () => {
  $("receipt-json").hidden = !$("receipt-json").hidden;
  $("receipt-json-toggle").textContent = $("receipt-json").hidden
    ? "Show JSON"
    : "Hide JSON";
};
$("refresh").onclick = async () => {
  try {
    await request("/api/refresh", {});
    toast(
      "Refresh requested. Source limits apply; previous evidence is retained.",
    );
    await update();
  } catch (e) {
    toast(e.message);
  }
};
$("aa-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await request("/api/credentials", { aaKey: $("aa-key").value });
    $("aa-key").value = "";
    toast(
      "Key held in companion memory. Evidence refresh follows the source cooldown.",
    );
    await update();
    renderModels(true);
  } catch (e) {
    toast(e.message);
  }
};
$("backend").onchange = () => render();
$("confirm-models").onclick = async () => {
  if (
    await control({
      kind: "availability",
      backend: $("backend").value,
      ids: [...$("availability-list").querySelectorAll("input:checked")].map(
        (x) => x.value,
      ),
    })
  )
    renderModels(true);
};
$("runtime-id").onchange = effortOptions;
$("aa-slug").onchange = mappingPreview;
$("effort").onchange = mappingPreview;
$("map").onclick = async () => {
  if (
    await control({
      kind: "mapping",
      runtimeId: $("runtime-id").value,
      aaSlug: $("aa-slug").value,
      effort: $("effort").value === "default" ? null : $("effort").value,
    })
  )
    renderModels(true);
};
$("task").onchange = () =>
  control({ kind: "task", task: $("task").value || null });
function theme(value) {
  document.body.classList.toggle("light", value === "light");
  $("theme").textContent =
    value === "light" ? "Use dark theme" : "Use light theme";
  localStorage.setItem("apex-theme", value);
}
function density(value) {
  document.body.classList.toggle("compact", value === "compact");
  $("density").textContent =
    value === "compact" ? "Full workspace" : "Compact view";
  $("density").setAttribute("aria-pressed", String(value === "compact"));
  localStorage.setItem("apex-density", value);
}
$("theme").onclick = () =>
  theme(document.body.classList.contains("light") ? "dark" : "light");
$("density").onclick = () =>
  density(document.body.classList.contains("compact") ? "full" : "compact");
theme(localStorage.getItem("apex-theme") ?? "dark");
density(localStorage.getItem("apex-density") ?? "full");
$("copy-native").onclick = () => copy("/apex rail");
window.addEventListener("resize", () => {
  historySignature = "";
  if (state) render();
  if (!$("mode-menu").hidden) modeMenu(true);
});
(async () => {
  const token = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  try {
    const response = await fetch(
      token ? "/api/bootstrap" : "/api/session",
      token
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          }
        : {},
    );
    if (!response.ok)
      throw new Error("Open the exact session link printed by /apex dashboard");
    csrf = (await response.json()).csrf;
    await update();
    setInterval(update, 1000);
  } catch (e) {
    toast(e.message);
    $("connection").textContent = "Authentication needed";
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  }
})();
