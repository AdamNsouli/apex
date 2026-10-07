# APEX interface specification — 0.3.0-beta.1

The distinguishing object is the route through a task. Information geometry follows recorded events; decoration cannot invent progress, work plans, task success, savings or parent relationships. Product identity is APEX; publisher identity is APEX by Kavren Labs. The Kavren glyph appears only in About/setup and publishing material.

## Browser visual contract

Authoritative tokens: `plugins/apex/web/tokens.css`. Dark background #0B0C10, surface #12141A, secondary surface #191C24, borders #232733/#303645, text #E9EBF1/#9BA3B5. Blue #5B8CFF means selection or action; green #3ECF8E, amber #E8A33D and red #F07370 mean readiness, attention and failure. Modes do not have separate colors. Light theme uses #F4F5F8/#FFFFFF, dark text #1B202B/#525D70 and darker semantic accents.

Space Grotesk is the display face, Inter the reading face and JetBrains Mono the data face. All are local licensed assets. Reading text is 15px; compact metadata does not fall below 12px. Workspace heading is 24px and receipt heading 28px, reducing to 24px at intermediate widths. Focus rings are 2px with a 3px offset. Controls are at least 40px; coarse-pointer controls are at least 44px. Reduced motion removes transitions and smooth scrolling.

The command bar owns identity, scope, connection, a single mode selector, Credits, Settings and Export. The session line owns current pair/requested effort and readiness. One state line prioritizes pending intent, then its blocking reason. There are no KPI cards, colored mode cards or permanent setup sidebar.

At 1280px+ the inspector is 360px; 960–1279px it is 320px. Below 960px it stacks. On wide layouts the inspector scrolls independently with a sticky position and bounded viewport height. Compact view limits the workspace to 720px and stacks the inspector. At 600px and below history geometry shrinks from 72px to 48px and status is retained in row metadata.

History is chronological, 50 events per page. A model/effort change bends the connecting line; retaining the same pair keeps it straight. Completed requests use hollow nodes, active requests filled nodes, tools squares and errors diamonds. Tools have no inferred parent connector. Time view is disabled until completion timestamps exist; it uses only recorded durations and known main/agent IDs. Sequence remains an accessible alternate list.

Selection survives polling and new events. Follow live explicitly selects the active/latest event. Scoped agents retain native settings. Inspection compares native, outgoing and response-reported model, says effective effort is unreported, explains the guard/decision and shows evidence frozen at dispatch. JSON is secondary, behind an explicit action. Costs distinguish token forecast, observed API-equivalent, AA benchmark USD/task and unknown account charge. Older receipts without snapshots do not borrow current evidence.

Settings is a native browser dialog with four guided steps: Host → Evidence → Access → Routing. It has a masked memory-only AA key field, real refresh cooldown, discovered model checkboxes, exact variant/effort selectors and task override. Consent uses a separate dialog with positive finite budget validation. Escape/focus restoration use the browser dialog contract. Mode menus clamp to the viewport; ordinary polls do not overwrite setup drafts.

## Native contract

The rail requests 34 body columns, displays current pair and controls before history, shows up to three recent requests and opens the integrated inspector. It does not force composer focus. The host owns its placement, full height, typography and scrolling. The prompt strip has at most two rows at rest, yields to native surveys, preserves other mods and suppresses duplicate docked controls. Narrow widths abbreviate High Quality to Quality where necessary.

Every actionable control routes to real host or local state. Unavailable actions are disabled in the browser and noninteractive dim text in the native SDK. No UI exploration calls a model. Acknowledgment and main-request consumption are separate; current streams are never restarted.

Verification and known limits live in Release_Results.md. This specification describes shipped behavior; the original creation pack is retained only as historical design material.
