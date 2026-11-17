# Where native handlers stop being data, and the cheapest fallback

Branch `cw/native-handlers` (from `cw/native-targets`), 2026-11-17. Proof work, not a production feature.

## Summary

**Answer:** keep handlers as data and grow the data vocabulary by a few named steps (about 70% of real handlers, no
engine). For the rest, add a JavaScript engine that the compiler chooses per handler and that starts only when such a
handler runs: JavaScriptCore on iOS, Hermes on Android. But most handlers outside data touch the page itself (the DOM,
`window`), and no engine runs those. They need native versions of the browser features they use, whichever fallback you pick.

| Candidate | Share of the 1,344 real handlers it runs | App size added (Android arm64 / iOS) | First tap that runs JavaScript (emulator / simulator) | What the author must know | Cost to maintain |
|---|---|---|---|---|---|
| Data today | 262 (19%) | none | no engine | nothing | the current interpreters |
| B: compile ahead of time, as a larger data vocabulary | 962 (72%) with 17 named extensions; 474 (35%) with the first four | none | no engine | a build error names any construct outside the vocabulary | each extension lands three times (TypeScript reference, Kotlin, Swift), pinned by shared test files |
| B as generated Swift and Kotlin, or WebAssembly | not more than the line above (see "B") | WebAssembly needs a runtime on the phone | n/a | a typed subset with no regular expressions, `Intl` or number-to-text conversion of their own | two code generators that measurably disagree with JavaScript; no over-the-air updates |
| A: a JavaScript engine for every handler, started lazily | 1,024 (76%) at most: data plus the 62 class-3 handlers that do not touch the page | Hermes +1.61 MB APK (4.0 MB of native libraries); QuickJS +0.37 MB APK (0.85 MB); iOS JavaScriptCore 0 | Hermes 5 to 31 ms cold, 0.6 to 4.8 ms warmed at idle; JavaScriptCore 7 to 19 ms cold, 1.1 to 6.4 ms warmed | nothing new, but handlers that touch the page fail at run time | one engine per platform, plus the host services it needs (timers today) |
| C: mixed, chosen per handler by the compiler | the same as A; the engine starts only on screens that need it (140 of 263 files with handlers) | as A | as A, and only for handlers outside data | the same as A | B and A together; the same test files check both paths (10 of 10 agree) |

Timings are from the iOS simulator and the Android emulator on an M-series Mac, not from phones. Prefer the sizes and
counts. Full numbers are below.

## Phase 1: what real handlers need

### How this was measured

Every `.tsrx` file under `website/`, under `demos/` (two `demos/interaction-benchmark` apps are other frameworks and are
left out), and under `packages/headless/components/src`: 1,354 handlers in 263 files. Of these, 10 pass a received
handler straight through (`onClick={onClick}`) and have no body of their own, which leaves 1,344.

There is no text scanning. The analyzer's native facts now say why a construct is outside the expression tree (a closed list
of gaps: `await`, control flow, a loop, a local, a call, a member write, a type assertion, an operator and so on). For each
call, yuku's scope analysis gives what the callee resolves to (an import with its source, a function in the module with its
body, a parameter, a variable with its value, or no declaration at all). The classifier (`packages/mobile/src/boundary/`)
reads only those facts. It follows calls into your own functions in the same module, into relatively imported modules, and
into `shared()` methods, a few calls deep. Rerun it with `node packages/mobile/src/boundary/cli.ts <out.json>`; the
committed output is `handler-boundary.json` beside this note.

The three classes:

1. **Data today:** the handler body is in today's expression tree.
2. **With named extensions:** each construct outside the tree is one of 22 named, bounded additions (listed below).
3. **General JavaScript:** at least one construct is not.

### Counts per app

| App | Handlers | Data today | With extensions | General JavaScript | of which do not touch the page | Event is not tap or text input |
|---|---|---|---|---|---|---|
| website, docs figures | 643 | 119 | 396 | 128 | 28 | 532 |
| website, rest | 227 | 86 | 95 | 46 | 4 | 51 |
| headless component families | 252 | 0 | 110 | 142 | 26 | 188 |
| headless scenarios | 96 | 11 | 45 | 40 | 0 | 27 |
| all demos (14 apps) | 136 | 46 | 54 | 26 | 4 | 20 |
| **total** | **1,354** (10 pass-through) | **262** | **700** | **382** | **62** | **818** |

