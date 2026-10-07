const $ = (id) => document.getElementById(id);
let state = null,
  csrf = null,
  busy = false,
  focusBefore = null,
  lastReceipt = null;
const titles = {
  eco: "Eco",
  balanced: "Balanced",
  quality: "High Quality",
  sports: "Sports",
};
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
}
async function request(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", "X-Apex-Csrf": csrf }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
const usd = (x) =>
  typeof x === "number" ? "≈ $" + x.toFixed(4) : "Unavailable";
async function control(c) {
  if (busy || !state?.connected) return false;
  busy = true;
  const id = crypto.randomUUID();
  try {
    await request("/api/control", {
      ...c,
      id,
      expectedRevision: state.control.revision,
    });
    toast("Saving… waiting for Claude host acknowledgment");
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      await update();
      const ack = state.controlAcks?.find((a) => a.id === id);
      if (ack) {
        if (ack.status !== "applied") throw new Error(ack.reason);
        toast("Applied · revision " + ack.revision + " · next unsent request");
        return true;
      }
    }
    throw new Error("Host acknowledgment timed out; reconnect before retrying");
  } catch (e) {
    toast(e.message);
    return false;
  } finally {
    busy = false;
  }
}
function receipt(event) {
  lastReceipt = event;
  $("receipt-json").textContent = JSON.stringify(
    event ?? { status: "No requests yet" },
    null,
    2,
  );
  openDialog("evidence-dialog");
}
function events(target, list) {
  const container = $(target);
  container.replaceChildren();
  if (!list.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent =
      "No requests yet. Routing begins with your next Claude request.";
    container.append(e);
    return;
  }
  for (const e of list) {
    const row = document.createElement("div");
    row.className = "event";
    const icon = document.createElement("div");
    icon.className =
      "event-icon " + (["complete"].includes(e.status) ? "done" : "running");
    icon.textContent = e.status === "complete" ? "✓" : "◉";
    const main = document.createElement("div");
    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent =
      e.kind === "tool"
        ? e.tool
        : "Request #" + e.step + " · " + (e.agentId ? "agent" : "main");
    const info = document.createElement("div");
    info.className = "event-info";
    info.textContent =
      e.kind === "tool"
        ? e.status
        : e.apexRequested.model +
          " · requested " +
          (e.apexRequested.effort ?? "default") +
          " · " +
          e.status;
    main.append(title, info);
    if (e.responseModel) {
      const outcome = document.createElement("div");
      outcome.className = "small";
      outcome.textContent =
        "Response: " + e.responseModel + " · " + usd(e.observedUsd);
      main.append(outcome);
    }
    const end = document.createElement("div");
    end.className = "event-time";
    end.textContent = new Date(e.timestamp).toLocaleTimeString();
    const button = document.createElement("button");
    button.className = "mini-button";
    button.textContent = "Receipt";
    button.onclick = () => receipt(e);
    end.append(button);
    row.append(icon, main, end);
    container.append(row);
  }
}
function render() {
  if (!state) return;
  const c = state.control ?? {};
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("selected", c.mode === b.dataset.mode);
    b.setAttribute("aria-checked", c.mode === b.dataset.mode);
    b.disabled = !state.connected;
  });
  $("connection").textContent = state.connected
    ? "Connected to Claude host"
    : "Host disconnected · last facts retained";
  const active = state.active?.at(-1),
    last = state.events?.findLast((e) => e.apexRequested);
  $("status").textContent = active
    ? "Request #" + active.step + " streaming · " + active.apexRequested.model
    : state.events?.length
      ? "Session idle · no request in flight"
      : "No requests yet";
  $("revision").textContent =
    (active && active.revision !== c.revision
      ? titles[c.mode] + " queued for next request"
      : titles[c.mode] + " · active") +
    " · rev " +
    c.revision;
  $("active-model").textContent =
    active?.apexRequested.model ?? "No active request";
  $("active-effort").textContent =
    "Requested effort: " + (active?.apexRequested.effort ?? "unavailable");
  const known = (state.events ?? []).filter(
      (e) => e.apexRequested && typeof e.observedUsd === "number",
    ),
    unknown = (state.events ?? []).filter(
      (e) =>
        e.apexRequested &&
        ["complete", "error"].includes(e.status) &&
        e.observedUsd === null,
    );
  $("observed").textContent = known.length
    ? usd(state.cost.observedApiEquivalentUsd)
    : "Not yet observed";
  $("cost-provenance").textContent = unknown.length
    ? unknown.length + " requests have unknown cost · partial total"
    : "API token pricing · not a bill";
  $("cost-detail").textContent = $("observed").textContent;
  $("estimate").textContent =
    active && active.estimateUsd != null
      ? usd(active.estimateUsd)
      : "Unavailable";
  $("data-state").textContent = state.aa
    ? "Connected"
    : state.aaStatus === "loading"
      ? "Loading…"
      : "Not connected";
  $("data-age").textContent = state.aa
    ? "Fetched " + new Date(state.aa.fetchedAt).toLocaleString()
    : "Artificial Analysis · key needed";
  $("decision-mode").textContent = (
    last?.mode ??
    c.mode ??
    "waiting"
  ).toUpperCase();
  $("next-model").textContent =
    last?.apexRequested.model ?? "Awaiting a request";
  $("why").textContent =
    last?.reason?.replaceAll("_", " ") ??
    "Confirm model availability and connect matching benchmark evidence.";
  $("task-label").textContent = state.intent?.task ?? "Unknown";
  $("consent").textContent = c.creditsConsent
    ? "Allowed · account unverified"
    : "Not allowed";
  $("credits").textContent = c.creditsConsent
    ? "Revoke credit consent"
    : "Allow credits";
  $("credits").disabled = !state.connected;
  $("auto").disabled = !state.connected;
  $("auto").textContent = c.routing === "auto" ? "● Auto" : "○ Manual hold";
  $("benchmark-version").textContent = state.aa
    ? "index v" + state.aa.version
    : "no dataset loaded";
  $("host-version").textContent = "Claude " + (state.hostVersion ?? "unknown");
  $("doctor").textContent =
    state.refreshError ??
    "Native settings stay active when evidence is insufficient.";
  $("candidates").replaceChildren();
  for (const candidate of last?.ranked ?? []) {
    const row = document.createElement("p");
    row.className = "small";
    row.textContent =
      candidate.model +
      " / " +
      (candidate.effort ?? "default") +
      " · benchmark " +
      candidate.rawScore +
      " · " +
      usd(candidate.costUpperUsd);
    $("candidates").append(row);
  }
  events("events", (state.events ?? []).slice(-6));
  const filter = $("filter").value;
  events(
    "all-events",
    (state.events ?? []).filter(
      (e) =>
        filter === "all" ||
        (filter === "error" && e.status === "error") ||
        (filter === "tool" && e.kind === "tool") ||
        (filter === "request" && e.apexRequested),
    ),
  );
  $("task").value = c.taskOverride ?? "";
  renderModels();
}
let catalogSignature = "";
function option(select, value, label) {
  const e = document.createElement("option");
  e.value = value;
  e.textContent = label;
  select.append(e);
}
function renderModels() {
  const signature = JSON.stringify([
    state.runtime,
    state.catalogue,
    state.control?.verifiedIds ?? [],
    state.aa?.fetchedAt,
    state.intent?.task,
    state.control?.taskOverride,
  ]);
  if (signature === catalogSignature) return;
  catalogSignature = signature;
  if (["api", "subscription"].includes(state.control?.backend))
    $("backend").value = state.control.backend;
  $("model-rows").replaceChildren();
  for (const m of state.catalogue ?? []) {
    const tr = document.createElement("tr");
    for (const text of [
      m.runtimeId,
      m.effort ?? "default",
      m.evidence?.scores.general ?? "Unavailable",
      m.evidence?.scores.coding ?? "Unavailable",
      m.evidence?.scores[
        state.control?.taskOverride ?? state.intent?.task ?? "general"
      ] ?? "Unavailable",
      m.evidence?.prices?.input ?? "Unavailable",
      m.evidence?.prices?.output ?? "Unavailable",
      m.evidence?.latencyMs != null
        ? (m.evidence.latencyMs / 1000).toFixed(2) + " s"
        : "Unavailable",
      m.evidence?.benchmarkCostPerTask ?? "Unavailable",
      m.routable ? "Eligible" : m.exclusions.join(", "),
    ]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    $("model-rows").append(tr);
  }
  $("availability-list").replaceChildren();
  $("runtime-id").replaceChildren();
  for (const m of state.runtime ?? []) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = m.id;
    input.checked = (state.control?.verifiedIds ?? []).includes(m.id);
    input.style.width = "auto";
    input.style.minHeight = "40px";
    label.append(input, document.createTextNode(" " + m.name + " · " + m.id));
    $("availability-list").append(label);
    option($("runtime-id"), m.id, m.name + " · " + m.id);
  }
  $("aa-slug").replaceChildren();
  for (const m of state.aa?.models ?? [])
    option($("aa-slug"), m.slug, m.name + " · " + m.slug);
}
async function update() {
  try {
    state = await request("/api/state");
    render();
  } catch (e) {
    $("connection").textContent = "Connection unavailable · " + e.message;
    document
      .querySelectorAll("[data-mode],#auto,#credits")
      .forEach((b) => (b.disabled = true));
  }
}
document
  .querySelectorAll("[data-mode]")
  .forEach(
    (b) => (b.onclick = () => control({ kind: "mode", mode: b.dataset.mode })),
  );
