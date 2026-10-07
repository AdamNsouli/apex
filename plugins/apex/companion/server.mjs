import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdtemp, chmod, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import { fetchAAPages } from "../core/catalogue.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const safeEqual = (a, b) =>
  typeof a === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function createCompanion({
  aaKey = process.env.APEX_AA_API_KEY,
  fetcher = fetch,
} = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "apex-"));
  await chmod(dir, 0o700);
  const socketPath = path.join(dir, "bridge.sock"),
    token = randomBytes(32).toString("hex"),
    cookie = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  let state = {
      connected: false,
      control: null,
      events: [],
      runtime: [],
      catalogue: [],
      aa: null,
      hostVersion: null,
      accountBilling: "unknown",
    },
    pending = [],
    aa = null,
    refreshing = false,
    nextRefresh = 0,
    lastHeartbeat = Date.now(),
    aaStatus = "not_connected";
  const idempotent = new Map();
  let port;
  let stopped = false;
  const json = (res, status, data, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(data));
  };
  async function body(req, max = 8192) {
    let chunks = [],
      size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > max) throw new Error("body_too_large");
      chunks.push(c);
    }
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  }
  async function refresh() {
    if (refreshing) return;
    if (!aaKey) {
      aaStatus = "not_connected";
      return;
    }
    if (Date.now() < nextRefresh) {
      aaStatus = "rate_limited_or_cached";
      return;
    }
    refreshing = true;
    aaStatus = "loading";
    nextRefresh = Date.now() + 86400000;
    try {
      const r = await fetchAAPages(async (page) => {
        const response = await fetcher(
          "https://artificialanalysis.ai/api/v2/language/models/free?page=" +
            page,
          {
            headers: { "x-api-key": aaKey },
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          },
        );
        if (response.status === 429) {
          const retry = Number(response.headers.get("retry-after"));
          nextRefresh =
            Date.now() +
            (Number.isFinite(retry) && retry > 0 ? retry * 1000 : 86400000);
          throw new Error("rate_limit");
        }
        if (!response.ok) throw new Error("AA HTTP " + response.status);
        const text = await response.text();
        if (text.length > 10 * 1024 * 1024)
          throw new Error("AA response too large");
        return JSON.parse(text);
      });
      aa = {
        ...r,
        fetchedAt: Date.now(),
        source: "https://artificialanalysis.ai/data-api",
      };
      aaStatus = "connected";
    } catch (e) {
      aaStatus = "refresh_failed";
      nextRefresh = Math.max(nextRefresh, Date.now() + 60000);
    } finally {
      refreshing = false;
    }
  }
  const publicState = () => ({
    ...state,
    now: Date.now(),
    accountBilling: "unknown",
    connected: state.connected && Date.now() - lastHeartbeat < 6000,
    aaStatus,
    aa,
    nextRefreshAt: nextRefresh || state.nextRefreshAt || null,
    refreshBusy: refreshing || state.refreshBusy || false,
    lastHeartbeat,
    csrf: undefined,
  });
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  };
  const handler = (native) => async (req, res) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (native) {
        if (req.method !== "POST" || url.pathname !== "/native/sync")
          return json(res, 404, { error: "not_found" });
        const data = await body(req, 16 * 1024 * 1024);
        if (data.shutdown === true) {
          json(res, 200, { status: "closing" });
          setTimeout(() => void close(), 0);
          return;
        }
        if (data.state) {
          state = data.state;
          lastHeartbeat = Date.now();
          state.connected = true;
        }
        if (
          data.aa &&
          Array.isArray(data.aa.models) &&
          (!aa || data.aa.fetchedAt > aa.fetchedAt)
        ) {
          aa = data.aa;
          aaStatus = "connected";
          nextRefresh = Math.max(nextRefresh, aa.fetchedAt + 86400000);
        }
        const controls = pending;
        pending = [];
        return json(res, 200, { controls, aa, aaStatus });
      }
      if (req.headers.host !== `127.0.0.1:${port}`)
        return json(res, 403, { error: "host_rejected" });
      const origin = `http://127.0.0.1:${port}`;
      if (req.method === "POST" && req.headers.origin !== origin)
        return json(res, 403, { error: "origin_rejected" });
      if (req.method === "POST" && url.pathname === "/api/bootstrap") {
        const data = await body(req);
        if (!safeEqual(data.token, token))
          return json(res, 403, { error: "token_rejected" });
        return json(
          res,
          200,
          { csrf },
          { "Set-Cookie": `apex=${cookie}; HttpOnly; SameSite=Strict; Path=/` },
        );
      }
      const authed = req.headers.cookie
        ?.split(";")
        .some((x) => safeEqual(x.trim(), `apex=${cookie}`));
      if (url.pathname.startsWith("/api/")) {
        if (!authed)
          return json(res, 403, { error: "authentication_required" });
        if (
          req.method === "POST" &&
          !safeEqual(req.headers["x-apex-csrf"], csrf)
        )
          return json(res, 403, { error: "csrf_rejected" });
        if (req.method === "GET" && url.pathname === "/api/session")
          return json(res, 200, { csrf });
        if (req.method === "GET" && url.pathname === "/api/state")
          return json(res, 200, publicState());
        if (req.method === "GET" && url.pathname === "/api/export")
          return json(res, 200, {
            format: "apex-receipt-2",
            events: state.events,
            accountBilling: "unknown",
          });
        if (req.method === "POST" && url.pathname === "/api/credentials") {
          const data = await body(req);
          if (
            typeof data.aaKey !== "string" ||
            data.aaKey.length < 8 ||
            data.aaKey.length > 512
          )
            return json(res, 400, { error: "invalid_key" });
          aaKey = data.aaKey;
          // A key edit is not a bypass of the source cooldown.
          void refresh();
          return json(res, 202, {
            status: refreshing ? "refreshing" : "cached_or_rate_limited",
            storage: "memory_only",
          });
        }
        if (req.method === "POST" && url.pathname === "/api/refresh") {
          void refresh();
          return json(res, 202, {
            status: refreshing ? "refreshing" : "cached_or_rate_limited",
          });
        }
        if (req.method === "POST" && url.pathname === "/api/control") {
          if (!publicState().connected)
            return json(res, 503, { error: "host_disconnected" });
          const c = await body(req);
          if (
            typeof c.id !== "string" ||
            c.id.length > 100 ||
            !Number.isInteger(c.expectedRevision) ||
            ![
              "mode",
              "routing",
              "credits",
              "task",
              "availability",
              "mapping",
              "quality_once",
            ].includes(c.kind)
          )
            return json(res, 400, { error: "invalid_control" });
          if (idempotent.has(c.id)) return json(res, 202, idempotent.get(c.id));
          if (c.expectedRevision !== state.control?.revision)
            return json(res, 409, {
              error: "revision_conflict",
              revision: state.control?.revision,
            });
          if (pending.length >= 20)
            return json(res, 429, { error: "control_queue_full" });
          pending.push(c);
          const reply = { status: "pending_host_ack", id: c.id };
          idempotent.set(c.id, reply);
          if (idempotent.size > 1024)
            idempotent.delete(idempotent.keys().next().value);
          return json(res, 202, reply);
        }
        return json(res, 404, { error: "not_found" });
      }
      const files = {
        "/": "index.html",
        "/index.html": "index.html",
        "/app.js": "app.js",
        "/style.css": "style.css",
        "/tokens.css": "tokens.css",
        "/mode-glyphs.svg": "mode-glyphs.svg",
        "/presentation.mjs": "../core/presentation.mjs",
        "/receipt.mjs": "../core/receipt.mjs",
        "/assets/marks.svg": "assets/marks.svg",
        "/assets/apex-mark.svg": "assets/apex-mark.svg",
        "/assets/kavren-mark.svg": "assets/kavren-mark.svg",
        "/assets/inter.ttf": "assets/inter.ttf",
        "/assets/space-grotesk.ttf": "assets/space-grotesk.ttf",
        "/assets/jetbrains-mono.ttf": "assets/jetbrains-mono.ttf",
      };
      const file = files[url.pathname];
      if (req.method !== "GET" || !file)
        return json(res, 404, { error: "not_found" });
      const content = await readFile(path.join(root, "web", file));
      res.writeHead(200, {
        "Content-Type": file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".ttf")
              ? "font/ttf"
              : file.endsWith(".svg")
                ? "image/svg+xml"
                : "text/javascript",
      });
      res.end(content);
    } catch (e) {
      json(res, e.message === "body_too_large" ? 413 : 400, {
        error:
          e.message === "body_too_large" ? "body_too_large" : "invalid_request",
      });
    }
  };
  const tcp = http.createServer(handler(false)),
    uds = http.createServer(handler(true));
  await new Promise((resolve) => tcp.listen(0, "127.0.0.1", resolve));
  port = tcp.address().port;
  await new Promise((resolve) => uds.listen(socketPath, resolve));
  await chmod(socketPath, 0o600);
  const timer = setInterval(() => {
    if (!refreshing && Date.now() >= nextRefresh) void refresh();
    if (Date.now() - lastHeartbeat > 600000) void close();
  }, 30000);
  timer.unref();
  async function close() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    await Promise.all([
      new Promise((r) => tcp.close(r)),
      new Promise((r) => uds.close(r)),
    ]);
  }
  return { socketPath, url: `http://127.0.0.1:${port}/#${token}`, close };
}
if (process.argv[2] === "start") {
  const child = fork(fileURLToPath(import.meta.url), ["serve"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: process.env,
  });
  child.once("message", (descriptor) => {
    process.stdout.write(JSON.stringify(descriptor));
    child.disconnect();
    child.unref();
  });
  const timer = setTimeout(() => {
    child.kill();
    process.exit(1);
  }, 8000);
  timer.unref();
} else if (process.argv[2] === "serve") {
  const server = await createCompanion();
  process.send?.({ socketPath: server.socketPath, url: server.url });
}
