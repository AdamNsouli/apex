# What is verified in this pack

This pack is a creation brief, executable scoring reference and design prototype. It is **not an implemented Claude Code mod**.

| Work | Status | Evidence |
|---|---|---|
|Public catalogue relevance screening|PASS|2,685 rows parsed;374 matches; source hash/inventory in research.|
|Main request mod API source check|PASS|Public declarations and official docs; prior Jev release0.8.11 actual forwarding source.|
|Pure scoring reference|PASS|10 Node tests; task quality/missing cost/versions/ties/Sports tradeoff.|
|Prototype browser interactions|PASS|See visuals/Prototype_Checks.json; simulated revision, hold, consent, navigation, dialog, responsive/connection states.|
|UI screen captures|PASS|12 images rendered from supplied HTML in Chromium, desktop/mobile/native pane and state previews.|
|Original sprites|PASS|Vector assets + intact generated transparent raster; provenance and dimensions recorded.|
|All creation requirements fully implemented|NOT RUN|Future build using supplied prompt and contracts.|
|Actual Claude account model/effort switching|NOT RUN|No mod installed or account inference performed.|
|Real AA authenticated ingestion|NOT RUN|No AA key supplied; no real dataset included.|
|Actual credits/billing controls|NOT RUN|No account/billing change or charged request.|
|Production security/a11y/native surface tests|NOT RUN|Specified for the future implementation; prototype tests are not a security or WCAG certification.|
|Measured quality/savings|NOT RUN|No representative paired task evaluation; utility weights are hypotheses.|
|Publication|NOT RUN|Nothing uploaded; data rights depend on actual intended distribution.|

## Recheck the pack

Pure reference: `node --test contracts/Routing_Reference.test.mjs` from this directory. The reference intentionally covers scoring only; host/risk/manual/cache/budget gates are specified separately and must be integration-tested in the actual mod.

UI: install Playwright in an isolated development environment, install its Chromium browser, then run `node visuals/Render_And_Check.cjs`. It only opens local design HTML, writes PNGs and a synthetic check report; it sends no model requests. In this session bundled Node/Playwright and an isolated browser cache under `/private/tmp` were used. macOS required running the browser process outside the shell sandbox; no changes were made to Claude settings.

Images are visual references. The native pane screenshot is an HTML rendition of the intended native layout, not a captured installed Claude plugin. Mobile reference is a browser companion design; native Claude surfaces may have different host constraints.

## Remaining external prerequisites

The builder needs a supported installed Claude Code/mod API for native verification, exact account availability evidence for alternate models, each user's appropriate AA access, explicit inference-test authorization/budget and publication approval. Data redistribution terms must fit the final product. These cannot be supplied by more elaborate prompting.

Give Claude the entire extracted directory plus One_Shot_Build_Prompt.md; the prompt instructs it to build and repair within one run, generate its own real verification matrix, and deliver a draft release if tests remain unavailable. Do not accept “it works” based on this pack's example screenshots.