document.querySelector("[role=radiogroup]").onkeydown = (e) => {
  if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  e.preventDefault();
  const keys = Object.keys(titles),
    index = keys.indexOf(state?.control.mode);
  const next = keys[(index + (e.key === "ArrowLeft" ? -1 : 1) + 4) % 4];
  control({ kind: "mode", mode: next });
  document.querySelector("[data-mode=" + next + "]").focus();
};
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-view]")
        .forEach((x) => x.classList.toggle("active", x === b));
      document
        .querySelectorAll(".content-view")
        .forEach((x) => (x.hidden = x.id !== "view-" + b.dataset.view));
      $("heading").textContent = {
        overview: "Routing console",
        timeline: "Work timeline",
        models: "Model evidence",
        settings: "Settings",
      }[b.dataset.view];
    }),
);
function openDialog(id) {
  focusBefore = document.activeElement;
  $(id).hidden = false;
  $(id).querySelector("button,input").focus();
}
function closeDialog(id) {
  $(id).hidden = true;
  focusBefore?.focus();
}
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => closeDialog(b.dataset.close)));
document.querySelectorAll(".dialog-backdrop").forEach(
  (el) =>
    (el.onkeydown = (e) => {
      if (e.key === "Escape") closeDialog(el.id);
      if (e.key === "Tab") {
        const all = [...el.querySelectorAll("button,input,a")].filter(
          (x) => !x.disabled,
        );
        if (e.shiftKey && document.activeElement === all[0]) {
          e.preventDefault();
          all.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === all.at(-1)) {
          e.preventDefault();
          all[0].focus();
        }
      }
    }),
);
$("auto").onclick = () =>
  control({
    kind: "routing",
    value: state.control.routing === "auto" ? "manual_hold" : "auto",
  });