Without the docs figures (pen-and-ink illustrations, half of all handlers): 701 handlers, 143 data, 304 with extensions,
254 general JavaScript. Per demo, see `perApp` in the JSON. The last column is a separate gap in what the host supports:
818 handlers listen for keys, focus, pointer or submit, which no payload event maps yet, whichever language the body is in.

### The extensions, and what each unlocks

"Only piece" counts the class-2 handlers for which that extension alone is missing. The cumulative column adds extensions
in the order that unlocks the most handlers at each step.

| Extension | Class-2 handlers that need it | Only piece | Cumulative share if added in this order |
|---|---|---|---|
| element commands (`focus`, `scrollIntoView`, position reads) | 162 | 77 | 25.7% |
| a call to your own function, inlined at build time | 379 | 59 | 30.1% |
| writing a field of a state object or list row | 164 | 39 | 33.0% |
| `if`, early `return`, `switch`, `throw` | 399 | 4 | 35.3% |
| reading the event (`event.key`, `event.target.checked`) | 417 | 6 | 42.0% |
| `event.preventDefault()`, `stopPropagation()` | 131 | 0 | 46.9% |
| local names (`const x = ...`) | 213 | 3 | 52.1% |
| calling a received callback with arguments, or `?.()` | 124 | 5 | 54.5% |
| a method of `shared()` state, inlined | 92 | 0 | 58.8% |
| more operators (`typeof`, `in`, `**`, `??=`) | 55 | 0 | 61.4% |
| a key chosen at run time (`map[key]`) | 80 | 0 | 64.0% |
| more string and array methods | 35 | 0 | 65.5% |
| more standard functions (`Math.*`, `JSON.*`, `Object.keys`) | 27 | 0 | 66.8% |
| object spread | 19 | 0 | 67.7% |
| dates, the clock, locale formatting | 16 | 0 | 68.4% |
| a loop over a list | 36 | 0 | 69.2% |
| editing a list in place (`push`, `splice`, `sort`) | 31 | 0 | 71.5% |
| a Markless API call | 1 | 0 | 71.6% |

Type assertions (`x as T`) appear in 184 class-2 handlers. They are erased, so they are free. Statements after an
`await` and device calls appear in no handler in this corpus. A class-2 handler needs 3 extensions at the median and
14 at most.

### Why handlers need general JavaScript

Handlers with at least one reason from each group (a handler can have several):

| Reason | Handlers | Only reason |
|---|---|---|
| the page itself: DOM methods on the event target, `instanceof Element`, `window.matchMedia`, `getComputedStyle`, `document`, `new FormData`, writes to DOM nodes | 266 | 129 |
| values of unknown shape: often DOM nodes held in a local (`row.getAttribute`), also class instances (`engine.setAxis` in the carousel) and `Intl` objects | 158 | 31 |
| timers (`setTimeout`, `setInterval`, `requestAnimationFrame`) | 82 | 22 |
| a function passed or kept as a value (a closure) | 65 | 7 |
| regular expressions | 57 | 18 |
| other syntax (array destructuring, dynamic `import()`) | 10 | 6 |
| a function too deep or recursive to follow | 7 | 0 |
| `fetch` | 4 | 0 |
| a third-party package | 0 | 0 |

**The finding that matters most:** 320 of the 382 general-JavaScript handlers touch the page or a value the build cannot
see. A JavaScript engine on the phone has no DOM, so it does not run them. Only 62 (16%) are general JavaScript that an
engine alone runs. The headless families are the extreme case: 142 of 252 handlers are general JavaScript, and 116 of
those touch the page. They need the native host services the headless assessment lists (focus, roles, measured
positions). No engine provides those.

Computed values with a one-expression body (634 in total) split as 313 data, 163 with extensions and 158 general
JavaScript. Computeds with a block body are not counted.

