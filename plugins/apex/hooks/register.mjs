import { dock, pane } from "./interface.mjs";
import {
  initialControl,
  applyControl,
  classifyIntent,
  route,
  estimatedCost,
  Ledger,
  captureDispatch,
  forecastCost,
} from "../core/router.mjs";
import { freezeDecision } from "../core/receipt.mjs";
import {
  runtimeModels,
  joinCatalogue,
  fetchAAPages,
} from "../core/catalogue.mjs";
let control = initialControl(),
  intent = {
    task: "general",
    risk: "unknown",
    difficulty: "standard",
    failures: 0,
  },
  runtime = [],
  aa = null,
  models = [],
  hostUsage = null,
  hostVersion = "unknown",
  ledger = new Ledger(),
  descriptor = null,
  timer = null,
  refreshTimer = null,
  refreshBusy = false,
  lastRefresh = 0,
  lastAARefresh = 0,
  refreshError = null,
  contextTokens = null,
  pins = false,
  lastModel = null,
  lastEffort = undefined,
  stepsOnModel = 2,
  acks = [],
  syncing = null,
  now = Date.now();
let nativeUi = {
  dock: "expanded",
  tab: "live",
  selectedId: null,
  budget: "",
  backend: "unknown",
  ids: "",
  view: "compact",
  scope: "auto",
  modeMenu: false,
  mapRuntimeId: "",
  mapSlug: "",
  mapEffort: "default",
  accessId: "",
  evidencePage: 0,
  historyPage: 0,
  paneShown: false,
  placement: null,
  notice: "",
  noticeError: false,
};
const rebuild = () => {
  models = joinCatalogue(
    runtime,
    aa?.models ?? [],
    control.mappings,
    control.verifiedIds,
  );
};
const publicState = () => ({
  control,
  connected: true,
  now,
  pins,
  evidenceFetchedAt: aa?.fetchedAt ?? null,
  nextRefreshAt: lastAARefresh
    ? Math.min(lastAARefresh + 86400000, lastRefresh + 86400000)
    : null,
  refreshBusy,
  events: ledger.events,
  runtime,
  catalogue: models,
  hostVersion,
  hostUsage,
  accountBilling: "unknown",
  intent,
  refreshError,
  aaStatus: aa ? "connected" : "not_connected",
  active: ledger.events.filter((e) => e.status === "streaming"),
  cost: {
    observedApiEquivalentUsd: ledger.spentUsd,
    reservedApiEquivalentUsd: ledger.reservedUsd,
    unknownCostRequests: ledger.unknownCosts,
  },
  controlAcks: acks.slice(-50),
});
const draw = ($) => $.ui.invalidate("ui.render");
async function change($, command) {
  control = applyControl(control, command);
  if (command.kind === "mode") stepsOnModel = 2;
  if (command.kind === "routing" && command.value === "auto") pins = false;
  rebuild();
  await $.store.set("control", control);
  draw($);
}
async function sync($) {
  if (!descriptor) return;
  if (syncing) {
    await syncing;
    return;
  }
  syncing = (async () => {
    try {
      const r = await $.http.fetch("http://bridge/native/sync", {
        socketPath: descriptor.socketPath,
        method: "POST",
        body: JSON.stringify({ state: publicState(), aa }),
      });
      if (!r.ok) throw new Error("bridge_error");
      const body = JSON.parse(r.text);
      if (body.aa && body.aa.fetchedAt !== aa?.fetchedAt) {
        aa = body.aa;
        lastAARefresh = Math.max(lastAARefresh, body.aa.fetchedAt);
        rebuild();
        await $.store.set("catalogue", {
          runtime,
          aa,
          lastRefresh,
          lastAARefresh,
        });
      }
      for (const c of body.controls ?? []) {
        try {
          await change($, c);
          acks.push({
            id: c.id,
            status: "applied",
            revision: control.revision,
          });
        } catch {
          acks.push({
            id: c.id,
            status: "rejected",
            reason: "invalid_control_or_conflict",
          });
        }
      }
      if ((body.controls ?? []).length)
        await $.http.fetch("http://bridge/native/sync", {
          socketPath: descriptor.socketPath,
          method: "POST",
          body: JSON.stringify({ state: publicState(), aa }),
        });
    } catch {
      refreshError = "Local dashboard disconnected";
    } finally {
      syncing = null;
    }
  })();
  await syncing;
}
async function refresh($) {
  if (refreshBusy) return;
  refreshBusy = true;
  const discover = !lastRefresh || now - lastRefresh >= 86400000;
  try {
    const key = await $.env.get("APEX_AA_API_KEY");
    const fetchAA =
      key && !descriptor && (!lastAARefresh || now - lastAARefresh >= 86400000);
    if (!discover && !fetchAA) return;
    const auth = discover ? await $.session.authorize() : null;
    if (auth) {
      let all = [],
        cursor = "";
      for (let page = 0; page < 20; page++) {
        const r = await $.http.fetch(
          "https://api.anthropic.com/v1/models?limit=100" +
            (cursor ? "&after_id=" + encodeURIComponent(cursor) : ""),
          { auth: auth.handle, headers: { "anthropic-version": "2023-06-01" } },
        );
        if (!r.ok) throw new Error("Model discovery HTTP " + r.status);
        const body = JSON.parse(r.text);
        all.push(...runtimeModels(body));
        if (!body.has_more) {
          runtime = all;
          break;
        }
        if (!body.last_id || page === 19)
          throw new Error("Incomplete runtime catalogue");
        cursor = body.last_id;
      }
    }
    if (discover) lastRefresh = now;
    if (fetchAA) {
      lastAARefresh = now;
      const result = await fetchAAPages(async (page) => {
        const r = await $.http.fetch(
          "https://artificialanalysis.ai/api/v2/language/models/free?page=" +
            page,
          { headers: { "x-api-key": key } },
        );
        if (!r.ok) throw new Error("AA refresh HTTP " + r.status);
        if (r.text.length > 10 * 1024 * 1024)
          throw new Error("AA response too large");
        return JSON.parse(r.text);
      });
      aa = {
        ...result,
        fetchedAt: now,
        source: "https://artificialanalysis.ai/data-api",
      };
    }
    refreshError = null;
    rebuild();
    await $.store.set("catalogue", { runtime, aa, lastRefresh, lastAARefresh });
    await sync($);
    draw($);
  } catch {
    refreshError = "Catalogue refresh failed; previous evidence retained";
    if (discover) lastRefresh = now;
    await $.store.set("catalogue", { runtime, aa, lastRefresh, lastAARefresh });
    draw($);
  } finally {
    refreshBusy = false;
  }
}
async function dashboard($) {
  if (!descriptor) {
    const node = (await $.env.get("APEX_NODE")) || "node";
    const r = await $.process.run(
      [node, $.plugin.root + "/companion/server.mjs", "start"],
      { timeoutMs: 10000 },
    );
    if (r.exitCode !== 0) throw new Error("Dashboard requires Node 22+");
    descriptor = JSON.parse(r.stdout);
    timer = $.clock.every(500, () => sync($));
    await sync($);
  }
  return descriptor.url;
}
async function uiAction($, run, notice = "") {
  try {
    await run();
    nativeUi.notice = notice;
    nativeUi.noticeError = false;
  } catch (error) {
    nativeUi.notice =
      error.message === "invalid_control"
        ? "Enter valid values; nothing was changed."
        : String(error.message ?? "Action failed");
    nativeUi.noticeError = true;
  }
  draw($);
}
function nativeActions($) {
  return {
    change: (command) =>
      uiAction(
        $,
        async () => {
          await change($, { ...command, expectedRevision: control.revision });
          await sync($);
        },
        "Saved to the host · revision " + (control.revision + 1),
      ),
    open: async (view = "compact") => {
      nativeUi.view = view;
      nativeUi.modeMenu = false;
      await $.ui.open({
        id: "apex",
        title: "APEX",
        columns: view === "compact" ? 34 : 72,
        rows: view === "compact" ? 12 : 24,
      });
      draw($);
    },
    close: () => $.ui.close({ id: "apex" }),
    modeMenu: () => {
      nativeUi.modeMenu = !nativeUi.modeMenu;
      draw($);
    },
    view: (view) => {
      nativeUi.view = view;
      nativeUi.notice = "";
      nativeUi.modeMenu = false;
      draw($);
    },
    scope: (scope) => {
      nativeUi.scope = scope;
      nativeUi.selectedId = null;
      draw($);
    },
    draft: (key, value) => {
      nativeUi[key] = value;
      draw($);
    },
    page: (kind, delta) => {
      nativeUi[kind] = Math.max(0, nativeUi[kind] + delta);
      draw($);
    },
    tab: (tab) => {
      nativeUi.tab = tab;
      nativeUi.notice = "";
      draw($);
    },
    select: (id) => {
      nativeUi.selectedId = id;
      nativeUi.view = "inspect";
      draw($);
    },
    print: (event) => $.ui.log(JSON.stringify(event, null, 2)),
    budget: (value) => {
      nativeUi.budget = value;
    },
    backend: (value) => {
      nativeUi.backend = value;
    },
    ids: (value) => {
      nativeUi.ids = value;
    },
    credits: (value) =>
      uiAction(
        $,
        async () => {
          if (
            !value.trim() ||
            !Number.isFinite(Number(value)) ||
            Number(value) <= 0
          )
            throw new Error(
              "Enter a positive USD estimate budget; consent stays unchanged.",
            );
          await change($, {
            kind: "credits",
            allowed: true,
            budgetUsd: Number(value),
            expectedRevision: control.revision,
          });
          nativeUi.budget = value;
          await sync($);
        },
        "APEX consent saved. Account billing remains a separate action.",
      ),
    availability: (value) =>
      uiAction(
        $,
        async () => {
          if (!["api", "subscription"].includes(nativeUi.backend))
            throw new Error("Select your confirmed billing backend first.");
          await change($, {
            kind: "availability",
            ids: value.trim().split(/\s+/).filter(Boolean),
            backend: nativeUi.backend,
            expectedRevision: control.revision,
          });
          nativeUi.ids = value;
          await sync($);
        },
        "Account availability saved; exact evidence mappings still apply.",
      ),
    mapping: (value) =>
      uiAction(
        $,
        async () => {
          const [runtimeId, aaSlug, effort, ...extra] = value
            .trim()
            .split(/\s+/);
          if (!runtimeId || !aaSlug || extra.length)
            throw new Error("Use: runtime-ID AA-slug effort (or default).");
          await change($, {
            kind: "mapping",
            runtimeId,
            aaSlug,
            effort: !effort || effort === "default" ? null : effort,
            expectedRevision: control.revision,
          });
          await sync($);
        },
        "Verified mapping saved; incompatible effort evidence remains excluded.",
      ),
    toggle: () =>
      uiAction(
        $,
        async () => {
          const resume = pins || control.routing !== "auto";
          await change($, {
            kind: "routing",
            value: resume ? "auto" : "manual_hold",
            expectedRevision: control.revision,
          });
          await sync($);
        },
        "Routing updated for the next request.",
      ),
    dock: (value) =>
      uiAction(
        $,
        async () => {
          nativeUi.dock = value;
          await $.store.set("display", { dock: value });
        },
        "Dock preference saved.",
      ),
    refresh: () =>
      uiAction(
        $,
        async () => {
          now = await $.clock.now();
          if (
            refreshBusy ||
            (lastAARefresh &&
              now < Math.min(lastAARefresh + 86400000, lastRefresh + 86400000))
          )
            throw new Error(
              "Refresh is not eligible yet; previous evidence is retained.",
            );
          await refresh($, true);
        },
        "Refresh requested; daily source limits apply.",
      ),
    dashboard: () =>
      uiAction($, async () => {
        await $.ui.log("Open local APEX console: " + (await dashboard($)));
      }),
  };
}
export function register(on, config = {}) {
  on("session.start", async ($, e, next) => {
    const stored = await $.store.get("control");
    if (stored && typeof stored === "object" && stored.revision >= 0) {
      try {
        control = {
          ...initialControl(),
          ...stored,
          creditsConsent: false,
          budgetUsd: 0,
          qualityOnce: null,
          modeConsumedRevision: stored.modeRevision ?? 0,
        };
      } catch {}
    }
    const display = await $.store.get("display");
    nativeUi = {
      ...nativeUi,
      tab: "live",
      view: "compact",
      modeMenu: false,
      paneShown: false,
      scope: "auto",
      selectedId: null,
      notice: "",
      budget: "",
      backend: control.backend,
      ids: control.verifiedIds.join(" "),
      dock: ["expanded", "compact", "hidden"].includes(display?.dock)
        ? display.dock
        : "expanded",
    };
    const cache = await $.store.get("catalogue");
    if (cache && typeof cache === "object") {
      runtime = cache.runtime ?? [];
      aa = cache.aa ?? null;
      lastRefresh = cache.lastRefresh ?? 0;
      lastAARefresh = cache.lastAARefresh ?? cache.aa?.fetchedAt ?? 0;
      rebuild();
    }
    hostVersion = (await $.session.version()).version;
    const settings = await $.settings.read();
    pins = Boolean(
      settings.model ||
      settings.effortLevel ||
      (await $.env.get("ANTHROPIC_MODEL")) ||
      (await $.env.get("CLAUDE_CODE_EFFORT_LEVEL")),
    );
    await $.command.register({
      name: "apex",
      description: "APEX request routing, modes and receipts",
      argumentHint:
        "mode eco|balanced|quality|sports; dashboard; refresh; auto; hold; why; credits",
      immediate: true,
    });
    now = await $.clock.now();
    refreshTimer = $.clock.every(600000, async () => {
      now = await $.clock.now();
      await refresh($);
    });
    void refresh($);
    return next(e);
  });
  on("session.end", async ($, e, next) => {
    if (["clear", "resume"].includes(e.reason)) {
      ledger = new Ledger();
      intent = {
        task: "general",
        risk: "unknown",
        difficulty: "standard",
        failures: 0,
      };
      await change($, {
        kind: "credits",
        allowed: false,
        budgetUsd: 0,
        expectedRevision: control.revision,
      });
      control = { ...control, qualityOnce: null };
      await sync($);
    } else {
      timer?.cancel();
      refreshTimer?.cancel();
      timer = null;
      refreshTimer = null;
      if (descriptor) {
        try {
          await $.http.fetch("http://bridge/native/sync", {
            socketPath: descriptor.socketPath,
            method: "POST",
            body: JSON.stringify({ shutdown: true }),
          });
        } catch {}
        descriptor = null;
      }
    }
    return next(e);
  });
  on("prompt.submit", async ($, e, next) => {
    if (["composer", "bridge", "sdk"].includes(e.origin?.kind)) {
      const nextIntent = classifyIntent(e.text, intent);
      if (nextIntent !== intent && control.taskOverride !== null)
        await change($, {
          kind: "task",
          task: null,
          expectedRevision: control.revision,
        });
      intent = nextIntent;
    }
    return next(e);
  });
  on("command.run", async ($, e, next) => {
    if (e.command === "model" || e.command === "effort") {
      if (["composer", "bridge", "sdk"].includes(e.origin?.kind)) {
        await change($, {
          kind: "routing",
          value: "manual_hold",
          expectedRevision: control.revision,
        });
      }
      return next(e);
    }
    if (e.command !== "apex") return next(e);
    const args = Array.isArray(e.args)
      ? e.args
      : String(e.args ?? "")
          .trim()
          .split(/\s+/);
    const [verb, value, ...extra] = args;
    try {
      if (verb === "dock") {
        if (!["expanded", "compact", "hidden"].includes(value))
          return { text: "Use /apex dock expanded|compact|hidden" };
        await nativeActions($).dock(value);
        return { text: "APEX dock: " + value };
      }
      if (
        [
          "rail",
          "inspect",
          "live",
          "timeline",
          "receipt",
          "controls",
          "setup",
        ].includes(verb)
      ) {
        const view =
          verb === "rail" || verb === "live"
            ? "compact"
            : verb === "controls" || verb === "setup"
              ? "settings"
              : "inspect";
        await nativeActions($).open(view);
        return { text: "" };
      }
      if (verb === "quality-once") {
        await change($, {
          kind: "quality_once",
          armed: value !== "cancel",
          expectedRevision: control.revision,
        });
        await sync($);
        return {
          text:
            value === "cancel"
              ? "Quality once canceled."
              : "High Quality once saved for the next main request; base mode unchanged.",
        };
      }
      if (verb === "mode") {
        await change($, {
          kind: "mode",
          mode: value,
          expectedRevision: control.revision,
        });
        await sync($);
        return {
          text:
            value +
            " queued for next unsent request · revision " +
            control.revision,
        };
      }
      if (verb === "auto" || verb === "hold") {
        if (verb === "auto") pins = false;
        await change($, {
          kind: "routing",
          value: verb === "auto" ? "auto" : "manual_hold",
          expectedRevision: control.revision,
        });
        await sync($);
        return { text: "Routing " + control.routing };
      }
      if (verb === "refresh") {
        now = await $.clock.now();
        if (
          refreshBusy ||
          (lastAARefresh &&
            now < Math.min(lastAARefresh + 86400000, lastRefresh + 86400000))
        )
          return {
            text: "Refresh is not eligible yet. Daily source limits apply; previous evidence is retained.",
          };
        await refresh($, true);
        return {
          text: "Refresh requested; daily source limits apply. Last good evidence stays active.",
        };
      }
      if (verb === "dashboard") {
        return { text: "Open local APEX dashboard: " + (await dashboard($)) };
      }
      if (verb === "why")
        return {
          text: JSON.stringify(
            ledger.events.at(-1) ?? { status: "No requests yet" },
            null,
            2,
          ),
        };
      if (verb === "models")
        return {
          text: JSON.stringify(
            models.map((m) => ({
              id: m.runtimeId,
              effort: m.effort,
              routable: m.routable,
              exclusions: m.exclusions,
            })),
            null,
            2,
          ),
        };
      if (verb === "doctor")
        return {
          text: JSON.stringify(
            {
              hostVersion,
              models: runtime.length,
              benchmarkModels: aa?.models.length ?? 0,
              backend: control.backend,
              pins,
              dataAgeHours: aa ? (now - aa.fetchedAt) / 3600000 : null,
              refreshError,
              dashboard: descriptor ? "connected" : "closed",
              billing: "unknown",
            },
            null,
            2,
          ),
        };
      if (verb === "credits") {
        if (value === "off") {
          await change($, {
            kind: "credits",
            allowed: false,
            budgetUsd: 0,
            expectedRevision: control.revision,
          });
          return {
            text: "APEX credit-funded routing consent revoked; Claude account billing unchanged.",
          };
        }
        if (value === "allow" && Number(extra[0]) > 0) {
          await change($, {
            kind: "credits",
            allowed: true,
            budgetUsd: Number(extra[0]),
            expectedRevision: control.revision,
          });
          return {
            text: "APEX routing consent allowed within API-equivalent cap. Account billing unverified; actual billed-dollar cap is not guaranteed.",
          };
        }
        return {
          text: "Use /apex credits allow USD_CAP or /apex credits off. Account activation: run /usage-credits yourself; Claude may queue billing until idle.",
        };
      }
      if (verb === "map") {
        await change($, {
          kind: "mapping",
          runtimeId: value,
          aaSlug: extra[0],
          effort: extra[1] === "default" ? null : extra[1],
          expectedRevision: control.revision,
        });
        return { text: "Exact model/benchmark mapping saved." };
      }
      if (verb === "allow-models") {
        await change($, {
          kind: "availability",
          backend: value,
          ids: extra,
          expectedRevision: control.revision,
        });
        return { text: "Account model availability confirmed by user." };
      }
      await nativeActions($).open();
      return {};
    } catch {
      return {
        text: "APEX control rejected. Check command arguments, supported effort, and current revision. Use /apex doctor.",
      };
    }
  });
  on("config.set", async ($, e, next) => {
    if (
      ["model", "effort", "effortLevel"].includes(e.key) &&
      ["composer", "bridge"].includes(e.origin?.kind)
    )
      await change($, {
        kind: "routing",
        value: "manual_hold",
        expectedRevision: control.revision,
      });
    return next(e);
  });
  on("session.measure", async ($, e, next) => {
    hostUsage = await $.session.usage();
    contextTokens = hostUsage.context?.tokens ?? null;
    draw($);
    return next(e);
  });
  on("turn.step", async function* ($, e, next) {
    await sync($);
    now = await $.clock.now();
    if (!e.agentId) {
      hostUsage = await $.session.usage();
      contextTokens = hostUsage.context?.tokens ?? null;
    }
    const original = {
      model: e.model,
      ...(e.effort !== undefined ? { effort: e.effort } : {}),
    };
    const id = e.turnId + ":" + e.index + ":" + (e.agentId ?? "main");
    const captured = e.agentId ? null : captureDispatch(control, id);
    const dispatchControl = captured?.effective ?? { ...control };
    // Atomic claim: no await between capturing and clearing the one-shot token.
    if (captured) control = captured.next;
    const decision = e.agentId
      ? {
          pair: original,
          reason: "agent_native_settings",
          estimate: null,
          ranked: [],
        }
      : route({
          original,
          control: dispatchControl,
          intent,
          models,
          fetchedAt: aa?.fetchedAt,
          now,
          inputTokens: contextTokens,
          spentUsd: ledger.spentUsd,
          reservedUsd: ledger.reservedUsd,
          pinned: pins,
          lastModel,
          lastEffort,
          stepsOnModel,
        });
    if (!e.agentId && lastModel === decision.pair.model) stepsOnModel++;
    else if (!e.agentId) {
      lastModel = decision.pair.model;
      stepsOnModel = 1;
    }
    if (!e.agentId) lastEffort = decision.pair.effort;
    const task = e.agentId
      ? "unknown"
      : (dispatchControl.taskOverride ?? intent.task);
    const baseline = models.find(
      (m) =>
        m.runtimeId === original.model &&
        m.effort === (original.effort ?? null),
    );
    const snapshot = freezeDecision({
      original,
      decision,
      models,
      task,
      fetchedAt: aa?.fetchedAt,
      baselineForecast: baseline
        ? forecastCost(baseline.evidence, contextTokens, baseline.outputCap)
        : null,
    });
    const event = ledger.begin(
      id,
      {
        turnId: e.turnId,
        step: e.index,
        agentId: e.agentId ?? null,
        kind: "request",
        timestamp: now,
        startedAt: now,
        mode: dispatchControl.mode,
        baseMode: control.mode,
        revision: dispatchControl.revision,
        modeRevision: dispatchControl.modeRevision ?? 0,
        onceRevision: captured?.onceRevision ?? null,
        decisionSnapshot: snapshot,
        task,
        risk: e.agentId ? "unknown" : intent.risk,
        original,
        apexRequested: decision.pair,
        reason: decision.reason,
        ranked: decision.ranked.slice(0, 10),
      },
      decision.estimate,
    );
    if (captured) await $.store.set("control", control);
    draw($);
    void sync($);
    try {
      const result = yield* next({
        ...e,
        model: decision.pair.model,
        effort: decision.pair.effort,
      });
      const reported = result.usage?.model;
      const evidence =
        snapshot.selected?.model === reported ? snapshot.selected : null;
      const u = result.usage,
        cost = u
          ? estimatedCost(
              evidence,
              u.input_tokens,
              u.output_tokens,
              u.cache_read_input_tokens ?? 0,
              u.cache_creation_input_tokens ?? 0,
            )
          : null;
      ledger.finish(id, u, cost, "complete", await $.clock.now());
      draw($);
      void sync($);
      return result;
    } catch (error) {
      ledger.finish(id, null, null, "error", await $.clock.now());
      models = models.map((m) =>
        m.runtimeId === decision.pair.model &&
        decision.pair.model !== original.model
          ? {
              ...m,
              routable: false,
              exclusions: [...m.exclusions, "runtime_rejected"],
            }
          : m,
      );
      draw($);
      throw error;
    }
  });
  on("tool.call", async ($, e, next) => {
    const startedAt = await $.clock.now();
    const id = "tool:" + e.tool_use_id;
    ledger.events.push({
      id,
      sequence: ++ledger.sequence,
      timestamp: startedAt,
      startedAt,
      kind: "tool",
      tool: e.tool,
      status: "running",
      agentId: e.agentId ?? null,
    });
    ledger.events = ledger.events.slice(-1000);
    draw($);
    try {
      const result = await next(e);
      const row = ledger.events.find((x) => x.id === id);
      if (row) {
        row.status = result.isError || result.deny ? "error" : "complete";
        row.completedAt = await $.clock.now();
      }
      if (!e.agentId && (result.isError || result.deny))
        intent = { ...intent, failures: intent.failures + 1 };
      draw($);
      return result;
    } catch (error) {
      if (!e.agentId) intent = { ...intent, failures: intent.failures + 1 };
      const row = ledger.events.find((x) => x.id === id);
      if (row) {
        row.status = "error";
        row.completedAt = await $.clock.now();
      }
      draw($);
      throw error;
    }
  });
  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const active = ledger.events.findLast(
      (x) => x.status === "streaming" && !x.agentId,
    );
    return active
      ? next({
          ...e,
          props: {
            ...e.props,
            suffix:
              (e.props.suffix ?? "") +
              " · APEX " +
              active.apexRequested.model +
              " / " +
              (active.apexRequested.effort ?? "default"),
          },
        })
      : next(e);
  });
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const previous = await next(e);
    const elements = $.ui.resolve(e);
    const drawing = dock(
      elements,
      e.props,
      { ...publicState(), ui: nativeUi, aaVariants: aa?.models ?? [] },
      nativeActions($),
    );
    if (!drawing) return previous;
    return elements.Box({
      flexDirection: "column",
      children: [...(previous ? [previous] : []), drawing],
    });
  });
  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== "apex") return next(e);
    nativeUi.paneShown = true;
    nativeUi.placement = e.props.placement;
    return pane(
      $.ui.resolve(e),
      e.props,
      { ...publicState(), ui: nativeUi, aaVariants: aa?.models ?? [] },
      nativeActions($),
    );
  });
  on("ui.close", async ($, e, next) => {
    const result = await next(e);
    if (e.id === "apex") {
      nativeUi.paneShown = false;
      nativeUi.placement = null;
      draw($);
    }
    return result;
  });
}
