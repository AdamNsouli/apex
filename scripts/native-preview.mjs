// Screenshot reference from the shipped primitive tree, not a terminal capture.
import { dock, pane } from "../plugins/apex/hooks/interface.mjs";
import { initialControl } from "../plugins/apex/core/router.mjs";
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const elements = Object.fromEntries(
  ["Box", "Text", "Button", "Input", "Select"].map((type) => [
    type,
    (props) => ({ type, props }),
  ]),
);
function html(node) {
  if (!node) return "";
  const p = node.props;
  if (node.type === "Text")
    return `<div class="text" style="color:${p.color ?? "inherit"};font-weight:${p.bold ? 700 : 400}">${escape(p.children)}</div>`;
  if (node.type === "Button")
    return `<span class="native-button">${p.hotkey ? `<b>${escape(p.hotkey)}:</b> ` : ""}${escape(p.label)}</span>`;
  if (node.type === "Input")
    return `<div>${escape(p.label)}: <span class="input">${escape(p.value || p.placeholder)}</span></div>`;
  if (node.type === "Select")
    return `<div>${escape(p.label)}: ${escape(p.value)}</div>`;
  return `<div class="box" style="flex-direction:${p.flexDirection ?? "row"};flex-wrap:${p.flexWrap ?? "nowrap"};gap:${p.gap ?? p.rowGap ?? 0}em ${p.gap ?? p.columnGap ?? 0}ch;padding:${p.padding ?? p.paddingY ?? 0}em ${p.padding ?? p.paddingX ?? 0}ch">${(p.children ?? []).map(html).join("")}</div>`;
}
export function nativePreview() {
  const control = {
    ...initialControl(),
    mode: "sports",
    revision: 2,
    backend: "subscription",
    verifiedIds: ["fixture-alpha", "fixture-beta"],
  };
  const events = [
    {
      id: "r0",
      sequence: 1,
      step: 0,
      kind: "request",
      mode: "balanced",
      revision: 0,
      task: "agentic_coding",
      risk: "normal",
      original: { model: "fixture-alpha", effort: "high" },
      apexRequested: { model: "fixture-beta", effort: "high" },
      responseModel: "fixture-beta",
      status: "complete",
      observedUsd: 0.00104,
      reason: "balanced_utility",
    },
    {
      id: "tool-1",
      sequence: 2,
      kind: "tool",
      tool: "Bash",
      status: "complete",
    },
    {
      id: "r1",
      sequence: 3,
      step: 1,
      kind: "request",
      mode: "balanced",
      revision: 1,
      task: "agentic_coding",
      risk: "normal",
      original: { model: "fixture-alpha", effort: "high" },
      apexRequested: { model: "fixture-beta", effort: "high" },
      status: "streaming",
      observedUsd: null,
      estimateUsd: 0.003,
      reason: "balanced_utility",
    },
  ];
  const state = {
    control,
    events,
    ui: {
      dock: "expanded",
      tab: "live",
      selectedId: null,
      notice: "",
      budget: "",
      backend: "subscription",
      ids: "fixture-alpha fixture-beta",
    },
    cost: {
      observedApiEquivalentUsd: 0.00104,
      reservedApiEquivalentUsd: 0.003,
      unknownCostRequests: 0,
    },
    aaStatus: "connected",
    catalogue: [],
    intent: { task: "agentic_coding" },
    hostVersion: "2.1.292",
  };
  const actions = new Proxy({}, { get: () => () => {} });
  const dockTree = dock(
    elements,
    { bodyColumns: 75, maxRows: 4, view: {} },
    state,
    actions,
  );
  const paneTree = pane(elements, { bodyColumns: 72 }, state, actions);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>APEX native interface reference</title><style>
  *{box-sizing:border-box}body{margin:0;padding:40px;background:#0B0C10;color:#E9EBF1;font:15px/1.6 system-ui}h1{font-weight:550;letter-spacing:-1px;font-size:30px;margin:0}p{color:#9BA3B5;margin:8px 0 24px;font-size:14px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:1.5px;color:#E8A33D;margin-bottom:10px}.window{border:1px solid #303645;border-radius:10px;overflow:hidden;background:#101218}.chrome{border-bottom:1px solid #232733;padding:14px 24px;font:12px ui-monospace,monospace;color:#9BA3B5;display:flex;justify-content:space-between}.workspace{display:grid;grid-template-columns:1fr 640px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.conversation{padding:24px;display:flex;flex-direction:column;min-width:0}.pane{border-left:1px solid #303645;padding:12px;max-height:1050px;overflow:hidden}.box{display:flex;min-width:0}.text{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}.native-button{color:#E9EBF1;white-space:nowrap}.native-button b{color:#5B8CFF;font-weight:400}.muted{color:#9BA3B5}.transcript{flex:1;border:1px dashed #303645;color:#858EA1;padding:24px;min-height:260px}.transcript strong{color:#9BA3B5;font-weight:400}.dock{margin-top:32px;padding:16px 0;border-top:1px solid #303645}.composer{border-top:1px solid #303645;border-bottom:1px solid #303645;padding:18px 0;margin-top:16px;color:#858EA1}.footnote{color:#858EA1;font-size:12px;margin-top:20px}.tag{color:#5B8CFF}
  </style><div class="eyebrow">VISUAL REFERENCE / SYNTHETIC FIXTURE / NO LIVE INFERENCE</div><h1>Built into the work.</h1><p>The prompt dock and native inspector use Claude Code's public UI primitives. This image renders the shipped component tree; it is not a live terminal screenshot.</p><div class="window"><div class="chrome"><span>CLAUDE CODE · NATIVE TERMINAL LAYOUT REFERENCE</span><span>APEX INSPECTOR / LIVE</span></div><div class="workspace"><div class="conversation"><div class="transcript"><strong>Claude's conversation occupies this area.</strong><br><br>APEX keeps the host transcript and prompt intact.<br>Routing receipts collect request metadata and tool names.<br><br><span class="tag">Synthetic state shown:</span><br>One completed request, a completed tool and one stream.<br>Sports mode is queued for the next request.<br><br>The inspector docks beside the conversation on wide<br>fullscreen terminals, and above the prompt when narrow.</div><div class="dock">${html(dockTree)}</div><div class="composer">› Claude prompt input</div><div class="muted">Focus the dock: ctrl+x tab · Inspect: i · Modes: e b q s</div></div><div class="pane">${html(paneTree)}</div></div></div><div class="footnote">Colors and layout tokens match the renderer. Actual fonts, button chrome, scrolling and pane placement are controlled by the Claude host and terminal.</div></html>`;
}
