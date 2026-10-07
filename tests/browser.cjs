const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const { createCompanion } =
    await import("../plugins/apex/companion/server.mjs");
  const { initialControl, applyControl, Ledger } =
    await import("../plugins/apex/core/router.mjs");
  const { joinCatalogue } = await import("../plugins/apex/core/catalogue.mjs");
  const server = await createCompanion({ aaKey: null });
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
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    console.log("Browser launched");
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
    console.log("Dashboard loaded");
    await page.getByText("Connected to Claude host", { exact: true }).waitFor();
    console.log("Dashboard connected");
    assert.equal(
      await page.locator("#observed").textContent(),
      "Not yet observed",
    );
    await page.reload();
    await page.getByText("Connected to Claude host", { exact: true }).waitFor();
    // Mark test captures explicitly: this bridge feeds synthetic fixtures, while
    // separate claude plugin test exercises the actual native middleware.
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.textContent =
        "OFFLINE TEST · synthetic native bridge · no live inference";
      el.setAttribute("id", "test-label");
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:30;background:#634018;color:#fff;text-align:center;font:11px monospace;padding:3px";
      document.body.append(el);
    });
    const out = path.resolve("docs/screenshots");
    await fs.mkdir(out, { recursive: true });
    await page.screenshot({
      path: path.join(out, "dashboard-empty.png"),
      fullPage: true,
    });
    ledger.begin(
      "fixture-request",
      {
        turnId: "fixture",
        step: 0,
        mode: "balanced",
        revision: 0,
        task: "general",
        risk: "normal",
        apexRequested: { model: "fixture-alpha", effort: "high" },
        reason: "fixture",
      },
      0.003,
    );
    await page
      .locator("#active-model")
      .getByText("fixture-alpha", { exact: true })
      .waitFor();
    await page.getByRole("radio", { name: /Sports/ }).click();
    await page.getByText(/Applied · revision 1/).waitFor();
    assert.equal(control.mode, "sports");
    assert.equal(ledger.events[0].mode, "balanced");
    assert.equal(ledger.events[0].status, "streaming");
    await page
      .getByRole("button", { name: "Allow credits", exact: true })
      .click();
    await page.locator("#budget").fill("2");
    await page
      .getByRole("button", {
        name: "Allow within estimate budget",
        exact: true,
      })
      .click();
    await page.getByText(/Applied · revision 2/).waitFor();
    assert.equal(control.creditsConsent, true);
    assert.equal(control.budgetUsd, 2);
    await page.getByRole("button", { name: "Models", exact: true }).click();
    await page.locator("#availability-list input").first().check();
    await page.locator("#availability-list input").nth(1).check();
    await page
      .getByRole("button", { name: "Confirm selected models", exact: true })
      .click();
    await page.getByText(/Applied · revision 3/).waitFor();
    assert.equal(control.verifiedIds.length, 2);
    await page.locator("#runtime-id").selectOption("fixture-beta");
    await page.locator("#aa-slug").selectOption("fixture-beta");
    await page
      .getByRole("button", { name: "Save verified mapping", exact: true })
      .click();
    await page.getByText(/Applied · revision 4/).waitFor();
    assert.equal(control.mappings[0].runtimeId, "fixture-beta");
    await page.screenshot({
      path: path.join(out, "model-evidence.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    ledger.finish(
      "fixture-request",
      {
        model: "fixture-alpha",
        input_tokens: 1000,
        output_tokens: 20,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      0.00104,
    );
    await page
      .locator("#observed")
      .getByText("≈ $0.0010", { exact: true })
      .waitFor();
    await page
      .getByRole("button", {
        name: "Inspect evidence & tradeoffs",
        exact: true,
      })
      .click();
    assert.ok(
      (await page.locator("#receipt-json").textContent()).includes(
        "fixture-alpha",
      ),
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#evidence-dialog").isVisible(), false);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export receipt", exact: true })
      .click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "apex-receipts.json");
    await page.screenshot({
      path: path.join(out, "dashboard-receipt.png"),
      fullPage: true,
    });
    for (const width of [1440, 980, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ["Overview", "Timeline", "Models", "Settings"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        const sizes = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth,
          view: innerWidth,
        }));
        assert.ok(
          sizes.doc <= sizes.view,
          `${view} overflow at ${width}: ${JSON.stringify(sizes)}`,
        );
      }
    }
    await page
      .getByRole("button", { name: "Use light theme", exact: true })
      .click();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page.screenshot({
      path: path.join(out, "dashboard-mobile-light.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    stopped = true;
    await pumping;
    await new Promise((r) => setTimeout(r, 7200));
    await page
      .getByText("Host disconnected · last facts retained", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("radio", { name: /Sports/ }).isDisabled(),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Browser passed: live transport + host acknowledgments, in-flight mode preservation, credit consent, availability/mapping, receipts/export, 16 responsive views, light theme and disconnect. Synthetic fixture; no provider inference.",
    );
  } finally {
    stopped = true;
    console.log("Closing browser test");
    await pumping;
    await browser?.close();
    await server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
