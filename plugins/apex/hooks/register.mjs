import {
  initialControl,
  applyControl,
  classifyIntent,
  route,
  estimatedCost,
  Ledger,
} from "../core/router.mjs";
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
  refreshError = null,
  contextTokens = null,
  pins = false,
  lastModel = null,
  lastEffort = undefined,
  stepsOnModel = 2,
  acks = [],
  syncing = null,
  now = Date.now();
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
        rebuild();
        await $.store.set("catalogue", { runtime, aa, lastRefresh });
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
async function refresh($, force = false) {
  if (refreshBusy || now - lastRefresh < 86400000) return;
  refreshBusy = true;
  try {
    const auth = await $.session.authorize();
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
    const key = await $.env.get("APEX_AA_API_KEY");
    if (key && !descriptor) {
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
    lastRefresh = now;
    refreshError = null;
    rebuild();
    await $.store.set("catalogue", { runtime, aa, lastRefresh });
    await sync($);
    draw($);
  } catch {
    refreshError = "Catalogue refresh failed; previous evidence retained";
    lastRefresh = now;
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
        };
      } catch {}
    }
    const cache = await $.store.get("catalogue");
    if (cache && typeof cache === "object") {
      runtime = cache.runtime ?? [];
      aa = cache.aa ?? null;
      lastRefresh = cache.lastRefresh ?? 0;
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
        void refresh($, true);
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
      await $.ui.open({ id: "apex", title: "APEX", focus: true });
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
    const decision = e.agentId
      ? {
          pair: original,
          reason: "agent_native_settings",
          estimate: null,
          ranked: [],
        }
      : route({
          original,
          control,
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
    const id = e.turnId + ":" + e.index + ":" + (e.agentId ?? "main");
    ledger.begin(
      id,
      {
        turnId: e.turnId,
        step: e.index,
        agentId: e.agentId ?? null,
        mode: control.mode,
        revision: control.revision,
        task: e.agentId ? "unknown" : (control.taskOverride ?? intent.task),
        risk: e.agentId ? "unknown" : intent.risk,
        original,
        apexRequested: decision.pair,
        reason: decision.reason,
        ranked: decision.ranked.slice(0, 10),
      },
      decision.estimate,
    );
    draw($);
    void sync($);
    try {
      const result = yield* next({
        ...e,
        model: decision.pair.model,
        effort: decision.pair.effort,
      });
      const evidence = models.find(
        (m) =>
          m.runtimeId === (result.usage?.model ?? decision.pair.model) &&
          m.effort === (decision.pair.effort ?? null),
      )?.evidence;
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
      ledger.finish(id, u, cost);
      draw($);
      void sync($);
      return result;
    } catch (error) {
      ledger.finish(id, null, null, "error");
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
    const id = "tool:" + e.tool_use_id;
    ledger.events.push({
      id,
      sequence: ++ledger.sequence,
      timestamp: now,
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
      if (row)
        row.status = result.isError || result.deny ? "error" : "complete";
      if (!e.agentId && (result.isError || result.deny))
        intent = { ...intent, failures: intent.failures + 1 };
      draw($);
      return result;
    } catch (error) {
      if (!e.agentId) intent = { ...intent, failures: intent.failures + 1 };
      const row = ledger.events.find((x) => x.id === id);
      if (row) row.status = "error";
      draw($);
      throw error;
    }
  });
  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const active = ledger.events.findLast((x) => x.status === "streaming");
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
  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== "apex") return next(e);
    const { Box, Text, Button } = $.ui.resolve(e);
    const modeButtons = ["eco", "balanced", "quality", "sports"].map((mode) =>
      Button({
        key: "mode-" + mode,
        label: (control.mode === mode ? "● " : "○ ") + mode,
        onPress: async () => {
          await change($, {
            kind: "mode",
            mode,
            expectedRevision: control.revision,
          });
          await sync($);
        },
      }),
    );
    const active = ledger.events.findLast((x) => x.status === "streaming");
    return Box({
      flexDirection: "column",
      gap: 1,
      padding: 1,
      children: [
        Text({
          bold: true,
          children:
            "APEX · " + control.routing + " · revision " + control.revision,
        }),
        Box({ flexDirection: "row", gap: 1, children: modeButtons }),
        Text({
          children: active
            ? "Requested: " +
              active.apexRequested.model +
              " / " +
              (active.apexRequested.effort ?? "default") +
              " · streaming"
            : "No active request",
        }),
        Text({
          dimColor: true,
          children:
            "API≈ " +
            (ledger.events.some(
              (x) => x.observedUsd !== null && x.observedUsd !== undefined,
            )
              ? ledger.spentUsd.toFixed(4) +
                " USD" +
                (ledger.unknownCosts ? " (partial)" : "")
              : "not yet observed") +
            " · AA " +
            (aa ? "connected" : "key needed") +
            " · Billing unknown",
        }),
        Text({
          children:
            "Credits: " +
            (control.creditsConsent
              ? "APEX allowed; account unverified"
              : "not allowed by APEX"),
        }),
        ...ledger.events.slice(-6).map((row) =>
          Text({
            key: row.id,
            children:
              row.kind === "tool"
                ? row.tool + " · " + row.status
                : "#" +
                  row.step +
                  " " +
                  row.apexRequested.model +
                  " / " +
                  (row.apexRequested.effort ?? "default") +
                  " · " +
                  row.status,
          }),
        ),
        Box({
          flexDirection: "row",
          gap: 1,
          children: [
            Button({
              key: "auto",
              label: control.routing === "auto" ? "Hold" : "Auto",
              onPress: async () => {
                pins = false;
                await change($, {
                  kind: "routing",
                  value: control.routing === "auto" ? "manual_hold" : "auto",
                  expectedRevision: control.revision,
                });
              },
            }),
            Button({
              key: "dashboard",
              label: "Dashboard",
              onPress: async () => {
                await $.ui.log("Open local dashboard: " + (await dashboard($)));
              },
            }),
            Button({
              key: "credits",
              label: control.creditsConsent ? "Revoke credits" : "Credits info",
              onPress: async () => {
                if (control.creditsConsent)
                  await change($, {
                    kind: "credits",
                    allowed: false,
                    budgetUsd: 0,
                    expectedRevision: control.revision,
                  });
                else
                  await $.ui.log(
                    "Allow via /apex credits allow USD_CAP. Account billing uses /usage-credits and remains a separate action.",
                  );
              },
            }),
          ],
        }),
      ],
    });
  });
}