Limits of this measurement: the classifier tells element commands and DOM methods apart by method name (`focus` and
`closest` are names in the facts, not a type check), so a `focus()` on something that is not an element would be
miscounted. A local holding a DOM node is recognised only when its value comes from the event or a browser global; other
DOM locals land in "values of unknown shape". Imported modules are followed only when the specifier is relative.

## Phase 2: three candidates on the phones

### The five handlers

Each is a harness rung in `packages/mobile/proofs-handlers/`. The component copies one kind of class-3 handler from this
repo, and the file it mirrors is named at the top:

| Rung | Handler | Mirrors | Why it is class 3 |
|---|---|---|---|
| h1-timer | reload that a second press replaces | `website/components/figures/stream/stream-anatomy.tsrx:74` | `window.setTimeout`, `clearTimeout` |
| h2-regex | type a URL slug | `website/components/figures/routes/model.ts` `typeSlug` | a regular expression in your own function |
| h3-closure | sort rows with a comparator | `demos/dbmon/fixture/data.ts` `reorder` | an arrow function passed to `sort` |
| h4-intl | format a total as currency | `packages/headless/components/src/numberbox/numberbox-math.ts` | `new Intl.NumberFormat(...)` |
| h5-page | ask the page about reduced motion | `website/components/figures/async/board-anatomy.tsrx:74` and five more figures | `window.matchMedia` (expected to fail) |

There are two more rungs. h0-mixed puts a data handler and an engine handler in one payload. h6-input-all is rung 8
(text input) with every handler forced into the engine, and it must pass the same flow as the data path.

### A: a lazily started JavaScript engine

**What was built (proof only):**

- **Compiler.** Payload op `{ op: 'script', handler }` and payload field `script: { source }`. The compiler emits the
  handler's own source with types erased and every reference to a state binding (resolved by yuku) renamed to its cell,
  `$cells["state:count"]`. It copies the module's own helper functions beside the handler. The script exposes
  `__markless.dispatch(handler, cells, event)` and `__markless.fire(timer, cells)`. Each takes JSON text and returns
  `{ writes: [[cell, value]], timers: [[id, ms]] }`.
- **On the phone.** The JavaScript only writes state. The host writes those cells exactly like `assign` ops and builds the
  journal as usual. A timer is a journal entry `{ op: 'timer', id, ms }` that the host schedules. Nothing crosses per
  frame: one call per tap or timer.
- **Errors.** A script that throws changes nothing, and the next handler still runs. Engines word errors differently,
  so the journal does not name them.
- **Hosts.** iOS uses `JavaScriptCoreEngine` (system framework). Android finds the engine by class name, so the host
  builds without one: QuickJS through `app.cash.quickjs` 0.9.2, or Hermes 0.82.1 through 30 lines of JNI glue built with
  NDK 29.
- **Harness.** `MARKLESS_PROOF_ANDROID_ENGINE=<folder>` packs the engine into the APK.
  `MARKLESS_PROOF_ENGINE_WARM=1` starts the engine once the first frame is up and the main loop is idle.
  `MARKLESS_PROOF_ENGINE_LOG=1` saves each rung's timing lines.

**What ran (one harness run, both phones, Android on Hermes):** all eight rungs pass on the iOS simulator and the Android
emulator, cold and warmed: `03-counter` (data only), h0 to h6. h5 passes as expected: the handler throws
(`window.matchMedia is not a function`) and the screen keeps working. Receipts: `receipts/2026-11-17-handlers-ios.json` and `-android.json` ("all 8 rung(s) passed on iOS and Android"); each rung's timing lines are in `packages/mobile/proofs-handlers/<rung>/engine-{ios,android}.log`. QuickJS ran the same rungs on Android alone, cold and warmed.

**What did not run:**

- **QuickJS and `Intl`.** h4-intl fails on QuickJS: `'Intl' is not defined`. QuickJS ships no `Intl`, while Hermes and
  JavaScriptCore format `$1,270.49` as the web does. Every other rung passes on QuickJS.
