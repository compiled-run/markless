# Closed-overlay first-input wake

The window-level overlay primer now checks for a shown overlay before waking the runtime or retaining Escape. Previously, a closed menu made an unrelated first press on the docs header initialize the page runtime. The header is outside the resumed container: this wake came from the overlay primer, not the nested-record dispatch fallback.

Preview: http://localhost:3000/markless/concepts/state. Immutable output `/private/tmp/markless-docs-overlay-primer-sjkt2c/.output`, server session 7925. Reload an existing page after switching builds. The reported `chunk-DOTqkIfD.js` returns 404 and is absent from current HTML; the current five framework chunks return 200.

## Evidence

Four focused tests failed before the fix: three unrelated gestures imported the runtime for a hidden overlay, and an ignored Escape remained primed for a later opening. Eight primer tests now pass, covering shown surfaces, later opening, Escape during pending authored dispatch, and listener removal after installation.

The prior immutable docs build fails the real-header regression: Chrome coverage reports 153,514 bytes of executed source ranges during the static press. The candidate reports zero framework pack execution in that phase on three fresh visits. Coverage source ranges are not CPU time or instruction counts. The initial diagnostic stopped too early and failed to collect source for an import still in progress; it is excluded. The retained comparison observes a one-second window and subsequently verifies the counter remains on scalar dispatch.

The candidate passed 18 fresh-context visits, 57 control actions and three static-header presses. HTTP cache was disabled and service workers blocked, with no page errors or HTTP cache hits. Counter first action still initializes 15 modules; repeats add zero, and the independent second control adds three. Computed, mode-selector and accordion first actions remain at 56, 72 and 117 initializers respectively. This fix removes a needless wake; it does not claim those complex paths are minimal.

Six navigation/delivery scenarios pass. They include Escape before opening a menu, header input followed by scalar clicks, outside-press and Escape dismissal after opening, live-state handoff, keyboard/burst input, SPA/history/offline interaction, delayed packs and visible failed-pack errors. Direct clicks on the actual port-3000 preview also left the header inert and incremented the counter twice without starting the full runtime. Five framework plus three site-script requests returned 200; the console had no errors.

The served inline script grows by 62 raw bytes, 26 gzip bytes or 22 bytes at Brotli quality 5, measured independently from the containing HTML. Framework pack filenames remain unchanged. The exact serialized-source test shrinks from 1,448 to 1,106 characters because its transformer retains source comments removed from the primer; that is not a production compression saving. No unprofiled latency claim is made.

## Verification and remaining work

Root `pnpm run typecheck`, 722 web/router/inline-bundler tests, 64 docs tests, docs Markless-aware typecheck and the actual docs doctor/build pass. The wider check found a stale test that searched for an exported async function despite queued delivery now exporting a wrapper; it now checks the `resumeFromPayloadDocument` call's page render-data argument. A Git invocation initially hit Apple's license gate; the passing run selected Homebrew Git. Docs tests retain their existing successful-exit shutdown warning.

Four music-player budget tests still fail, unchanged by this fix: CSR download/startup 140,827/14,916 gzip bytes against 140,187/14,696; SSR download/navigation 84,882/25,717 against 84,771/25,502. SSR startup remains at its 4,327-byte ceiling. No limits changed. Other outstanding goal work includes complex-control execution, exact execution-byte accounting, fixture chunk caps and the logger's unmatched-event wake inside a container. Scalar dispatch also needs an explicit ancestor-handler propagation check before treating it as generally minimal and correct.

This is a verified improvement within an unfinished goal, not a completion claim. No commit, push or goal closure occurred. Raw paths and concise counts are in [OVERLAY-PRIMER.json](./OVERLAY-PRIMER.json).
