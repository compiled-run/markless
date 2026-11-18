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

## Values the page renders (J8 to J10)

A text run, an attribute (`aria-label` included) or a `@for` list whose value calls app code the data path cannot lower
is a `{ script, bindings }` expression, the same shape a J5 computed has. A host evaluates it when it builds the view and
again when a cell it reads changes; rendering stays native. A value that is not JSON (a `RegExp`, a class instance)
arrives as the text the web shows for it. A render value that reads `Date`, `crypto` or `performance` stays refused,
since the web reads it once and a host would read it again on every change. Dragon's style input evaluates such values
with the reference engine at build time, so a styled page measures the text the script gives.

| Rung             | What                                                                                                            | Web  | Reference | iOS simulator | Android emulator |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ---- | --------- | ------------- | ---------------- |
| j8-render-values | text and an `aria-label` through app functions (a regex, another module)                                        | pass | pass      | pass          | pass             |
| j9-render-list   | a `@for` over an app function's sorted copy                                                                     | pass | pass      | pass          | pass             |
| j10-first-render | a data-only screen (engine starts 0), and one whose first frame needs the engine (1 on arrival, before any tap) | pass | pass      | pass          | pass             |

`handler-paths.test.ts` checks that every committed vector without a script starts no engine through its render and
every action, and that J10's second screen starts the engine at its first render and not before.

**Time to first frame, with and without the engine at first render** (J10's app launched straight at `/` and at
`/words`, cold process each run; simulator and emulator numbers, not phones):

|                               | iOS: `/` (no engine)         | iOS: `/words`                | Android: `/` (no engine)          | Android: `/words`                                      |
| ----------------------------- | ---------------------------- | ---------------------------- | --------------------------------- | ------------------------------------------------------ |
| Runs, from process start (ms) | 394, 397, 426, 456, 498, 477 | 449, 423, 454, 452, 495, 459 | 169, 201, 210, 185, 165, 210, 181 | 263, 188, 193, 175, 244, 204, 229                      |
| Median                        | 441                          | 453 (+12.5)                  | 185                               | 204 (+19)                                              |
| Engine start alone            |                              | 3.6 ms                       |                                   | 4.4 ms (8.6 ms with the script load and first compute) |

The difference is inside the run-to-run spread on both platforms (about 100 ms on iOS, 45 ms on Android); the cost of
the engine itself, measured directly, is 3.6 ms on iOS and about 9 ms on Android. iOS measures to the end of the
run-loop turn that committed the first views (the render server draws one display frame later); Android to the first
draw. Opening `/words` directly also builds the `/` screen behind it, which both figures include.

## Host services

Provided, in the order the probe's handlers use them: timers (`setTimeout`, `setInterval`, the clears, through the data
path's `timer` entry), `fetch` (text bodies; the request is a journal entry the test sees), `console` (the platform log),
`Intl` (the engines' own), `crypto.randomUUID` and `getRandomValues` (ChaCha20 keyed by 32 bytes from the platform's
secure random source per call), `queueMicrotask`, and `storage()` state, which is a cell like any other.

Refused by name, with the pages that use each in the probe: `URLSearchParams` (506), `URL` (503), `performance` (486),
`structuredClone` (10), `Blob` (10), `ClipboardItem` (10), `AbortSignal` (1). No page is blocked by these alone: every
page that uses them is also blocked by the web page itself (`document`, the window), so adding them unblocks no page yet.

## The real-app probe, before and after

`node packages/mobile/proofs/real-app-probe.ts --migrate <markless-migrate 8e6eb21> --out <file>`. Three trees: the base
`743b2d7c1`, this branch with handlers only (`7013bad5b`), and with render values (`adec7ef1c`). 1,078 pages from 40 apps.

|                                                                               | Base | Handlers | + render values |
| ----------------------------------------------------------------------------- | ---- | -------- | --------------- |
| Pages that build                                                              | 18   | 20       | 20              |
| Pages refused with "needs a script engine" (calls into app code and the like) | 895  | 337      | 96              |
| Pages refused for what their JavaScript uses                                  | 0    | 869      | 927             |
| Apps with at least one page that builds                                       | 7    | 9        | 9               |
| Apps whose every page builds                                                  | 2    | 4        | 4               |
| Apps with a "needs a script engine" page                                      | 34   | 25       | 25              |

By app (pages that build / pages with "needs a script engine" / pages with a JavaScript refusal / pages):

| App                             | Base        | Handlers      | + render values |
| ------------------------------- | ----------- | ------------- | --------------- |
| demos/dbmon                     | 0/1/0/1     | 1/0/0/1       | 1/0/0/1         |
| demos/memo-wall                 | 0/1/0/1     | 1/0/0/1       | 1/0/0/1         |
| demos (the other 18)            | 13/22/0/43  | 13/18/8/43    | 13/16/8/43      |
| website                         | 0/5/0/80    | 0/5/4/80      | 0/5/5/80        |
| docusaurus port                 | 2/483/0/485 | 2/0/483/485   | 2/0/483/485     |
| htmx.org port                   | 0/188/0/188 | 0/188/188/188 | 0/8/188/188     |
| alpinejs.dev port               | 0/80/0/82   | 0/58/80/82    | 0/1/80/82       |
| vite.dev port                   | 0/2/0/57    | 0/1/2/57      | 0/1/57/57       |
| vite-site port                  | 3/3/0/7     | 3/1/2/7       | 3/1/3/7         |
| hn-graphql port                 | 0/22/0/38   | 0/0/21/38     | 0/0/21/38       |
| the other 13 ports and fixtures | 0/88/0/96   | 0/66/81/96    | 0/64/82/96      |

Only two demos moved. The ports moved none: their calls into app code now run as JavaScript (htmx 188 to 8 pages, alpinejs
58 to 1), and that JavaScript is the migrator's port of the old sites' behaviour, which works on the web page itself.

What the JavaScript refusals are, after render values (a page counts once per kind; outside the docusaurus and htmx
documentation sites in brackets):

| Kind | Pages |
| --- | --- |
| the web page: `document`, the window, browser storage, the DOM | 824 (153) |
| an import the build could not read (packages not installed in the migrate checkout: `nprogress`, `zod`) | 558 (75) |
| a global no phone script has: `URLSearchParams` 506, `URL` 503, `performance` 486, and DOM classes the page list does not name yet (`HTMLAnchorElement` 486, `HashChangeEvent` 476, other `HTML…Element` and `…Event` classes 10 to 13 each) | 527 (50) |
| `shared()` objects, device objects or element handles | 248 (60) |
| a name JavaScript cannot reach (not state, a prop value, a row item or a computed) | 82 (77) |
| framework state or components used by module code | 10 (10) |
| an event field a phone lacks | 5 (4) |

The 96 pages still refused as "needs a script engine" are mostly class tests, first values of state and submit handlers,
which stay data by design here.

## Limits

- State a script writes must be JSON, as cells are: a `Date` written to state arrives on the next call as its string.
- A value binding (a prop, a row item) is read when the handler starts; after an `await` it is that value, not a newer one.
- A script's `fetch` sends and reads text bodies only; a relative URL is refused when it runs (a phone has no page origin).
- `arguments` inside an async arrow reads the arrow's own after it is lowered for Hermes (async arrows become async
  functions bound to `this`).
- Every global in the statements a handler reaches is checked, `typeof x` excepted; a library that touches the window
  behind a feature check other than `typeof` is refused.
- Side-effect-only imports (`import './x'`) are not loaded into the script.
