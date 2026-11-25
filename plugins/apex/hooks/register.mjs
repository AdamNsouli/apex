import { dock, pane, contextRow } from "./interface.mjs";
import {
  initialControl,
  applyControl,
  classifyIntent,
  route,
  estimatedCost,
  Ledger,
  captureDispatch,
  agentPlan,
  forecastCost,
  wantsUltracode,
  wantsFanOut,
  fanOutNote,
  executionNote,
  wantsExecutionNote,
  effectiveMode,
  migrateMode,
  modeName,
} from "../core/router.mjs";
import { countsAsFailure, COUNTED_TOOLS, tierFor } from "../core/scoring.mjs";
import { summariseOverhead, overheadText } from "../core/overhead.mjs";
import {
  contextOffer,
  contextText,
  parseContextArg,
  COMPACT_INSTRUCTIONS,
} from "../core/context.mjs";
import { freezeDecision } from "../core/receipt.mjs";
import {
  badSignal,
  addStrike,
  addClean,
  learnedSteps,
  learningText,
  emptyLearning,
} from "../core/learning.mjs";
import {
  historyRow,
  appendHistory,
  summariseHistory,
  reportText,
} from "../core/report.mjs";
import { wantsTrim, trimmedOutput, outputText } from "../core/output.mjs";
import { limitLean, leanMode, limitsText } from "../core/limits.mjs";
import { exploreStep, wantsReview, reviewNote } from "../core/delegation.mjs";
import {
  READER_MODEL,
  READER_SYSTEM,
  READER_TIMEOUT_MS,
  READER_MAX_TOKENS,
  readerWanted,
  readerPrompt,
  parseReading,
  mergeReading,
  readerText,
} from "../core/reader.mjs";
import {
  guidanceForModel,
  guidanceStatus,
  guidanceText,
} from "../core/anthropic-guidance.mjs";
import {
  VERSION,
  MODES as MODE_TEXT,
  modelName,
} from "../core/presentation.mjs";
import {
  runtimeModels,
  joinCatalogue,
  fetchAAPages,
  suggestMappings,
  withNamedEffort,
  describeRefresh,
} from "../core/catalogue.mjs";
// Weekly report: the last summary drawn in the rail's report view.
let reportSummary = null;
// Strikes from bad answers, shared by every chat (core/learning.mjs), and the
// last main prompt this chat sent, to spot a resend.
let learning = emptyLearning(),
  lastPromptText = null;
async function loadLearning($) {
  try {
    learning = (await $.store.get("learning")) ?? emptyLearning();
  } catch {}
  return learning;
}
async function saveLearning($, fn) {
  await loadLearning($);
  learning = fn(learning);
  try {
    await $.store.set("learning", learning);
  } catch {}
}
// Appends one finished request to the shared history. Re-reads just before the
// write so another chat's rows are kept.
async function recordHistory($, row) {
  try {
    const at = await $.clock.now();
    const stored = await $.store.get("history");
    await $.store.set("history", appendHistory(stored, row, at));
  } catch {}
}
async function loadReport($) {
  const at = await $.clock.now();
  let stored = [];
  try {
    stored = (await $.store.get("history")) ?? [];
  } catch {}
  reportSummary = summariseHistory(
    [...(Array.isArray(stored) ? stored : []), ...(demo?.history ?? [])],
    at,
    7,
  );
  reportSummary.demo = Boolean(demo?.history);
  return reportSummary;
}
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
  discoverRetryAt = 0,
  lastAARefresh = 0,
  refreshError = null,
  lastChange = null,
  ultra = "idle",
  contextTokens = null,
  contextArmedAt = null,
  readerPending = null,
  outputStats = { count: 0, chars: 0 },
  exploreState = null,
  demo = null,
  delegationNotes = { explore: 0, review: 0, team: 0 },
  lastReading = null,
  contextNudge = null,
  pins = false,
  lastModel = null,
  lastEffort = undefined,
  stepsOnModel = 2,
  mainNativeModel = null,
  overhead = null,
  agentRoutes = new Map(),
  acks = [],
  syncing = null,
  savedRevision = 0,
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
// Ultracode can only be switched by its own command, and a command a plugin runs
// waits until the session is idle. So a critical task is held, the switch is
// turned on, the message is sent again as the person's own words, and the switch
// is turned off when that turn ends. The stored mark lets the next session start
// turn it off if this one ended in between.
const ULTRA_ON = "ultracode on",
  ULTRA_OFF = "ultracode off";
