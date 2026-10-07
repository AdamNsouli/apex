# APEX — Claude Code creation pack

Prepared 7 October 2026. **Deliverable: researched implementation brief, executable routing reference, UI prototype, screenshots and original assets. The actual Claude Code mod has not been built or tested against a live account.** APEX is a working name; availability has not been checked.

APEX is a native Claude Code mod implemented as a plugin with function hooks. It changes the main outgoing request's model and effort through `turn.step`, records what actually happened, and provides live controls in a native pane and an optional local browser dashboard. A skill or ordinary prompt alone cannot perform those changes.

## Use this pack

1. Give Claude Code this entire directory in a new repository; paste [One_Shot_Build_Prompt.md](./One_Shot_Build_Prompt.md). It directs Claude to build, verify and repair in that same run.
2. Preview [the interactive UI](./visuals/Apex_UI_Prototype.html). Every displayed number is synthetic design data, explicitly labelled. The screenshots are visual references, not evidence of a working mod.
3. Review its produced verification report before installing or publishing. Paid inference tests, account setup and data rights require real credentials/authorization; a prompt cannot supply those.

The UI and algorithm choices are specified. External APIs and account permissions cannot be guaranteed by a specification. “One shot” means one complete build instruction with a repair loop, not a promise of a defect-free first attempt. No claim of world's-best quality or proven savings is made.

## Fixed product choices

- **Balanced** by default. Eco trades quality above a floor for lower estimated expense. High Quality prioritizes task evidence. **Sports** means high performance for hard work: near-best evidence with faster completion, cost secondary inside a user cap. This interpretation was used because no alternate meaning was supplied.
- Native pane plus local browser dashboard. Mode changes apply to the **next unsent request**, including during an active turn. The current streaming request keeps its submitted settings.
- Artificial Analysis supplies benchmark and pricing evidence. Anthropic supplies runtime capabilities; the host/account supplies actual availability. These are separate sources.
- No paid classifier dependency, credential scraping, proxy dependency, auto top-up, telemetry collection, fake progress percentage, or bundled third-party benchmark dataset.
- Mode selection is automatic routing, not proof of correctness. High-risk and unknown tasks cannot silently be downgraded. Native manual model/effort choices take precedence until Auto is explicitly resumed.

## Important source constraints

[Artificial Analysis's Data API](https://artificialanalysis.ai/data-api) requires attribution and restricts redistribution by tier. The published source must contain code and synthetic fixtures only. Connect each user's own key for permitted personal/local use; obtain the applicable rights before offering externally redistributed data or a hosted product. BYOK alone is not proof of redistribution rights.

Its benchmark cost/task is not your task's bill. The UI separates AA benchmark cost/task, forecast API-equivalent cost, observed API-equivalent cost and account-reported billed credits. Unknown values remain unknown.

[Claude's usage-credit command](https://code.claude.com/docs/en/commands) opens account billing. The mod's Allow credits control grants local routing consent; it does not secretly turn on account billing. If entitlement or charging is unknown, the mod cannot claim billing is enabled or a strict billed-dollar cap is guaranteed.

## Contents

- [Product_And_UI_Spec.md](./Product_And_UI_Spec.md): exact appearance and behavior, including loading/error/mobile/native states.
- [Routing_And_Data_Spec.md](./Routing_And_Data_Spec.md): refresh, task evidence, deterministic policy, cost accounting and controls.
- [Architecture_And_Test_Spec.md](./Architecture_And_Test_Spec.md): hook integration, process boundaries, tests and publication gate.
- [research/Research_Findings.md](./research/Research_Findings.md): catalogue screening and source comparisons.
- [contracts/](./contracts/_index.md): types, config, fictional fixtures and executable routing reference.
- [assets/](./assets/_index.md): generated decorative atlas and precise vector state sprites.
- [visuals/](./visuals/_index.md): functional design prototype and screen images.

Research screened all **2,685 listings** in one public catalogue dated 6 October, yielding **374 keyword matches**. This is not every mod ever published, nor a source audit or runtime test of all 2,685. Relevant repositories and primary APIs were examined separately; the inventory retains screening evidence.
