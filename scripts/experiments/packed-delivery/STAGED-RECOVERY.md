# Staged resume recovery and live state

Staged activation now recovers from a failed attempt, preserves live values across later groups, and forwards the caller's render-data surface. These are runtime correctness prerequisites for selective activation; the docs MDX route still uses its existing full fallback.

Previously, a rejected activation remained in the group promise map forever. Runtime construction also added a graph segment before locator validation/startup could fail. A later group could inherit that unsuccessful segment's initial value. Regressions reproduce both failures: correcting a refused locator still returned the cached rejection, and a different group expecting 9 received the failed group's 1.

Activations now run sequentially per container, with duplicate requests sharing the same promise. Rejection removes the cache entry. Failed startup disposes the created runtime, removes its segment/registration, and restores previously held computed ownership. Tests include recovery after observer startup throws and a queued group surviving an earlier refusal.

The scalar handoff map now retains unactivated cells and answers activated cells from the live graph. Tests exercise values changing 4 → 5 → 6 across successive groups, preserve an independent cell for a third group, and preserve updates made while activation is pending. Alternate tests use different graph prefixes and control elements. Previously, the policy map still answered 4 after the first group had updated the state to 5; later construction could also prefer that stale scalar value over its live-state input.

The row regression supplies a distinct page surface, creates a new component row, and checks its attachment and subsequent registration. Its bridge previously received undefined because staged runtime construction omitted `renderData`. The existing row runtime prepares that surface when the repeat activates. A zero-call-at-activation assertion exposed this existing behavior and was corrected to reflect the forwarding test's actual contract: one call during activation, none added by the row write. This does not demonstrate minimal execution. Eager row preparation remains recorded work and must preserve synchronous row-at-write behavior if changed.

## Verification

- Seven regression cases failed before their respective fixes; nine new cases exercise the changes and supporting behavior.
- Full web and relevant bundler staging/prerender suites: 730 passed in 110 files.
- The sandboxed suite first failed its local HTTP/Chrome case because listening on 127.0.0.1 was denied. The identical full command outside the sandbox passed.
- Root and docs Markless-aware typechecks passed.
- Docs tests: 64 passed in 15 files, with the existing nonfatal Vite teardown timeout.
- Docs doctor and production build passed.
- The 63 rebuilt client JavaScript files match accepted GSbudh by name and SHA-256, totaling 19,274,342 bytes. This change does not alter the current docs client output, and no new browser timing gain is claimed.
- Diff whitespace check passed.

The input type `Omit<ResumePayloadScriptsInput, 'stateScript' | 'viewScript'>` excludes HTML script strings. `DecodedPayloadScripts` supplies the ordinary `{ state, view }` record shape. This staged path accepts records directly; its compatibility merge helper can still adopt document records. The current MDX fallback continues reading serialized scripts. Compiler-known structure and dynamic SSR values remain different inputs; migration of the docs fallback is incomplete.

Remaining work includes the linked/rendered MDX dependency proof, production selective activation, ancestor dispatch and full/staged handoff, disposal/navigation, fresh integrated cold-browser measurements, and six earlier size-budget failures. No commit, push, or goal closure occurred.

See [STAGED-RECOVERY.json](STAGED-RECOVERY.json) for source hashes and [results/staged-recovery-2026-09-22](results/staged-recovery-2026-09-22/) for before/after source, failing-before output, and verification logs.