- **First Hermes attempt.** Hermes refused my first scaffold, which used `with (scope)` to reach state: Hermes does not
  support `with`. Renaming references from the analyzer's resolution (the production-shaped way) fixed it.
- **Hermes on its own.** Hermes needs fbjni's Java classes and `libjsi`, `libfbjni` and `libc++_shared` beside
  `libhermesvm`, plus JNI glue. React Native supplies those. A non-React-Native app must build and ship them itself.

**Numbers:**

| | iOS JavaScriptCore | Android Hermes | Android QuickJS |
|---|---|---|---|
| Native code added (arm64) | 0 (part of iOS) | 4,050,096 B: `libhermesvm` 2.14 MB, `libc++_shared` 1.29 MB, `libjsi` 0.40 MB, `libfbjni` 0.18 MB, glue 0.04 MB; plus 0.13 MB of Java classes for `Intl` | 854,224 B `libquickjs` + 6 KB of Java classes |
| Proof APK (compressed; 1 ABI) | n/a | 2,499,545 B (+1,610,218 B) | 1,262,160 B (+372,833 B) |
| Proof APK without an engine | n/a | 889,327 B | 889,327 B |
| Engine start, cold (6 runs) | 5.7 to 9.0 ms | 4.2 to 25.8 ms | 0.8 to 4.3 ms |
| First tap that runs JavaScript, engine cold | 6.9 to 18.9 ms | 5.1 to 30.5 ms | 1.4 to 7.5 ms |
| The same, engine started at idle | 1.1 to 6.4 ms | 0.6 to 4.8 ms | 0.8 to 3.3 ms (one 20.7 ms outlier) |
| Later taps | 0.2 to 3 ms | 0.5 to 2.5 ms | 0.3 to 2 ms |
| Memory when the engine starts | +3.5 MiB physical footprint | +194 KiB native heap | +97 KiB native heap |
| A data-only screen (`03-counter`) | engine never started | never started | never started |

The memory rows use different counters: iOS counts the process's physical footprint, which includes JavaScriptCore's
mapped pages; Android counts the native heap only. They are not comparable with each other.

**Cost to maintain:** one engine per platform. The engine contract is small: two calls taking JSON text, plus timers. The
cost is in what an engine does not give you: every browser feature a handler uses (timers today, then `fetch`,
`matchMedia`, focus and measured positions) is a host service written twice. And the engine is a second meaning for
handlers that has to match the data path; the shared test files below are how.

### B: compile ahead of time

**A larger data vocabulary** is B in its practical form, and Phase 1 measures it. The 17 extensions in the table cover
72% of real handlers. The first four (element commands, inlining your own functions, field writes, `if` and early return)
already reach 35%.

**Recommendation for B:** add them in that order, each as one payload addition with a conformance vector file, like
rungs 4 to 10 did. Two bounded steps reach into class 3: a timer op ("after N ms run these ops") and a single regular
expression engine. Those 40 handlers (22 timer-only, 18 regex-only) would move to data. Closures, the page and values of
unknown shape stay out.

**Generated Swift and Kotlin for a typed subset.** I translated the proof handlers' functions by hand, the way a
generator would, each calling its platform's own library. I compared them with JavaScript on 26 inputs
(`node`, `swiftc` on macOS, Kotlin on the JVM; the script is in the PR description). They disagreed on 8:

| Input | JavaScript | Swift | Kotlin |
|---|---|---|---|
| `typeSlug('hell', 'K')` (the Kelvin sign) | `hell` | `hellk` | `hellk` |
| `typeSlug('hell', 'İ')` | `hell` | `hell` | `helli̇` |
| currency for `de-CH`, 1270.49 | `$ 1'270.49` | `$ 1'270.49` | `$ 1’270.49` (another apostrophe) |
| `String(1e21)` | `1e+21` | `1e+21` | `1.0E21` |
| `String(1.5e-7)` | `1.5e-7` | `1.5e-07` | `1.5E-7` |
| `String(-0)` | `0` | `0.0` | `-0.0` |
| `String(123456789012345680000)` | `123456789012345680000` | `1.2345678901234567e+20` | `1.2345678901234568E20` |
| `String(5e-324)` | `5e-324` | `5e-324` | `4.9E-324` |

