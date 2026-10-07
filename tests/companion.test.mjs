import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createCompanion } from "../plugins/apex/companion/server.mjs";
const native = (socketPath, state) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path: "/native/sync", method: "POST" },
      (r) => {
        let text = "";
        r.on("data", (d) => (text += d));
        r.on("end", () => resolve(JSON.parse(text)));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify({ state }));
  });
test("loopback authentication, origin, CSRF and actual queued control transport", async () => {
  const server = await createCompanion({ aaKey: null });
  try {
    const url = new URL(server.url),
      base = url.origin,
      token = url.hash.slice(1);
    assert.equal((await fetch(base + "/api/state")).status, 403);
    assert.equal(
      (
        await fetch(base + "/api/bootstrap", {
          method: "POST",
          headers: { Origin: "http://evil.example" },
          body: JSON.stringify({ token }),
        })
      ).status,
      403,
    );
    const boot = await fetch(base + "/api/bootstrap", {
      method: "POST",
      headers: { Origin: base },
      body: JSON.stringify({ token }),
    });
    assert.equal(boot.status, 200);
    const cookie = boot.headers.get("set-cookie").split(";")[0],
      { csrf } = await boot.json();
    await native(server.socketPath, {
      control: { revision: 0 },
      events: [],
      runtime: [],
      catalogue: [],
    });
    const headers = { Origin: base, Cookie: cookie, "X-Apex-Csrf": csrf };
    assert.equal(
      (
        await fetch(base + "/api/control", {
          method: "POST",
          headers: { Origin: base, Cookie: cookie },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/control", {
          method: "POST",
          headers,
          body: JSON.stringify({ id: "a", expectedRevision: 0, kind: "exec" }),
        })
      ).status,
      400,
    );
    const control = {
      id: "mode-1",
      expectedRevision: 0,
      kind: "mode",
      mode: "sports",
    };
    assert.equal(
      (
        await fetch(base + "/api/control", {
          method: "POST",
          headers,
          body: JSON.stringify(control),
        })
      ).status,
      202,
    );
    const queue = await native(server.socketPath, {
      control: { revision: 0 },
      events: [],
      runtime: [],
      catalogue: [],
    });
    assert.equal(queue.controls[0].mode, "sports");
    await native(server.socketPath, {
      control: { revision: 1, mode: "sports" },
      events: [],
      runtime: [],
      catalogue: [],
      controlAcks: [{ id: "mode-1", status: "applied" }],
    });
    const state = await (
      await fetch(base + "/api/state", { headers: { Cookie: cookie } })
    ).json();
    assert.equal(state.control.mode, "sports");
    assert.equal(state.control.revision, 1);
    assert.equal(state.accountBilling, "unknown");
    assert.equal(state.token, undefined);
    assert.equal(
      (
        await fetch(base + "/api/control", {
          method: "POST",
          headers,
          body: JSON.stringify({ ...control, id: "old" }),
        })
      ).status,
      409,
    );
    assert.equal((await fetch(base + "/../../etc/passwd")).status, 404);
  } finally {
    await server.close();
  }
});
test("detached dashboard starter exits and its private bridge can shut down cleanly", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(
        new URL("../plugins/apex/companion/server.mjs", import.meta.url),
      ),
      "start",
    ],
    { timeout: 10000, env: { ...process.env, APEX_AA_API_KEY: "" } },
  );
  const descriptor = JSON.parse(stdout);
  assert.match(descriptor.url, /^http:\/\/127\.0\.0\.1:\d+\/#/);
  const reply = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: descriptor.socketPath,
        path: "/native/sync",
        method: "POST",
      },
      (r) => {
        let text = "";
        r.on("data", (d) => (text += d));
        r.on("end", () => resolve(JSON.parse(text)));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify({ shutdown: true }));
  });
  assert.equal(reply.status, "closing");
});
