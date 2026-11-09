// Every setting APEX can change travels through up to five places: the defaults and
// the change handler (core/router.mjs), the /apex command (hooks/register.mjs), the
// companion's allowed list (companion/server.mjs) and the web page (web/app.js).
// A setting added in one place and forgotten in another fails quietly at run time,
// so each one is declared here and checked against the source by `npm run check`.
//
// command   register.mjs sends a `kind: "<name>"` change (the /apex verb or the dock)
// web       app.js posts `kind: "<name>"` to the companion
// companion the companion accepts `<name>` from the web page
// A web control without the companion's permission could never work, so it fails.
export const WIRING = {
  mode: {
    key: "mode",
    verb: "mode",
    command: true,
    web: true,
    companion: true,
  },
  quality_once: {
    key: "qualityOnce",
    command: true,
    web: true,
    companion: true,
  },
  routing: {
    key: "routing",
    verb: "auto",
    command: true,
    web: true,
    companion: true,
  },
  credits: {
    key: "creditsConsent",
    verb: "credits",
    command: true,
    web: true,
    companion: true,
  },
  task: { key: "taskOverride", command: true, web: true, companion: true },
  availability: {
    key: "verifiedIds",
    verb: "confirm-models",
    command: true,
    web: true,
    companion: true,
  },
  mapping: {
    key: "mappings",
    verb: "map-efforts",
    command: true,
    web: true,
    companion: true,
  },
  // Command-only on purpose: no web control yet.
  ultracode: {
    key: "ultracode",
    verb: "ultracode",
    command: true,
    web: false,
    companion: false,
  },
  agents: {
    key: "agents",
    verb: "agents",
    command: true,
    web: false,
    companion: false,
  },
};

const kindsIn = (text) =>
  new Set([...text.matchAll(/kind:\s*"([a-z_]+)"/g)].map((m) => m[1]));

export function checkWiring({
  router,
  register,
  app,
  companion,
  defaults,
  wiring = WIRING,
}) {
  const problems = [];
  const handled = new Set(
    [...router.matchAll(/c\.kind === "([a-z_]+)"/g)].map((m) => m[1]),
  );
  const allowed = new Set();
  const list = /\[([^\]]*)\]\.includes\(c\.kind\)/.exec(companion);
  if (!list) problems.push("companion: allowed-kind list not found");
  else for (const m of list[1].matchAll(/"([a-z_]+)"/g)) allowed.add(m[1]);
  const inRegister = kindsIn(register);
  const inApp = kindsIn(app);
  const hint = /argumentHint:\s*"([^"]*)"/.exec(register)?.[1] ?? "";
  for (const k of handled)
    if (!wiring[k])
      problems.push(
        `${k}: handled in core/router.mjs but not declared in scripts/settings-wiring.mjs`,
      );
  for (const k of Object.keys(wiring))
    if (!handled.has(k))
      problems.push(`${k}: declared but not handled in core/router.mjs`);
  for (const [k, w] of Object.entries(wiring)) {
    if (!(w.key in defaults))
      problems.push(`${k}: default "${w.key}" missing from initialControl()`);
    if (w.command !== inRegister.has(k))
      problems.push(
        `${k}: command ${w.command ? "missing from" : "unexpectedly in"} hooks/register.mjs`,
      );
    if (w.web !== inApp.has(k))
      problems.push(
        `${k}: web control ${w.web ? "missing from" : "unexpectedly in"} web/app.js`,
      );
    if (w.companion !== allowed.has(k))
      problems.push(
        `${k}: companion list ${w.companion ? "missing" : "unexpectedly has"} it`,
      );
    if (w.web && !w.companion)
      problems.push(`${k}: web page posts it but the companion would refuse`);
    if (w.verb && w.command && !hint.includes(w.verb))
      problems.push(`${k}: /apex help text does not mention "${w.verb}"`);
  }
  for (const k of allowed)
    if (!wiring[k])
      problems.push(`${k}: allowed by the companion but not declared`);
  return problems;
}