So a generator must not call platform libraries for regular expressions, number-to-text or `Intl`. It has to route every
operation through one JavaScript-exact library per platform, which is what the data interpreters already are. Generated
code then adds nothing to what B covers as data.

**What the author would be forbidden to write:** regular expressions (or one regex engine shipped twice), `Intl` and
`Date` formatting, closures that outlive the handler, classes, `this`, dynamic keys on non-JSON values, any library
from `node_modules`, and anything touching the page. That excludes all five proof handlers except h3 (a comparator can be
inlined).

**WebAssembly:**

- JavaScript compiled to WebAssembly means shipping an engine inside WebAssembly (as Javy does with QuickJS), interpreted
  on iOS, which does not allow just-in-time compilation in apps.
- AssemblyScript is a typed TypeScript subset with the same forbidden list as above, plus a WebAssembly runtime on each
  phone.

Neither covers more than the data vocabulary, and both cost more.

**Over the air:** a data payload or a script updates without a store release. Generated Swift and Kotlin do not. That
confirms the earlier review's objection.

**Verdict:** practical only as "a larger data vocabulary". Generated Swift and Kotlin, and WebAssembly, are impractical.
The handlers that break them are h2 (regex), h4 (`Intl`), h1 (a timer that outlives the handler) and h5 (the page). The
measured disagreements are in the table above.

### C: mixed, decided per handler

**What was built:** the compiler option `scriptHandlers: 'fallback'` lowers each handler to data when it can and emits a
`script` op only for the rest. h0-mixed has a data counter and an engine timer in one payload. The engine starts on the
first engine handler, not at launch and not for the data tap.

**Same meaning on both paths:**

- `packages/mobile/test/handler-paths.test.ts` builds each of the 10 committed conformance vector files twice, once as
  data and once with every page handler forced into the engine (`'all'`). The texts, attributes, arms, rows and journals
  are identical in all 10.
- On the phones, h6-input-all runs rung 8 with every handler in the engine and passes rung 8's own flow.
- Limit: the test runs the reference engine (V8). On the phones, JavaScriptCore and Hermes passed the same flows. QuickJS
  differs on `Intl`.

**Cost to maintain:** B's interpreters plus A's engine and host services. In exchange, most screens never start the
engine: 123 of the 263 files with handlers would have none, and the rest start it on first use.

## Recommendation

**Do B first and keep the ruling** ("handlers are data, an engine only where needed"). Add extensions in the measured
order, each with a vector file.

**Prepare C with JavaScriptCore on iOS and Hermes on Android for what is left,** started lazily and warmed at idle:

- Warming at idle brings the first engine tap under 5 ms on both platforms here, against 5 to 31 ms cold.
- Hermes costs about 1.6 MB of compressed APK per ABI (4 MB unpacked) and passes all five proof handlers, `Intl` included.
- QuickJS is a third of the size but lacks `Intl`, which the headless number and time fields use.
- JavaScriptCore costs nothing on iOS.

**Neither B nor C helps the largest group: handlers that touch the page** (266 handlers, and most of the headless
families). Before choosing an engine, decide which browser features become native host services with a data form: focus
and element commands, reading event fields, `matchMedia`-style settings and measured positions. That work is the same
whichever fallback you choose.

## Limits

- **Timings.** All timings come from the iOS 27.2 simulator and an Android 16 arm64 emulator on a shared Mac. They are
  not phones, and the machine was running other device sessions; treat them as relative. Sizes and counts do not depend
  on that.
- **Android build.** Android timings are for one ABI (arm64-v8a) in an APK built without R8 or Gradle.
- **Hermes.** The proof runs Hermes from source text (it compiles on the phone). Shipping Hermes bytecode compiled at
  build time would cut the start further; that was not tried.
- **The proof script.** It copies only same-module helpers and refuses value imports. It runs only the page component's
  own handlers, not those of child components. It hands the engine a minimal event (`target.value`, `key`).
- **The corpus** is this repo's own code. It is heavy on docs figures and headless internals; apps written against
  Markless elsewhere may lean differently.