$("credits").onclick = () =>
  state.control.creditsConsent
    ? control({ kind: "credits", allowed: false, budgetUsd: 0 })
    : openDialog("credit-dialog");
$("allow").onclick = async () => {
  if (!$("budget").reportValidity()) return;
  const applied = await control({
    kind: "credits",
    allowed: true,
    budgetUsd: Number($("budget").value),
  });
  if (applied) closeDialog("credit-dialog");
};
$("billing").onclick = async () => {
  try {
    await navigator.clipboard.writeText("/usage-credits");
    toast("Copied /usage-credits. Run it in Claude to open account billing.");
  } catch {
    toast("Run /usage-credits in Claude Code.");
  }
};
$("inspect").onclick = () =>
  receipt(state.events?.findLast((e) => e.apexRequested));
$("filter").onchange = render;
$("export").onclick = async () => {
  try {
    const data = await request("/api/export"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
    const a = document.createElement("a");
    a.href = url;
    a.download = "apex-receipts.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    toast(e.message);
  }
};
$("refresh").onclick = async () => {
  try {
    await request("/api/refresh", {});
    toast("Refresh requested; source limits and cached data apply.");
  } catch (e) {
    toast(e.message);
  }
};
$("connect-aa").onclick = async () => {
  try {
    await request("/api/credentials", { aaKey: $("aa-key").value });
    $("aa-key").value = "";
    toast("Key held in local memory. Refreshing benchmark data…");
  } catch (e) {
    toast(e.message);
  }
};
$("confirm-models").onclick = () =>
  control({
    kind: "availability",
    backend: $("backend").value,
    ids: [...$("availability-list").querySelectorAll("input:checked")].map(
      (x) => x.value,
    ),
  });
$("map").onclick = () =>
  control({
    kind: "mapping",
    runtimeId: $("runtime-id").value,
    aaSlug: $("aa-slug").value,
    effort: $("effort").value === "default" ? null : $("effort").value,
  });
$("task").onchange = () =>
  control({ kind: "task", task: $("task").value || null });
$("theme").onclick = () => {
  document.body.classList.toggle("light");
  $("theme").textContent = document.body.classList.contains("light")
    ? "Use dark theme"
    : "Use light theme";
};
(async () => {
  const token = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  try {
    const response = token
      ? await fetch("/api/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
      : await fetch("/api/session");
    if (!response.ok)
      throw new Error("Open the exact session link printed by /apex dashboard");
    csrf = (await response.json()).csrf;
    await update();
    setInterval(update, 1000);
  } catch (e) {
    toast(e.message);
    $("connection").textContent = "Authentication needed";
  }
})();
