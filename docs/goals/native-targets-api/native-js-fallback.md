# Handlers that are not data run as JavaScript on the phone

Branch `cw/native-js-fallback` (from `cw/native-integration`), 2026-11-18. Draft PR #829. The study before it is
`handler-boundary.md` on `cw/native-handlers` (#807); the real-app probe is `real-app-probe.md` on `cw/native-app-probe`.

## What an app author sees

Nothing new to write. A handler the compiler can lower to data stays data, as before. A handler it cannot lower (a loop
with a local, a call to your own function in another file, a package from npm, `await`, timers, `fetch`) runs as its own
JavaScript in the phone's engine: JavaScriptCore on iOS, Hermes on Android. Rendering stays native: the script only reads
and writes state, through the same cells and journal the data path uses, and the native views change from the journal.
Nothing crosses between the engine and the views per frame; one engine call runs per tap, timer or answered request.

What a phone has no meaning for is refused when the app is built, with the name, file and position
(`MARKLESS_NATIVE_JAVASCRIPT`): `document`, `window.matchMedia`, `localStorage` (use `storage()`), `navigator`, the
browser window's size and scroll, event fields a tap does not have (`event.clientX`), a CommonJS package, a framework call
from inside the script (`navigate`, a device call). A refused helper only matters when a handler reaches it: the build keeps
only the statements the handlers reach, so a module whose other function touches `document` is fine.

## How it works

- **Analyzer facts** (native builds only, `script-facts.ts`): for each handler and computed, its JavaScript with types
  erased; names from the component (state, props, row items, computeds) read as `__s.<name>`, imports as `__i[n]`,
  component-local helpers copied in front of it. For each module, its top-level statements with what each declares and
  reads. All of it from yuku's scope analysis; no text is scanned.
- **Compiler** (`native-view.ts`): per handler, data first; if data refuses, a `script` op with bindings (`cell`,
  `fields`, `value`) resolved where the handler runs. A computed whose body is not data is a `{ script, bindings }`
  expression. `scriptHandlers: 'all'` forces every handler a script can run into the engine, to check both meanings;
  `'never'` is the old data-only build. Submit and checkbox-change handlers stay data: their default action and
  checkedness are the host's, and the script's event cannot report them back yet.
- **Payload**: `script: { id, source, services }` only when something runs as JavaScript. The source is the modules the
  handlers reach, tree-shaken by statement, plus a small fixed runtime (cell diffing, timers, fetch, console, crypto).
- **Hosts**: one engine per app, started the first time a screen needs it, or warmed once the first frame is up and the
  main loop idles, on a screen whose payload has a script. Contract: `contract.md` section 0c.

## The rungs

| Rung                | What                                                             | Web              | Reference                                     | iOS simulator | Android emulator |
| ------------------- | ---------------------------------------------------------------- | ---------------- | --------------------------------------------- | ------------- | ---------------- |
| j1-loop-local       | a loop with a local and string work                              | pass             | pass                                          | pass          | pass             |
| j2-app-and-library  | a function from another app module, and `scule` from npm         | pass             | pass                                          | pass          | pass             |
| j3-await-catch      | `await` with code after it; a rejection in `@catch`              | pass (see below) | pass                                          | pass          | pass             |
| j4-timers-fetch     | `setInterval`/`clearInterval`, `fetch` to the test's echo server | pass             | pass                                          | pass          | pass             |
| j5-engine-computed  | a computed whose body needs the engine                           | pass             | pass                                          | pass          | pass             |
| j6-engine-on-demand | a data-only screen beside a JavaScript screen                    | pass             | pass                                          | pass          | pass             |
| j7-page-refused     | `document.title =` in a handler                                  | pass             | refused at build time, by name, file and line | n/a           | n/a              |

Device runs (one harness run per platform, on the simulator `markless-js` and the emulator `markless_js`) also passed
03-counter, 08-text-input, n1-two-routes and r135-idle as regressions, and r137-clock on iOS. Host conformance: `swift
test` 32 tests (every vector, the `script-*` ones through JavaScriptCore); Android `test-jvm.sh` 749 checks, 0 failed
(the `script-*` vectors through a `node` engine, as the JVM has no Hermes).

J1's "both paths": `handler-paths.test.ts` builds every committed vector twice, once as the compiler chooses and once
with every handler a script can run forced into the engine (`all`); the screens and journals are the same in all of them
(the clock vector is left out: it fixes the data path's clock, and the engine reads the device's own). J1's own handler is
outside the data vocabulary: a data-only build refuses it with four named reasons.

**Where phones and the web differ (J3).** When an async handler's await rejects inside `@try`, the web keeps the `@try`
content and shows the `@catch` arm after it. That is the specified behaviour (`specs/framework/12-arm-rendering.md`,
"Handler rejection", #540), pinned by the router's `child-async-catch` tests; an earlier draft of this report called it
a web defect, which was wrong. Phones replace the content, as the data path already does for a failed device call. The
rung records the difference in `onWeb`; which way phones should go is an open question.

## Size and first-interaction delay

Simulator and emulator numbers on a shared M-series Mac, not phones; sizes do not depend on that.

|                                      | iOS (JavaScriptCore)                                                 | Android (Hermes 0.82.1)                                                            |
| ------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Engine in the app                    | system framework, linked by reference: 0 B                           | 1,611,695 B compressed (4.06 MB of native libraries), only in an app with a script |
| App with vs without a script         | proof shell binary +223 KB for the host code (debug simulator build) | APK 8,426,346 B (j6) vs 6,807,853 B (03-counter, no `lib/`): +1,618,493 B          |
| Engine start                         | 3.9 to 7.2 ms                                                        | 5.2 to 13.8 ms                                                                     |
| First JavaScript tap, cold           | 4.7 to 8.1 ms                                                        | 9.0 to 14.8 ms                                                                     |
| First JavaScript tap, warmed at idle | 0.60 to 0.65 ms                                                      | 0.4 to 0.7 ms                                                                      |
| A data-only screen                   | engine never started (`engine starts: 0`)                            | engine never started                                                               |

## Host services

Provided, in the order the probe's handlers use them: timers (`setTimeout`, `setInterval`, the clears, through the data
path's `timer` entry), `fetch` (text bodies; the request is a journal entry the test sees), `console` (the platform log),
`Intl` (the engines' own), `crypto.randomUUID` and `getRandomValues` (ChaCha20 keyed by 32 bytes from the platform's
secure random source per call), `queueMicrotask`, and `storage()` state, which is a cell like any other.

Refused by name, with the pages that use each in the probe: `URL` (530), `URLSearchParams` (500), `performance` (486),
`structuredClone` (11), `Blob` (10), `ClipboardItem` (10), `AbortSignal` (1). No page is blocked by these alone: every
page that uses them is also blocked by the web page itself (`document`, the window), so adding them unblocks no page yet.

## The real-app probe, before and after

`node packages/mobile/proofs/real-app-probe.ts --migrate <markless-migrate 8e6eb21> --out <file>`; before is the base
`753a0ddc7` (with real-values, real-elements, forms and scroll), after is this branch. 1,078 pages from 40 apps.

|                                                                             | Before | After                                 |
| --------------------------------------------------------------------------- | ------ | ------------------------------------- |
| Pages that build                                                            | 18     | 20 (`demos/dbmon`, `demos/memo-wall`) |
| Pages blocked by "needs a script engine" (calls into app code and the like) | 895    | 337                                   |
| Pages blocked by a JavaScript refusal                                       | 0      | 869                                   |
| Pages with neither                                                          | 183    | 184                                   |

By app, only the demos moved (13 to 15 of 45). The ports moved none: the calls the data path refused are now JavaScript,
and that JavaScript is the migrator's port of the old site's behaviour, which works on the web page itself.

What the 869 pages' JavaScript refusals are (a page counts once per kind; outside the docusaurus and htmx documentation
sites in brackets):

| Kind                                                                                                    | Pages     |
| ------------------------------------------------------------------------------------------------------- | --------- |
| the web page: `document`, the window, browser storage, the DOM                                          | 672 (174) |
| a host service not provided (above)                                                                     | 784 (113) |
| an import the build could not read (packages not installed in the migrate checkout: `nprogress`, `zod`) | 503 (20)  |
| `shared()` objects, device objects or element handles, which a script cannot reach yet                  | 248 (60)  |
| a name JavaScript cannot reach (not state, a prop value, a row item or a computed)                      | 82 (77)   |
| framework state or components used by module code                                                       | 30 (30)   |
| an event field a phone lacks                                                                            | 5 (4)     |

The 337 pages still refused as "needs a script engine" are not handlers: calls in attribute values (272), text (199) and
`@for` lists, which render. The same mechanism (a `{ script }` expression) would run them; that is the next step if wanted.

## Limits

- State a script writes must be JSON, as cells are: a `Date` written to state arrives on the next call as its string.
- A value binding (a prop, a row item) is read when the handler starts; after an `await` it is that value, not a newer one.
- A script's `fetch` sends and reads text bodies only; a relative URL is refused when it runs (a phone has no page origin).
- `arguments` inside an async arrow reads the arrow's own after it is lowered for Hermes (async arrows become async
  functions bound to `this`).
- Every global in the statements a handler reaches is checked, `typeof x` excepted; a library that touches the window
  behind a feature check other than `typeof` is refused.
- Side-effect-only imports (`import './x'`) are not loaded into the script.