async function ultracodeOff($) {
  ultra = "idle";
  try {
    await $.command.run({ command: "effort", args: ULTRA_OFF });
  } catch {}
  try {
    await $.store.set("ultracodeArmed", false);
  } catch {}
}
function armUltracode($, text) {
  ultra = "arming";
  $.clock.after(50, async () => {
    try {
      await $.store.set("ultracodeArmed", true);
      await $.command.run({ command: "effort", args: ULTRA_ON });
      ultra = "running";
      await $.prompt.submit({ text, asUser: true });
    } catch {
      // The message could not be sent with ultracode on: never leave it on.
      await ultracodeOff($);
      try {
        await $.prompt.submit({ text, asUser: true });
      } catch {}
    }
  });
}
// The host's own breakdown of what a chat carries on every message. A failure
// leaves the last reading; this is a report and never blocks routing.
async function refreshOverhead($) {
  try {
    overhead = summariseOverhead(
      await $.session.usage({ breakdown: "summary" }),
      now,
    );
  } catch {}
  return overhead;
}
const publicState = () => ({
  control,
  connected: true,
  now,
  pins,
  evidenceFetchedAt: aa?.fetchedAt ?? null,
  // 0 (eligible now) while models have never been discovered, null until AA has been fetched.
  nextRefreshAt: lastAARefresh
    ? lastRefresh
      ? Math.min(lastAARefresh + 86400000, lastRefresh + 86400000)
      : 0
    : null,
  refreshBusy,
  events: ledger.events,
  runtime,
  catalogue: models,
  hostVersion,
  hostUsage: demo
    ? { ...(hostUsage ?? {}), rateLimits: demo.rateLimits }
    : hostUsage,
  overhead,
  report: reportSummary,
  learning,
  demo: Boolean(demo),
  activity: {
    trimmed: outputStats.count + (demo?.trimmed ?? 0),
    notes: demo
      ? {
          explore: delegationNotes.explore + demo.notes.explore,
          review: delegationNotes.review,
          team: delegationNotes.team,
        }
      : delegationNotes,
    reader: lastReading,
  },
  accountBilling: "unknown",
  intent,
  refreshError,
  changes: lastChange,
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
// Every open chat shares one stored settings record but reads it only when it
// starts. Consent and one-shot state belong to this chat alone; the rest is shared.
const OWN = ["creditsConsent", "budgetUsd", "qualityOnce"];
const DISPATCH = [
  "qualityOnce",
  "modeConsumedRevision",
  "consumedBy",
  "consumedOnceRevision",
];
const pick = (o, keys) =>
  Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const isRecord = (v) => v && typeof v === "object";
const shared = (stored) => ({
  ...initialControl(),
  ...stored,
  mode: migrateMode(stored.mode),
  ...pick(control, [...OWN, "modeConsumedRevision"]),
});
// Take settings another chat saved since this one last looked, before using them.
async function adoptSaved($) {
  try {
    const stored = await $.store.get("control");
    if (!isRecord(stored) || !(stored.revision > control.revision)) return;
    control = shared(stored);
    savedRevision = Math.max(savedRevision, stored.revision);
    rebuild();
  } catch {}
}
async function change($, command) {
  control = applyControl(control, command);
  if (command.kind === "mode") stepsOnModel = 2;
  if (command.kind === "routing" && command.value === "auto") pins = false;
  rebuild();
  const stored = await $.store.get("control");
  if (isRecord(stored) && stored.revision > savedRevision) {
    // Another chat saved since this one last looked: apply this change on top of
    // theirs rather than overwriting them with this chat's older copy.
    control = applyControl(shared(stored), {
      ...command,
      expectedRevision: stored.revision,
    });
    rebuild();
  }
  const saving = control;
  await $.store.set("control", saving);
  savedRevision = Math.max(savedRevision, saving.revision);
  draw($);
}
// Claiming a one-shot request changes only this chat's own bookkeeping.
async function saveDispatch($) {
  const stored = await $.store.get("control");
  await $.store.set("control", {
    ...(isRecord(stored) ? stored : control),
    ...pick(control, DISPATCH),
  });
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
  const before = { runtime, aa };
  const discover =
    (!lastRefresh || now - lastRefresh >= 86400000) && now >= discoverRetryAt;
  let discovered = false;
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
          discovered = true;
          break;
        }
        if (!body.last_id || page === 19)
          throw new Error("Incomplete runtime catalogue");
        cursor = body.last_id;
      }
    }
    // Only a discovery that found models starts the 24-hour wait. With no first-party
    // login (a headless run, a gateway) there is nothing to find, so the wait stays
    // unstarted for a session that has one.
    if (discovered) lastRefresh = now;
    if (!discovered && !fetchAA) return;
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
    // Keep what the last refresh that changed anything found, so a quiet day does
    // not hide a new model before you have seen it.
    const found = describeRefresh(
      before,
      { runtime, aa },
      control.verifiedIds,
      now,
    );
    if (
      found.newModels.length ||
      found.droppedModels.length ||
      found.newEvidence.length ||
      found.changedEvidence.length
    )
      lastChange = found;
    rebuild();
    await $.store.set("catalogue", {
      runtime,
      aa,
      lastRefresh,
      lastAARefresh,
      lastChange,
    });
    await sync($);
    draw($);
  } catch {
    refreshError = "Catalogue refresh failed; previous evidence retained";
    // A failed discovery is retried in an hour, not after a day.
    if (discover && !discovered) discoverRetryAt = now + 3600000;
    await $.store.set("catalogue", {
      runtime,
      aa,
      lastRefresh,
      lastAARefresh,
      lastChange,
    });
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
// Long, unbounded Bash output: save it whole, give Claude head, tail, error lines
// and the path. Never trims without a saved copy.
async function trimBash($, e, result) {
  const r = result.result;
  if (!r || typeof r.stdout !== "string" || r.isImage) return null;
  if (
    !wantsTrim({
      command: e.command,
      stdout: r.stdout,
      stderr: r.stderr ?? "",
      setting: control.output,
      isError: result.isError,
      background: Boolean(r.backgroundTaskId),
    })
  )
    return null;
  try {
    // $.session.info is newer than the oldest supported engine (2.1.292), which
    // refuses a module that names it, so the saved copy goes under TMPDIR.
    const dir = (await $.env.get("TMPDIR"))?.replace(/\/$/, "") || "/tmp";
    const path =
      dir + "/apex-output/bash-" + String(e.tool_use_id ?? Date.now()) + ".txt";
    await $.fs.write(
      path,
      "$ " +
        e.command +
        "\n\n" +
        r.stdout +
        (r.stderr ? "\n--- stderr ---\n" + r.stderr : ""),
    );
    const t = trimmedOutput({ stdout: r.stdout, stderr: r.stderr ?? "", path });
    if (!t.cutChars) return null;
    outputStats = {
      count: outputStats.count + 1,
      chars: outputStats.chars + t.cutChars,
    };
    return { result: { ...r, stdout: t.stdout, stderr: t.stderr } };
  } catch {
    return null;
  }
}
function startReading($, text, base) {
  const t0 = Date.now();
  const promise = $.model
    .complete({
      model: READER_MODEL,
      system: READER_SYSTEM,
      prompt: readerPrompt(text),
      maxTokens: READER_MAX_TOKENS,
      effort: "low",
      timeoutMs: READER_TIMEOUT_MS,
    })
    .then((r) => {
      const reading = r.isAnswered ? parseReading(r.text) : null;
      return {
        reading,
        source: reading
          ? "haiku"
          : r.isAnswered
            ? "unreadable"
            : r.reason === "aborted"
              ? "timeout"
              : "error",
        ms: Date.now() - t0,
      };
    })
    .catch(() => ({ reading: null, source: "error", ms: Date.now() - t0 }));
  return { promise, base };
}
// After a main turn: offer to compact when the chat has grown past the threshold
// and no agent is still working. Never compacts by itself.
async function considerContext($, reason) {
  try {
    const usage = await $.session.usage();
    const tokens = usage.context?.tokens ?? null;
    let busy = false;
    try {
      busy = (await $.agent.list()).some((a) =>
        ["pending", "running", "waiting"].includes(a.status),
      );
    } catch {}
    const r = contextOffer({
      setting: control.context,
      tokens,
      fixedTokens: overhead?.fixedTokens ?? null,
      armedAt: contextArmedAt,
      reason,
      busy,
    });
    contextArmedAt = r.armedAt;
    if (r.offer) contextNudge = r.offer;
    else if (tokens !== null && tokens < contextSettingThreshold())
      contextNudge = null;
    draw($);
  } catch {}
}
const contextSettingThreshold = () =>
  control.context === "off" ? Infinity : (control.context ?? 200000);
function contextActions($) {
  return {
    compact: async () => {
      const offer = contextNudge;
      contextNudge = null;
      draw($);
      try {
        const { skip } = (await $.session.compact({
          instructions: COMPACT_INSTRUCTIONS,
        })) ?? { skip: false };
        if (skip) {
          contextNudge = {
            ...offer,
            text: "Compaction was skipped by another plugin.",
          };
          draw($);
        }
      } catch (error) {
        contextNudge = {
          ...offer,
          text: "Could not compact now (a turn may be running). Try again when Claude is idle, or type /compact.",
        };
        draw($);
      }
    },
    dismiss: () => {
      contextNudge = null;
      draw($);
    },
  };
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
    report: async () => {
      await loadReport($);
      nativeUi.view = "report";
      nativeUi.notice = "";
      nativeUi.modeMenu = false;
      draw($);
    },
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
          // 0.8 and earlier saved eco, quality or sports; unknown is Balanced.
          mode: migrateMode(stored.mode),
          creditsConsent: false,
          budgetUsd: 0,
          qualityOnce: null,
          modeConsumedRevision: stored.modeRevision ?? 0,
        };
        savedRevision = control.revision;
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
      aa = Array.isArray(cache.aa?.models)
        ? { ...cache.aa, models: cache.aa.models.map(withNamedEffort) }
        : (cache.aa ?? null);
      lastRefresh = cache.lastRefresh ?? 0;
      lastAARefresh = cache.lastAARefresh ?? cache.aa?.fetchedAt ?? 0;
      lastChange = cache.lastChange ?? null;
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
        "mode save|balanced|best; dashboard; refresh; auto; hold; why; guidance [MODEL_ID]; credits; map-efforts; confirm-models; overhead; report; learning [reset]; demo [off]; context on|off|<N>k; reader auto|local; output trim|off; limits auto|off; ultracode auto|off; agents auto|off",
      immediate: true,
    });
    now = await $.clock.now();
    await loadLearning($);
    refreshTimer = $.clock.every(600000, async () => {
      now = await $.clock.now();
      await refresh($);
    });
    void refresh($);
    // A session that ended while ultracode was on for a held task left this mark.
    if ((await $.store.get("ultracodeArmed")) === true)
      $.clock.after(50, () => ultracodeOff($));
    return next(e);
  });
  on("session.end", async ($, e, next) => {
    if (["clear", "resume"].includes(e.reason)) {
      ledger = new Ledger();
      overhead = null;
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
      // A message saying the last answer was wrong, or the same prompt again,
      // counts a strike against the task the last pick answered. The message
      // continues that task one tier higher (a fresh hold, so it can switch).
      const lastPick = ledger.events.findLast(
        (x) => x.kind === "request" && !x.agentId && x.status === "complete",
      );
      const signal = lastPick ? badSignal(e.text, lastPromptText) : null;
      lastPromptText = e.text;
      if (signal) {
        const task = intent.task ?? "general",
          at = await $.clock.now();
        await saveLearning($, (l) =>
          addStrike(l, { task, signal, pick: lastPick.apexRequested, at }),
        );
        intent = { ...intent, learnedSteps: learnedSteps(learning, task) };
        readerPending = null;
        stepsOnModel = 2;
        draw($);
        return next(e);
      }
    }
    if (["composer", "bridge", "sdk"].includes(e.origin?.kind)) {
      const previousIntent = intent;
      let nextIntent = classifyIntent(e.text, intent);
      if (nextIntent !== intent && control.taskOverride !== null)
        await change($, {
          kind: "task",
          task: null,
          expectedRevision: control.revision,
        });
      const fresh = nextIntent !== intent;
      if (fresh) {
        // A new task after an answer nobody complained about wears a strike off
        // the previous kind; the new kind starts at its own learned level.
        const prev = previousIntent.task ?? "general";
        if (learning.kinds?.[prev]?.strikes)
          await saveLearning($, (l) => addClean(l, prev));
        const steps = learnedSteps(learning, nextIntent.task ?? "general");
        if (steps || nextIntent.learnedSteps)
          nextIntent = { ...nextIntent, learnedSteps: steps };
      }
      // A fresh prompt gets one small Haiku rating, started now and awaited (with
      // its own timeout) at the turn's first step. Word rules decide meanwhile.
      readerPending =
        fresh &&
        readerWanted({
          text: e.text,
          previous: intent,
          origin: e.origin,
          setting: control.reader,
        })
          ? startReading($, e.text, nextIntent)
          : null;
      if (fresh && !readerPending)
        lastReading = { source: "local", tier: null, ms: 0 };
      intent = nextIntent;
      // A new task is a fresh decision: the hold against flip-flopping covers the
      // steps of one task, not the next prompt (the cache payback still applies).
      if (fresh) stepsOnModel = 2;
      const note = wantsFanOut({
        intent,
        control,
        fresh,
        text: e.text,
        origin: e.origin,
        turnId: e.turnId,
      })
        ? fanOutNote(effectiveMode(control))
        : null;
      const specified = wantsExecutionNote({
        intent,
        control,
        fresh,
        text: e.text,
        origin: e.origin,
        turnId: e.turnId,
      });
      if (
        ultra === "idle" &&
        wantsUltracode({
          control,
          intent,
          fresh,
          text: e.text,
          origin: e.origin,
          attachments: e.attachments,
          turnId: e.turnId,
          pinned: pins,
        })
      ) {
        // Ultracode is itself the multi-agent mode, so the resubmitted prompt
        // needs no note (and a plugin's own submit cannot carry context, nor
        // pass through this plugin's hook).
        armUltracode($, e.text);
        return {
          drop: "APEX is turning ultracode on for this task and sending your message.",
        };
      }
      if (fresh) exploreState = null;
      if (specified)
        return next({ ...e, context: [...(e.context ?? []), executionNote()] });
      // Best can opt into amplification; Balanced never silently fans out. A
      // critical software change in Balanced or Best gets one reviewer.
      const review = wantsReview({
        mode: effectiveMode(control),
        tier: tierFor(intent),
        task: intent.task,
        execution: intent.execution,
        agents: control.agents,
        fresh,
      })
        ? reviewNote()
        : null;
      const notes = [note, note ? null : review].filter(Boolean);
      if (note) delegationNotes.team++;
      else if (review) delegationNotes.review++;
      if (notes.length)
        return next({ ...e, context: [...(e.context ?? []), ...notes] });
    }
    return next(e);
  });
  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (!e.agentId) await considerContext($, e.reason);
    if (ultra === "running") {
      ultra = "idle";
      $.clock.after(50, () => ultracodeOff($));
    }
    return result;
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
      if (verb === "learning") {
        if (value === "reset") {
          await saveLearning($, () => emptyLearning());
          intent = { ...intent, learnedSteps: 0 };
          draw($);
          return { text: "APEX learning cleared. Routing is back to normal." };
        }
        return { text: learningText(await loadLearning($)) };
      }
      if (verb === "report") {
        const summary = await loadReport($);
        // The text stands on its own where no pane can open (print mode, SDK).
        try {
          await nativeActions($).open("report");
        } catch {}
        return {
          text:
            (summary.demo ? "Includes demo data. " : "") +
            reportText(summary, (id) => modelName({ runtime }, id)),
        };
      }
      if (verb === "limits") {
        if (["auto", "off"].includes(value)) {
          await change($, {
            kind: "limits",
            value,
            expectedRevision: control.revision,
          });
          await sync($);
        }
        try {
          hostUsage = await $.session.usage();
        } catch {}
        return {
          text: limitsText(
            control.limits ?? "auto",
            hostUsage?.rateLimits,
            now,
          ),
        };
      }
      if (verb === "output") {
        if (["trim", "off"].includes(value)) {
          await change($, {
            kind: "output",
            value,
            expectedRevision: control.revision,
          });
          await sync($);
        }
        return { text: outputText(control.output ?? "trim", outputStats) };
      }
      if (verb === "reader") {
        if (["auto", "local"].includes(value)) {
          await change($, {
            kind: "reader",
            value,
            expectedRevision: control.revision,
          });
          await sync($);
        }
        return { text: readerText(control.reader ?? "auto", lastReading) };
      }
      if (verb === "context") {
        const parsed = parseContextArg(value);
        if (value === undefined || value === "" || parsed === null)
          return { text: contextText(control.context, contextTokens) };
        await change($, {
          kind: "context",
          value: parsed,
          expectedRevision: control.revision,
        });
        await sync($);
        if (parsed === "off") contextNudge = null;
        contextArmedAt = null;
        draw($);
        return { text: contextText(control.context, contextTokens) };
      }
      if (verb === "ultracode") {
        if (!["auto", "off"].includes(value))
          return {
            text:
              "APEX ultracode is " +
              (control.ultracode ?? "auto") +
              ". Use /apex ultracode auto|off. Auto uses ultracode for hard and critical tasks in Best (and Max Power once), and turns it off when each turn ends; Balanced and Save never enable it automatically. It uses far more than a normal request.",
          };
        await change($, {
          kind: "ultracode",
          value,
          expectedRevision: control.revision,
        });
        await sync($);
        return {
          text:
            value === "auto"
              ? "APEX uses ultracode for hard and critical tasks in Best, and turns it off when each one ends. Balanced and Save never enable it automatically. It uses far more than a normal request."
              : "APEX will not turn ultracode on in any mode.",
        };
      }
      if (verb === "agents") {
        if (!["auto", "off"].includes(value))
          return {
            text:
              "APEX agent routing is " +
              (control.agents ?? "auto") +
              ". Use /apex agents auto|off. Auto routes positively labelled mapping/search workers by their own bounded task; unknown workers keep the main task's demands. Only Best asks for parallel agents; any mode suggests one Explore agent when a long chat keeps searching, and Balanced/Best suggest one reviewer for a critical code change. Off disables APEX routing and these notes, not Claude's native agent tools; an agent given its own model keeps it.",
          };
        await change($, {
          kind: "agents",
          value,
          expectedRevision: control.revision,
        });
        await sync($);
        return {
          text:
            value === "auto"
              ? "APEX routes subagents under the current mode; an agent given its own model keeps it."
              : "Subagents keep their own model and effort.",
        };
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
              ? "Max Power once canceled."
              : "Max Power once saved for the next main request; base mode unchanged.",
        };
      }
      if (verb === "mode") {
        const wanted = modeName([value, ...extra].join(" "));
        if (!wanted)
          return {
            text:
              "APEX mode is " +
              MODE_TEXT[migrateMode(control.mode)].label +
              ". Use /apex mode " +
              Object.keys(MODE_TEXT).join("|") +
              " (older names such as eco, quality or max power still work).",
          };
        await change($, {
          kind: "mode",
          mode: wanted,
          expectedRevision: control.revision,
        });
        await sync($);
        return {
          text:
            MODE_TEXT[wanted].label +
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
      if (verb === "overhead") {
        await refreshOverhead($);
        draw($);
        return { text: overheadText(overhead) };
      }
      if (verb === "demo") {
        // Made-up requests and a made-up plan reading, labelled as such, so the
        // strip and rail can be looked at without spending usage.
        if (value === "off") {
          ledger.events = ledger.events.filter((x) => !x.demo);
          demo = null;
          draw($);
          return { text: "APEX demo data removed." };
        }
        // Made-up benchmark figures for the receipt's charts (labelled demo).
        const demoScore = {
          "claude-haiku-5-5": [38, 0.04],
          "claude-sonnet-5-5": [52, 0.11],
          "claude-opus-5-5": [64, 0.42],
        };
        const cand = (model, effort, bump = 0) => ({
          model,
          effort,
          rawScore: demoScore[model][0] + bump,
          costUpperUsd: demoScore[model][1] * (1 + bump / 10),
          costPerTaskUsd: demoScore[model][1],
        });
        const pick = (model, effort, tier, reason, i, n = 3) => ({
          id: "demo:" + i,
          demo: true,
          sequence: ++ledger.sequence,
          timestamp: now - (n + 1 - i) * 60000,
          startedAt: now - (n + 1 - i) * 60000,
          completedAt: now - (n + 1 - i) * 60000 + 9000,
          kind: "request",
          status: "complete",
          agentId: null,
          task: "coding",
          risk: "normal",
          revision: 1,
          tier,
          reason,
          original: { model: "claude-opus-5-5", effort: "high" },
          apexRequested: { model, effort },
          ranked: [
            cand("claude-opus-5-5", "high", 4),
            cand("claude-opus-5-5", "medium"),
            cand("claude-sonnet-5-5", "medium", 2),
            cand("claude-sonnet-5-5", "low"),
            cand("claude-haiku-5-5", "medium"),
          ],
          decisionSnapshot: {
            fetchedAt: now - 3600000,
            selected: {
              taskScore: demoScore[model][0] + 2,
              benchmarkCostPerTask: demoScore[model][1],
              intelligence: demoScore[model][0],
              aaSlug: model + "-" + effort,
              effort,
              benchmarkVersion: "demo",
            },
            baseline: {
              taskScore: demoScore["claude-opus-5-5"][0] + 4,
              benchmarkCostPerTask: demoScore["claude-opus-5-5"][1],
            },
          },
        });
        const plan = [
          ["claude-sonnet-5-5", "medium", "everyday"],
          ["claude-haiku-5-5", "low", "quick"],
          ["claude-opus-5-5", "high", "hard"],
          ["claude-opus-5-5", "xhigh", "critical"],
          ["claude-sonnet-5-5", "low", "everyday"],
          ["claude-haiku-5-5", "medium", "quick"],
          ["claude-opus-5-5", "medium", "hard"],
          ["claude-sonnet-5-5", "medium", "everyday"],
        ];
        ledger.events.push(
          ...plan.map(([m, eff, tier], i) =>
            pick(m, eff, tier, "balanced_policy", i + 1, plan.length),
          ),
        );
        demo = {
          rateLimits: [
            {
              kind: "five_hour",
              percentUsed: 82,
              resetsAt: new Date(now + 5400000).toISOString(),
            },
            { kind: "seven_day", percentUsed: 41 },
          ],
          trimmed: 2,
          notes: { explore: 1, review: 0, team: 0 },
          // A made-up week for /apex report: 3–11 requests a day.
          history: Array.from({ length: 49 }, (_, i) => {
            const [m, eff] = plan[i % plan.length];
            return historyRow(now - (i % 7) * 86400000 - i * 600000, {
              original: { model: "claude-opus-5-5" },
              requested: { model: m, effort: eff },
              answered: m,
              tier: "everyday",
              agent: i % 9 === 0,
            });
          }).filter((_, i) => i % 7 !== 3 || i < 20),
        };
        draw($);
        return {
          text: "APEX demo: eight made-up requests and a made-up plan reading are shown in the strip and rail. Nothing was sent. /apex demo off removes them.",
        };
      }
      if (verb === "why")
        return {
          text: JSON.stringify(
            ledger.events.at(-1) ?? { status: "No requests yet" },
            null,
            2,
          ),
        };
      if (verb === "guidance")
        return {
          text: guidanceText({
            model: value || null,
            runtime,
            verifiedIds: control.verifiedIds,
            now,
          }),
        };
      if (verb === "models")
        return {
          text: JSON.stringify(
            models.map((m) => ({
              id: m.runtimeId,
              effort: m.effort,
              officialApiDefaultEffort:
                guidanceForModel(m.runtimeId)?.apiDefaultEffort ?? null,
              routable: m.routable,
              mapping: m.mappingSource,
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
              version: VERSION,
              hostVersion,
              guidance: guidanceStatus(now),
              models: runtime.length,
              benchmarkModels: aa?.models.length ?? 0,
              backend: control.backend,
              pins,
              ultracode: control.ultracode ?? "auto",
              context: control.context ?? 200000,
              reader: control.reader ?? "auto",
              output: control.output ?? "trim",
              limits: control.limits ?? "auto",
              delegationNotes,
              rateLimits: hostUsage?.rateLimits ?? [],
              outputStats,
              lastReading,
              contextTokens,
              dataAgeHours: aa ? (now - aa.fetchedAt) / 3600000 : null,
              refreshError,
              lastChange,
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
      if (verb === "map-efforts") {
        const ids = [value, ...extra].filter(Boolean);
        if (!ids.length)
          return { text: "Use /apex map-efforts RUNTIME_ID [RUNTIME_ID...]" };
        const lines = [];
        let qualified = false;
        for (const id of ids) {
          const found = suggestMappings(
            runtime.find((m) => m.id === id) ?? { id, efforts: [] },
            aa?.models ?? [],
          );
          if (!found.length) {
            lines.push(id + ": no exact effort variants found; nothing saved");
            continue;
          }
          for (const s of found)
            await change($, {
              kind: "mapping",
              runtimeId: s.runtimeId,
              aaSlug: s.aaSlug,
              effort: s.effort,
              expectedRevision: control.revision,
            });
          qualified ||= found.some((s) => s.qualifier);
          lines.push(
            id +
              ": " +
              found
                .map(
                  (s) =>
                    s.effort +
                    " = " +
                    s.aaSlug +
                    (s.qualifier ? " (" + s.qualifier + ")" : ""),
                )
                .join(", "),
          );
        }
        await sync($);
        return {
          text:
            "Saved as your confirmed exact mappings:\n" +
            lines.join("\n") +
            (qualified
              ? "\nVariants marked with a fallback were benchmarked with that option on; confirming them accepts that."
              : "") +
            "\nAccount access is separate: confirm it with /apex allow-models.",
        };
      }
      if (verb === "confirm-models") {
        const ids = [value, ...extra].filter(Boolean);
        if (!ids.length)
          return {
            text: "Use /apex confirm-models RUNTIME_ID [RUNTIME_ID...] to add models your plan includes to the ones already confirmed.",
          };
        if (!["api", "subscription"].includes(control.backend))
          return {
            text: "Set your backend first: /apex allow-models subscription|api RUNTIME_ID...",
          };
        const unknown = ids.filter((id) => !runtime.some((m) => m.id === id));
        if (unknown.length)
          return {
            text:
              "Not on your account: " + unknown.join(", ") + ". Nothing saved.",
          };
        await change($, {
          kind: "availability",
          backend: control.backend,
          ids: [...control.verifiedIds, ...ids],
          expectedRevision: control.revision,
        });
        await sync($);
        return {
          text:
            "Confirmed: " +
            ids.join(", ") +
            ". Their exact effort variants join the routing evidence automatically. Confirm only models your plan includes.",
        };
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
      // Bare /apex (or an unknown word) opens the panel; it also says what is
      // running, so the command never looks like it did nothing.
      now = await $.clock.now();
      const routable = models.filter((m) => m.routable).length;
      return {
        text:
          "APEX " +
          VERSION +
          " · mode " +
          control.mode +
          " · routing " +
          control.routing +
          " · " +
          routable +
          " of " +
          models.length +
          " model/effort pairs routable · benchmark data " +
          (aa
            ? Math.round((now - aa.fetchedAt) / 3600000) + "h old"
            : "missing") +
          (refreshError ? " · last refresh failed: " + refreshError : "") +
          ". Panel opened. More: /apex doctor, /apex why, /apex models.",
      };
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
    await adoptSaved($);
    now = await $.clock.now();
    if (!e.agentId) {
      hostUsage = await $.session.usage();
      contextTokens = hostUsage.context?.tokens ?? null;
      if (!overhead) await refreshOverhead($);
    }
    if (!e.agentId && e.index === 0 && readerPending) {
      const pending = readerPending;
      readerPending = null;
      const r = await pending.promise;
      lastReading = { source: r.source, tier: null, ms: r.ms };
      // Apply only if no newer prompt replaced the intent it was asked about.
      if (r.reading && intent === pending.base) {
        intent = mergeReading(intent, r.reading);
        lastReading.tier = intent.readerTier;
      }
    }
    const original = {
      model: e.model,
      ...(e.effort !== undefined ? { effort: e.effort } : {}),
    };
    const id = e.turnId + ":" + e.index + ":" + (e.agentId ?? "main");
    if (!e.agentId) mainNativeModel = e.model;
    // Each agent keeps its own routing memory: the model holding its cache and the
    // size of its own conversation.
    let agent = null,
      plan = null;
    if (e.agentId) {
      agent = agentRoutes.get(e.agentId);
      if (!agent) {
        let type = "unknown",
          description = "";
        try {
          const info = (await $.agent.list()).find((a) => a.id === e.agentId);
          type = info?.type ?? "unknown";
          description = info?.description ?? "";
        } catch {}
        agent = {
          type,
          description,
          failures: 0,
          lastModel: null,
          lastEffort: undefined,
          steps: 2,
          tokens: 0,
        };
        agentRoutes.set(e.agentId, agent);
        if (agentRoutes.size > 200)
          agentRoutes.delete(agentRoutes.keys().next().value);
      }
      plan = agentPlan({
        control,
        agentType: agent.type,
        agentDescription: agent.description,
        agentModel: e.model,
        mainModel: mainNativeModel,
        mainIntent: intent,
      });
      if (plan.route && agent.failures > 0)
        plan = {
          ...plan,
          intent: {
            ...plan.intent,
            failures: Math.max(plan.intent.failures ?? 0, agent.failures),
          },
        };
    }
    const captured = e.agentId ? null : captureDispatch(control, id);
    let dispatchControl = captured?.effective ?? { ...control };
    // Atomic claim: no await between capturing and clearing the one-shot token.
    if (captured) control = captured.next;
    // Near a plan limit, lean toward Save (never Max Power once).
    const lean = limitLean(hostUsage?.rateLimits, control.limits ?? "auto");
    const leaned = (c) =>
      lean.steps && !c.qualityOnce
        ? { ...c, mode: leanMode(c.mode, lean.steps) }
        : c;
    if (!captured?.onceRevision) dispatchControl = leaned(dispatchControl);
    const decision = e.agentId
      ? plan.route
        ? route({
            original,
            control: leaned({ ...control, qualityOnce: null }),
            intent: plan.intent,
            models,
            fetchedAt: aa?.fetchedAt,
            now,
            inputTokens: agent.tokens,
            spentUsd: ledger.spentUsd,
            reservedUsd: ledger.reservedUsd,
            pinned: pins,
            lastModel: agent.lastModel,
            lastEffort: agent.lastEffort,
            stepsOnModel: agent.steps,
          })
        : {
            pair: original,
            reason: plan.reason,
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
    if (agent) {
      agent.steps =
        agent.lastModel === decision.pair.model ? agent.steps + 1 : 1;
      agent.lastModel = decision.pair.model;
      agent.lastEffort = decision.pair.effort;
    }
    const task = e.agentId
      ? plan.route
        ? (plan.intent.task ?? "unknown")
        : "unknown"
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
      task: decision.scoreBasis ?? task,
      fetchedAt: aa?.fetchedAt,
      now,
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
        limitLean: lean.steps
          ? { kind: lean.kind, percent: lean.percent, steps: lean.steps }
          : null,
        revision: dispatchControl.revision,
        modeRevision: dispatchControl.modeRevision ?? 0,
        onceRevision: captured?.onceRevision ?? null,
        decisionSnapshot: snapshot,
        task,
        scoreBasis: decision.scoreBasis ?? null,
        tier: decision.tier ?? null,
        learnedSteps: e.agentId ? 0 : (intent.learnedSteps ?? 0),
        risk: e.agentId ? "unknown" : intent.risk,
        execution: (e.agentId ? plan.intent : intent)?.execution ?? null,
        original,
        apexRequested: decision.pair,
        reason: decision.reason,
        ranked: decision.ranked.slice(0, 10),
      },
      decision.estimate,
    );
    if (captured) await saveDispatch($);
    draw($);
    void sync($);
    try {
      const result = yield* next({
        ...e,
        model: decision.pair.model,
        effort: decision.pair.effort,
      });
      const reported = result.usage?.model;
      if (agent && result.usage)
        agent.tokens =
          (result.usage.input_tokens ?? 0) +
          (result.usage.cache_read_input_tokens ?? 0) +
          (result.usage.cache_creation_input_tokens ?? 0) +
          (result.usage.output_tokens ?? 0);
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
      void recordHistory(
        $,
        historyRow(now, {
          original,
          requested: decision.pair,
          answered: reported,
          tier: decision.tier,
          agent: e.agentId,
        }),
      );
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
      if (
        countsAsFailure({
          tool: e.tool,
          command: e.command,
          isError: result.isError,
          deny: result.deny,
          text: result.text,
        })
      ) {
        const worker = e.agentId ? agentRoutes.get(e.agentId) : null;
        if (worker) worker.failures++;
        else if (!e.agentId)
          intent = { ...intent, failures: intent.failures + 1 };
      }
      draw($);
      if (!e.agentId && !result.deny) {
        const step = exploreStep(
          exploreState,
          { tool: e.tool, command: e.command, isReadOnly: result.isReadOnly },
          { tokens: contextTokens, agents: control.agents },
        );
        exploreState = step.state;
        if (step.note) {
          delegationNotes.explore++;
          const trimmed =
            e.tool === "Bash" && !result.isError
              ? await trimBash($, e, result)
              : null;
          const base = trimmed ?? result;
          return { ...base, context: [...(base.context ?? []), step.note] };
        }
      }
      if (e.tool === "Bash" && !result.isError && !result.deny) {
        const trimmed = await trimBash($, e, result);
        if (trimmed) return trimmed;
      }
      return result;
    } catch (error) {
      const worker = e.agentId ? agentRoutes.get(e.agentId) : null;
      if (!COUNTED_TOOLS.has(e.tool)) {
        // A connector or browser tool that threw is not a failed check.
      } else if (worker) worker.failures++;
      else if (!e.agentId)
        intent = { ...intent, failures: intent.failures + 1 };
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
    const offer = contextNudge
      ? contextRow(elements, e.props, contextNudge, contextActions($))
      : null;
    if (!drawing && !offer) return previous;
    return elements.Box({
      flexDirection: "column",
      children: [
        ...(previous ? [previous] : []),
        ...(drawing ? [drawing] : []),
        ...(offer ? [offer] : []),
      ],
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
