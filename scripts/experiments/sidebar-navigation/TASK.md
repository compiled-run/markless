# Sidebar SPA navigation

Additional direct user request: diagnose and fix rapid Select trigger toggling. Scope: packages/headless/components/src/select/select.tsrx, select-types.ts, select.browser.ts. Verify: failing rapid pointer-toggle browser regression, passing full Select browser suite, root pnpm run typecheck, website checks and live Select gestures. Workflow guidance: .ruler/skills/markless-implementation/implementation.md. The trigger currently suppresses distinct clicks for 300 ms after an own-trigger dismissal.

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/bundler.md

Direct user request: sidebar navigation should use the Markless router and Navigation API instead of full document loads. Scope: website/components/docs/sidebar.tsrx, website/boxes/sidebar-spa.box.ts, scripts/experiments/sidebar-navigation/**. Preserve other work, including the cold-start compiler fix. Expand framework scope only if real browser evidence exposes a second fault.

Observed before editing: sidebar anchors lack data-markless-router-link; clicking Your first app makes a second document request. Sidebar source uses native anchors and does not import Link. Use the existing public Link export; no eager router loading or broad native-link interception.

Verify: failing Witness website navigation check; passing browser navigation, destination interactivity, home and history traversal; root pnpm run typecheck; website Markless-aware typecheck and website tests, recording pre-existing failures. Existing router Link/SPA tests and router-dev-spa Witness box if framework behavior is implicated.

Framework scope added after browser failure: packages/router/src/vite/anchor-transform.ts, packages/router/test/vite/anchor-transform.test.ts, packages/router/src/link-attributes.ts, packages/router/src/index.ts, packages/router/src/spa-navigation.ts, packages/router/src/vite/runtime/create-server-entry.ts. A Link inside the sidebar list refuses dynamic class/href during client render-data linking (MARKLESS_ARTIFACT_CHILD_PROP_NOT_BUILD_KNOWN). Lower directly imported router Link markup to native anchors in TSRX using router-owned marker constants, retaining typed route processing and navigation options. Preserve legacy delegate handling for unsupported spread forms. No changes to generic delegate semantics or eager navigation bootstrap.

Additional consuming-path scope: website/nav.ts (typed link destinations), packages/compiler/src/passes/public-render/residue-reader.ts and packages/compiler/test/client-residue-locals.test.ts. Website SPA exposed an unbound component-local `label` in Mascot's generated reader. Preserve required component const initializers and dependencies in that reader, once per component render, without running component bodies. Workflow guidance also includes .ruler/skills/markless-implementation/compiler.md. Link's generated-route props must retain native attributes/children; source consumers must see the router's Navigation API declarations.

Follow-on browser evidence: authored repeat collections render empty in the client evaluator, and website highlighting discards MDX elementTags. Extend scope to packages/web/src/prerender/evaluator.ts, packages/web/src/ssr-data/renderer.ts, website/tooling/highlight-code.ts, website/tooling/highlight-mdx.ts and focused tests. Also update packages/router/test/navigation-chunk.test.ts for the native Link output contract.

Destination interaction exposes missing child storage metadata in generic state composition; scope includes packages/web/src/fns/composition.ts and packages/web/test/composed-page-space.test.ts. SPA also replaces the document body, discarding the server document shell; investigate packages/router/src/route-renderer.ts and its browser witnesses before changing the mount boundary.

The website Witness failed because navigation removed .site-header. Add packages/router/src/route-dom.ts and packages/router/test/route-renderer.test.ts: replace the served route container in place, then replace the current client root on subsequent navigation. Retain the existing shell.

UI navigation reproduces URL-only changes: AnatomyTable state initializer references a component-local derived model missing from its initializer symbol. Extend compiler scope to packages/compiler/src/passes/public-render/component-definitions.ts; compile those initializer expressions into the same per-render cached residue reader and evaluate them before building state. Locals are initialized on the expression that needs them, retaining sharing across initializer and markup reads. Verify reduced compiler/evaluator regression and Select → Combobox website Witness.

Update website/pages/markless/router/links.mdx to remove the now-stale statement that the sidebar uses plain anchors.
