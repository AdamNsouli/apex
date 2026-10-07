const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const { createCompanion } =
    await import("../plugins/apex/companion/server.mjs");
  const { initialControl, applyControl, captureDispatch, Ledger } =
    await import("../plugins/apex/core/router.mjs");
  const { freezeDecision } = await import("../plugins/apex/core/receipt.mjs");
  const { joinCatalogue } = await import("../plugins/apex/core/catalogue.mjs");
  let aaFetches = 0;
  const server = await createCompanion({
    aaKey: null,
    fetcher: async () => {
      aaFetches++;
      return new Response(
        JSON.stringify({
          data: [],
          intelligence_index_version: 4,
          pagination: { page: 1, total_pages: 1, has_more: false },
        }),
      );
    },
  });
  const ledger = new Ledger();
  let control = initialControl(),
    stopped = false,
    acks = [];
  const runtime = ["fixture-alpha", "fixture-beta"].map((id) => ({
    id,
    name: id,
    line: null,
    efforts: ["high"],
    effortSupported: true,
    context: 100000,
    outputCap: 1000,
    capabilities: {},
    thinking: null,
  }));
  const evidence = runtime.map((m, i) => ({
    id: m.id,
    slug: m.id,
    name: m.name + " (high)",
    effort: "high",
    benchmarkVersion: "synthetic-test",
    scores: { general: 40 + i * 20, coding: 40 + i * 20 },
    prices: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
    latencyMs: 1000,
    benchmarkCostPerTask: 0.001,
  }));
  const aa = {
    models: evidence,
    version: "synthetic-test",
    fetchedAt: Date.now(),
    source: "offline-test-fixture",
  };
  const state = () => ({
    control,
    events: ledger.events,
    active: ledger.events.filter((e) => e.status === "streaming"),
    runtime,
    catalogue: joinCatalogue(
      runtime,
      evidence,
      control.mappings,
      control.verifiedIds,
    ),
    hostVersion: "offline fixture",
    evidenceFetchedAt: aa.fetchedAt,
    intent: { task: "general" },
    cost: {
      observedApiEquivalentUsd: ledger.spentUsd,
      reservedApiEquivalentUsd: ledger.reservedUsd,
    },
    controlAcks: acks,
  });
  const sync = () =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { socketPath: server.socketPath, path: "/native/sync", method: "POST" },
        (res) => {
          let data = "";
          res.on("data", (d) => (data += d));
          res.on("end", () => resolve(JSON.parse(data)));
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ state: state(), aa }));
    });
  const pump = async () => {
    while (!stopped) {
      const r = await sync();
      for (const c of r.controls) {
        try {
          control = applyControl(control, c);
          acks.push({
            id: c.id,
            status: "applied",
            revision: control.revision,
          });
        } catch {
          acks.push({ id: c.id, status: "rejected" });
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  await sync();
  const pumping = pump();
  function begin(id, index, agentId = null) {
    const claim = agentId ? null : captureDispatch(control, id),
      dispatch = claim?.effective ?? control;
    if (claim) control = claim.next;
    const original = { model: "fixture-alpha", effort: "high" },
      pair = {
        model: index % 2 ? "fixture-beta" : "fixture-alpha",
        effort: "high",
      };
    const models = joinCatalogue(
      runtime,
      evidence,
      [],
      runtime.map((m) => m.id),
    );
    ledger.begin(
      id,
      {
        kind: "request",
        turnId: "fixture",
        step: index,
        timestamp: Date.now(),
        startedAt: Date.now(),
        agentId,
        mode: dispatch.mode,
        revision: dispatch.revision,
        onceRevision: claim?.onceRevision ?? null,
        original,
        apexRequested: pair,
        reason: agentId ? "agent_native_settings" : "balanced_utility",
        task: "general",
        risk: "normal",
        decisionSnapshot: freezeDecision({
          original,
          decision: {
            pair,
            reason: "balanced_utility",
            estimate: 0.003,
            ranked: [],
          },
          models,
          task: "general",
          fetchedAt: aa.fetchedAt,
          baselineForecast: 0.004,
        }),
      },
      0.003,
    );
  }
  function finish(id, known = true) {
    ledger.finish(
      id,
      known
        ? {
            model: ledger.events.find((e) => e.id === id).apexRequested.model,
            input_tokens: 1000,
            output_tokens: 20,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          }
        : null,
      known ? 0.00104 : null,
      "complete",
      Date.now() + 100,
    );
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(server.url);
    await page.getByText("Connected to Claude host", { exact: true }).waitFor();
    assert.equal(
      await page.locator("#observed").textContent(),
      "Not yet observed",
    );
    await page.reload();
    await page.getByText("Connected to Claude host", { exact: true }).waitFor();
    await page.evaluate(() => {
      const e = document.createElement("div");
      e.textContent =
        "OFFLINE TEST · synthetic native bridge · no live inference";
      e.id = "test-label";
      e.style.position = "fixed";
      e.style.top = "0";
      e.style.left = "0";
      e.style.right = "0";
      e.style.zIndex = "30";
      e.style.background = "#634018";
      e.style.color = "#fff";
      e.style.textAlign = "center";
      e.style.font = "12px monospace";
      document.body.append(e);
    });
    const out = path.resolve("docs/screenshots");
    await fs.mkdir(out, { recursive: true });
    const shot = async (name) => {
      await page.locator("#toast").waitFor({ state: "hidden" });
      await page.screenshot({ path: path.join(out, name), fullPage: true });
    };
    await shot("dashboard-empty.png");
    begin("fixture-request", 0);
    await page
      .locator("#active-model")
      .getByText("fixture-alpha", { exact: true })
      .waitFor();
    await page.locator("#mode-toggle").click();
    await page.locator('[data-mode="sports"]').click();
    await page.getByText(/Saved to host · revision 1/).waitFor();
    assert.equal(control.mode, "sports");
    assert.equal(ledger.events[0].mode, "balanced");
    assert.equal(ledger.events[0].status, "streaming");
    await page
      .getByText("Sports saved · next main request", { exact: true })
      .first()
      .waitFor();
    await page.locator("#quality-once").click();
    await page.getByText(/Saved to host · revision 2/).waitFor();
    assert.ok(control.qualityOnce);
    begin("agent-request", 1, "agent-fixture");
    finish("agent-request");
    assert.ok(control.qualityOnce);
    begin("once-request", 2);
    finish("once-request", false);
    assert.equal(control.qualityOnce, null);
    assert.equal(control.mode, "sports");
    assert.equal(ledger.events.at(-1).mode, "quality");
    finish("fixture-request");
    await page
      .locator("#observed")
      .getByText("≈ $0.0021 · partial", { exact: true })
      .waitFor();
    await page.locator('[data-receipt="fixture-request"]').click();
    assert.equal(
      await page.locator("#selected-label").textContent(),
      "REQUEST 1 / RECEIPT",
    );
    const frozen = await page.locator("#evidence-facts").textContent();
    evidence[0].scores.general = 999;
    begin("later-request", 3);
    await page.locator('[data-receipt="later-request"]').waitFor();
    assert.equal(
      await page.locator("#selected-label").textContent(),
      "REQUEST 1 / RECEIPT",
    );
    assert.equal(await page.locator("#evidence-facts").textContent(), frozen);
    await page.locator("#follow").click();
    assert.equal(
      await page.locator("#selected-label").textContent(),
      "REQUEST 4 / RECEIPT",
    );
    await page.locator("#scope").selectOption("agent-fixture");
    assert.equal(
      await page.locator("#routing-status").textContent(),
      "Native agent settings",
    );
    assert.equal(await page.locator(".event-row").count(), 1);
    await page.locator("#scope").selectOption("main");
    await page.locator("#credits").click();
    await page.locator("#budget").fill("0");
    await page.locator("#allow").click();
    assert.equal(control.creditsConsent, false);
    await page.locator("#budget").fill("2.5");
    await page.locator("#allow").click();
    await page.getByText(/Saved to host · revision 3/).waitFor();
    assert.equal(control.budgetUsd, 2.5);
    assert.equal(
      await page.locator("#credit-dialog").evaluate((e) => e.open),
      false,
    );
    await page.locator("#settings").click();
    await page.locator("#backend").selectOption("subscription");
    await page.locator("#availability-list input").first().check();
    await page.locator("#availability-list input").nth(1).check();
    await page.locator("#confirm-models").click();
    await page.getByText(/Saved to host · revision 4/).waitFor();
    assert.equal(control.verifiedIds.length, 2);
    await page.locator("#runtime-id").selectOption("fixture-beta");
    await page.locator("#aa-slug").selectOption("fixture-beta");
    assert.equal(await page.locator("#map").isDisabled(), true);
    await page.locator("#effort").selectOption("high");
    assert.equal(await page.locator("#map").isDisabled(), false);
    await page.locator("#map").click();
    await page.getByText(/Saved to host · revision 5/).waitFor();
    assert.equal(control.mappings[0].effort, "high");
    assert.equal(await page.locator("#refresh").isDisabled(), true);
    await page.locator(".comparison summary").click();
    await shot("model-evidence.png");
    await page.locator("#task").selectOption("coding");
    await page.getByText(/Saved to host · revision 6/).waitFor();
    assert.equal(control.taskOverride, "coding");
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#settings-dialog").evaluate((e) => e.open),
      false,
    );
    assert.equal(
      await page
        .locator("#settings")
        .evaluate((e) => document.activeElement === e),
      true,
    );
    await page.locator("#auto").click();
    await page.getByText(/Saved to host · revision 7/).waitFor();
    assert.equal(control.routing, "manual_hold");
    await page.locator("#auto").click();
    await page.getByText(/Saved to host · revision 8/).waitFor();
    assert.equal(control.routing, "auto");
    await page.locator("#time-view").click();
    assert.equal(await page.locator("#timing svg").count(), 1);
    await page.locator("#sequence-view").click();
    await page.locator('[data-receipt="fixture-request"]').click();
    await shot("dashboard-receipt.png");
    await page.locator("#inspect-close").click();
    assert.equal(await page.locator("#inspector").isVisible(), false);
    await page.locator("#inspect").click();
    assert.equal(await page.locator("#inspector").isVisible(), true);
    const download = page.waitForEvent("download");
    await page.locator("#export").click();
    const d = await download;
    const exported = JSON.parse(await fs.readFile(await d.path(), "utf8"));
    assert.equal(exported.format, "apex-receipt-2");
    assert.ok(exported.events.some((e) => e.decisionSnapshot));
    await page.locator("#density").click();
    await shot("dashboard-compact.png");
    await page.locator("#density").click();
    await page.locator("#theme").click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
        "horizontal overflow at " + width,
      );
      await page.locator("#mode-toggle").click();
      const rect = await page.locator("#mode-menu").boundingBox();
      assert.ok(
        rect.x >= 0 && rect.x + rect.width <= width + 1,
        "mode menu overflow at " + width,
      );
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await shot("dashboard-mobile-light.png");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#theme").click();
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 720,
      height: 500,
      deviceScaleFactor: 1,
      mobile: false,
      scale: 1,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
      "200% viewport reflow",
    );
    await client.send("Emulation.clearDeviceMetricsOverride");
    for (let i = 0; i < 52; i++) {
      begin("history-" + i, i + 10);
      finish("history-" + i);
    }
    await page.locator("#older").waitFor({ state: "visible" });
    await page.waitForFunction(
      () => !document.getElementById("older").disabled,
    );
    await page.locator("#older").click();
    assert.ok(
      (await page.locator("#history-range").textContent()).includes("of 55"),
    );
    await page.locator("#newer").click();
    await page.locator("#settings").click();
    await page.locator("#aa-key").fill("offline-test-key");
    await page.locator("#connect-aa").click();
    await page.getByText(/Key held in companion memory/).waitFor();
    assert.equal(await page.locator("#aa-key").inputValue(), "");
    assert.equal(aaFetches, 0);
    assert.equal(
      await page.evaluate(async () =>
        JSON.stringify(await (await fetch("/api/state")).json()).includes(
          "offline-test-key",
        ),
      ),
      false,
    );
    await page.keyboard.press("Escape");
    await page.locator("#credits").click();
    await page.locator("#revoke").click();
    await page.getByText(/Saved to host · revision 9/).waitFor();
    assert.equal(control.creditsConsent, false);
    await page.keyboard.press("Escape");
    stopped = true;
    await pumping;
    await page
      .getByText("Host disconnected · last facts retained", { exact: true })
      .waitFor();
    assert.equal(await page.locator("#quality-once").isDisabled(), true);
    assert.equal(await page.locator("#mode-toggle").isDisabled(), true);
    const { nativePreview } = await import("../scripts/native-preview.mjs");
    const reference = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await reference.setContent(nativePreview());
    await reference.screenshot({
      path: path.join(out, "native-interface-reference.png"),
      fullPage: true,
    });
    await reference.close();
    assert.deepEqual(errors, []);
    console.log(
      "Browser: protected bridge, pending/consumed controls, history selection, scoped agents, one-shot, frozen receipts, setup, consent, export, timing, pagination, 5 widths, themes and disconnection passed. Fixtures only; no paid inference.",
    );
  } finally {
    stopped = true;
    await pumping;
    if (browser) await browser.close();
    await server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
