# Native targets: the contract (iOS and Android beside web)

Owner of this file: the lead on `cw/native-targets`. Every other native worker learns the contract from here; when it changes,
this file changes in the same push. Status as of 2026-11-16, night one.

## 0. What changed last (hosts: read this first)

2026-11-17, `a989dc47f` and after; both hosts are merged into `cw/native-targets` (#741, #750, #751).

1. **Ops are now one op, `assign`, with an expression tree** (section 4, "Handlers" and "Expressions"). `add`, `set` and
   `toggle` are gone from payloads. Both hosts' decoders correctly refuse the new vectors today
   (`test-jvm.sh`: 44 passed, 5 failed on unknown `assign`, `bindings` and `expr` parts). The host work next: an `NativeExpr`
   evaluator with ECMAScript meaning (pinned by `arithmetic.json`), element `bindings` and the `attribute` journal entry
   (`attributes.json`), `branch` nodes, `arm` places and the `arm` journal entry (`if.json`), `storage` cells, the
   `input` element and `property` entry (`input.json`), `state` entries for Dragon's per-state export, and lists:
   JSON values, array methods, `repeat` nodes and `rows` entries (`list.json`).
2. **Device rungs 1 to 3 need a re-run** after that: their payloads now use `assign`, so the earlier green flows were on
   the older payload shape.
3. Vectors to pass: every file in `packages/mobile/conformance/`.
4. Since then (2026-11-17, up to `6284b5111`): rung 7 (component instances inlined, ids prefixed `component-edge:N/`;
   nothing new for hosts but `components.json`), rung 10 (`a` elements, the `navigate` op and journal entry, the
   `{ route: 'params' }` expression, a payload `route`, vectors carrying `params`; `route.json`). Rung 11 is stopped on an
   owner decision. Android passes every vector but `list.json` and `route.json` as of `d88b8011a`.

## 0b. Next items per worker (2026-11-17, 04:10)

- **native-ios-host:** `/1` is done (the lead added `readiness` as an optional field the decoder reads past, in
  `StyleExport.swift`, so the documented format decodes). Next: anything rungs 6 and 10 still need on the shared harness.
- **native-android-host:** the clipped-title defect is fixed at its cause (text drawn with unhinted subpixel advances, as
  Dragon shapes it; re-run green 2026-11-17 05:46). Next: branch `tests` (rung 5b).
- **both hosts, launch route (rung 10):** the shell receives the Maestro launch argument `route` (iOS launch argument,
  Android intent extra) and passes it to the host entry point (`MarklessViewController(payload:style:fonts:route:)`,
  `MarklessActivity.route()`). The host matches it against `payload.route.pattern` (a `[name]` segment matches one path
  segment, URL-decoded; any other segment matches itself) to get the params, then mounts with them; no route means the
  page's pattern must have no params. A `navigate` entry re-mounts with the entry's params.
- **both hosts:** branch `tests` for `@else if` chains and `@switch` (section 4; vectors `choices.json`); `null` formats as
  empty text, as on the web; child-component state arrives as ordinary cells with prefixed ids (nothing new to build).
- **native-proof-harness:** forward the `route` launch argument to the shells; run `node packages/mobile/src/style-export.ts
  <rung>` when a rung has styles and `MARKLESS_DRAGON_DIR` is set (or keep refusing a missing export, as now).
- **native-ladder:** rung 7b is written by the lead (`proofs/07b-imported-component/`, rung number 7.5, importing
  `proofs/lib/Stepper.tsrx`; the web check copies `proofs/lib` into its app). Also: rungs 2 and 4's CSS now say `display: block` and `font-family: inherit` on buttons (and rung 4's
  buttons have an author background and border): Dragon refused the originals with `DRAGON_UNSUPPORTED_VALUE` and
  `DRAGON_UNSUPPORTED_FONT`, which is the build error with a fix the design asks for. Please keep the web check green on
  the new CSS. Next: rung 7b, a component imported from another file (`proofs/07b-imported-component/`), which the
  compiler does not lower yet (I take the compiler side).
- **native-dragon-styles:** the Markless style input is turned into `/1` by `examples/markless-counter/tools/markless-style.ts`
  on the Dragon branch `cw/native-targets` (it lays out each state combination through Dragon's HTML fixture reader). Please
  either adopt it or replace it with a `compileNativeStyles`-based reader of `markless.native-style-input/0` that writes the
  same `/1` shape, and say which here.

## 1. What I found before building (the owner's picture is weeks old)

- **`docs/goals/native-targets-api/` was not in the repo.** The research board lives only on the planner's machine (copy read
  from `~/native-goal-notes/`, not committed). This folder now holds only the new notes.
- **Earlier proofs:** `poc/fixtures/proofs/ios-native-rendering-target` and `macos-native-rendering-target` are hand-written
  `artifact.json` files driving UIKit/AppKit views, with the click handler run as JavaScript in JavaScriptCore. The compiler
  never wrote those artifacts; no styling, no Android.
- **The compiler already knows most of what a native host needs** (semantic graph, `packages/compiler/src/passes/semantic-graph`):
  element ids and tags, events per element, state cells with build-time initial values, state writes with their operation
  (`count++` is recorded as an `update` with `++`), and text bindings (`"Count " + count`). What it did *not* record as
  structured facts: static text (it existed only inside the HTML strings) and whether a handler does anything besides its
  writes. Nesting is recorded as child-index paths. Both missing facts are now added (section 4).
- **Dragon is further along than the brief assumed.** It already has an Android Views (Kotlin) emitter beside UIKit (Swift),
  Android device lanes on the emulator (several pass, pixel lanes still fail), and builds its Android app from the SDK tools
  alone (no Gradle). Its native output is still `analysis-only` (internal), and it warns that a `<button>`'s activation and
  accessibility role are the app's job: exactly the split below (Markless owns behaviour, Dragon owns paint and layout).
- **Repo vs brief contradictions:** the September report recommended Taffy as the layout library and a package *inside*
  Markless; the owner since chose Dragon as its own project with its own layout engine (Dragon's `docs/decisions.md`). The
  report proposes a `target.os` constant for platform differences; the owner rulings call that *unsettled* (only `@web/@native`
  arms are rejected). It is listed as an open question, not built.
- **Tooling on mini-2:** Java 21 and the Android command-line tools were already present; installed platform-tools, emulator,
  build-tools 36.0.0, platform android-36, the `android-36 google_apis arm64-v8a` image, AVD `markless_native` (Pixel 7),
  `kotlinc` 2.4.21 and the Maestro CLI 2.12.1. The emulator boots headless in 19 s and `adb exec-out screencap` works.

## 2. Packages and folders

Spec `specs/framework/11-platform-organization.md` is the authority: no package named `native`; mobile platforms live in one
`packages/mobile` with OS adapter folders, not a package per OS.

| Where | Owns | Owner |
|---|---|---|
| `packages/serializer/src/native-view.ts` | The payload type (`NativeViewPayload`, `NATIVE_VIEW_VERSION`), ops and journal entry types. Protocol types live with the serializer, as for web. | lead |
| `packages/compiler/src/passes/native-view.ts` | `createNativeViewPayload(semanticGraph)`: the pass that emits the payload from analyzer facts, plus its refusal diagnostics. Not in the web pass pipeline, so web output is byte-identical. | lead |
| `packages/mobile/src/` (TypeScript) | Target-neutral mobile code: `compileNativeComponent()` (compiler front door for a native build), the **reference runtime** (`runtime.ts`: runs ops, produces journal entries) and the **conformance vectors** both hosts must reproduce. | lead (runtime, vectors); harness worker (CLI) |
| `packages/mobile/src/adapters/ios/` | Swift package `MarklessMobile` (UIKit host runtime: payload decoder, view factory, op interpreter, journal applier) and the iOS app shell. Built with `swiftc`/`xcrun`, no Xcode project required. | native-ios-host |
| `packages/mobile/src/adapters/android/` | Kotlin host runtime (`dev.markless.mobile`: same four parts on Android Views) and the APK shell, built from SDK tools alone (aapt2, kotlinc, d8, zipalign, apksigner), as Dragon does. | native-android-host |
| `packages/mobile/proofs/<nn>-<name>/` | One ladder rung: `App.tsrx`, `flow.yaml` (one Maestro flow run on both platforms), `expected.json` (the visible texts before and after each step, checked against the web build), screenshots under `screenshots/{ios,android,web}/`. | native-ladder (component + web check), native-proof-harness (flows, shells, screenshots, CI placement) |
| `packages/mobile/src/harness/` (README there) | The proof harness: `pnpm --filter @markless/mobile proof <rung>...` compiles a rung, builds the iOS and Android app shells around the hosts (no Xcode project, no Gradle), runs the rung's one Maestro flow on both, screenshots each step and fails unless both pass. `.github/workflows/native-proofs.yml` is its CI proposal. | native-proof-harness |
| Dragon repo `examples/markless-counter/` (branch `cw/native-targets`) | Component CSS to native paint and frames as data, plus the Chrome comparison. | native-dragon-styles |

Shared vs per platform: the payload, the op semantics, the journal semantics and the conformance vectors are written once
(TypeScript). Each host *implements* them in its own language because the ruling is no JS engine for op-encoded handlers; the
vectors are how the two implementations are held to one meaning. Element-to-view mapping, event mapping, fonts, safe areas
and accessibility wiring are per platform.

## 3. Rulings this contract follows

Retained platform views changed only by journal entries (no SwiftUI, no custom drawing); no TypeScript-to-Swift/Kotlin
transpiling, handlers are data, a JS engine only where a handler truly needs one (not used yet); routes stay the one
authoring concept; no per-platform markers in authoring; Dragon compiles CSS at build time and the only on-device library is
layout; Maestro for native flows, Playwright for web.

## 4. The contract, rungs 1 to 3

### The payload (`markless.native-view/0`)

Emitted by the compiler from the semantic graph. Example, rung 3's counter:

```tsrx
export function Counter() @{
	let count = state(0);
	<main class="screen">
		<h1 class="title">Counter</h1>
		<button class="tap" onClick={() => count++}>Count {count}</button>
	</main>
}
```

```json
{
  "version": "markless.native-view/0",
  "component": "Counter",
  "cells": [{ "id": "state:count", "name": "count", "initial": 0 }],
  "nodes": [
    { "kind": "element", "id": "h0", "element": "main", "parent": null },
    { "kind": "element", "id": "h1", "element": "h1", "parent": "h0" },
    { "kind": "text", "id": "h1:text0", "parent": "h1", "parts": [{ "text": "Counter" }] },
    { "kind": "element", "id": "h2", "element": "button", "parent": "h0" },
    { "kind": "text", "id": "h2:text0", "parent": "h2", "parts": [{ "text": "Count " }, { "cell": "state:count" }] }
  ],
  "events": [{ "host": "h2", "event": "activate", "handler": "handler:event:0" }],
  "handlers": [{ "id": "handler:event:0", "ops": [{ "op": "add", "cell": "state:count", "value": 1 }] }]
}
```

- **Nodes** are in document order; a parent precedes its children. Element ids are the compiler's host ids (`h0`...), the same
  ids the web payload and Dragon use. A text node is one run of adjacent static text and bound values inside one element;
  its id is `<element>:text<n>` (n counts text runs in that element), which is also Dragon's text node id.
- **Text parts:** `{ "text" }` is literal; `{ "cell" }` (and `{ "expr" }`) is the value formatted as the web writes text
  (`marklessCsrText` in `@markless/web`): `null` is the empty string, anything else JavaScript's `String(value)`, so `false`
  reads "false" exactly as on the web
  (so integer `1` is `"1"`, never `"1.0"`; hosts must implement this exactly; non-integer numbers are refused in v0).
- **Events** are semantic. Authored `onClick` lowers to `activate`. Platform mapping (owned by each adapter): web `click`,
  iOS `UIControl.Event.touchUpInside`, Android `View.OnClickListener`.
- **Handlers** are lists of ops, and there is one op: `{ op: 'assign', cell, value: <expr> }`. The analyzer records the
  handler body as statements (`SemanticEvent.handlerStatements`); `x++` arrives as `x = +x + 1`, `x--` as `x = +x - 1`,
  `x += e` as `x = x + e`. Ops run in order, each value evaluated before its write. A body with anything outside the
  expression tree (a call to author code, `await`, a loop, an array or object value, a member write) is refused at build
  time with the construct named, e.g. "the click handler uses a call to `console.log`, which needs a script engine".
  That refusal list is how we will know when a JavaScript engine is needed. (This replaces the earlier `add`/`set`/`toggle`
  ops, per the planner's steer: one tree, not one op per source shape.)
- **Expressions** (`NativeExpr`) carry JavaScript meaning exactly, and the reference runtime defines it by running
  JavaScript: `{ cell }`, `{ literal }` (string, number, boolean or null), `{ unary: '!'|'-'|'+', value }`,
  `{ binary: '+'|'-'|'*'|'/'|'%'|'==='|'!=='|'<'|'<='|'>'|'>=', left, right }`, `{ logical: '&&'|'||'|'??', left, right }`
  (short-circuit, returns an operand), `{ if, whenTrue, whenFalse }`, `{ template: [string | expr, ...] }`,
  `{ member: expr, property: 'length' }` (strings only; any other value is a runtime error) and
  `{ call: 'String'|'Number'|'Boolean'|'Math.abs'|'Math.floor'|'Math.max'|'Math.min'|'Math.round', arguments }`.
  Hosts must reproduce ECMAScript number-to-string (`0.3333333333333333`, `1e+21`, `-0` reads `0`, `NaN`), `+` concatenating
  when either side is a string, ToNumber for strings (`Number('5x')` is NaN), `Math.round` rounding half up. The vector file
  `arithmetic.json` pins these. Arrays, objects, arrow functions and row reads join the tree with rung 6.
- **Storage:** a cell may have `storage: { key }`: the host reads the kept value at mount (iOS `UserDefaults`, Android
  `SharedPreferences`; absent means `initial`) and writes it after every op that changes the cell. Values are strings,
  numbers or booleans as the cell holds them.
- **Journal:** after a handler, the runtime emits `{ "op": "text", "node": "h2:text0", "value": "Count 1" }` for each text
  node whose string changed, in document order. Hosts apply journal entries to their retained views and do nothing else to
  them. The TypeScript reference runtime in `packages/mobile/src/runtime.ts` defines the expected journal; each host must
  reproduce the conformance vectors byte for byte.

### Additions for rungs 4 and 5 (pushed 2026-11-17)

- **Expressions**: see the expression tree above. The analyzer records it on template reads (`SemanticTemplateRead.expression`) and plain `@if` tests (`SemanticBranchSite.testExpression`).
- **Text parts** may be `{ expr: e }`, formatted like a cell (`String(value)`).
- **Element `bindings`**: `[{ attribute, value: e }]`. A class that follows state is the attribute `class` with
  `{ if: test, whenTrue: { literal: 'like on mk-x' }, whenFalse: { literal: 'like mk-x' } }` (scope class included). The written
  value follows the web's rule exactly (`marklessAttributeValue` in `@markless/web/dom-attribute`, which the reference
  runtime imports): `null`, `undefined` and `false` are absent, except names that spell false (`aria-pressed`,
  `aria-expanded`, `aria-checked`, `aria-selected`, `aria-disabled`... see the file) where `false` is `"false"`; `true` is
  bare (`""`) except `aria-*`/`data-*` and the enumerated names, where it is `"true"`; anything else is `String(value)`.
- **Branches**: `{ kind: 'branch', id: 'branch-site:0', parent, test, arms: 1 | 2 }` sits among its parent's children in
  document order. Its arms' nodes follow it, each with `arm: { branch, index }`; arm 0 is shown while `test` is truthy, arm 1
  (the `@else`) otherwise, none when there is no `@else`. Only plain `@if`/`@else` for now; chains and `@switch` are refused.
- **Journal entries**: `{ op: 'attribute', node, name, value: string | null }` and `{ op: 'arm', node: <branch id>, index:
  number | null }`. For `arm`, the host removes the old arm's views and builds the new arm's nodes at the branch's position,
  from current values; it receives no `text`/`attribute` entries for nodes that were not shown both before and after.
  Entries come in document order.
- **Vectors** add, when non-empty, `initialAttributes: [[node, name, value]]` and `initialArms: [[branch, index]]`. New files:
  `attributes.json` (rung 4) and `if.json` (rung 5), built from the ladder's own `App.tsrx`.
- **Host mapping for bound attributes**, per platform: `aria-label` to `accessibilityLabel` / `contentDescription`;
  `disabled` present to `isEnabled = false` on both; `aria-pressed`/`aria-selected` `"true"` to the selected trait /
  `isSelected`; `aria-expanded` to the expanded state (`accessibilityValue` on iOS, `AccessibilityNodeInfo` expanded state
  on Android). `class` is not applied by hosts as text: it selects the element's Dragon style (below). Unknown bound
  attributes are ignored by hosts, not errors, so web-only attributes do not break a build.
- **Styles that follow state: Dragon's `dragon.native-style-export/1`** (the native-dragon-styles design replaces the
  class-variant idea; adopted). Each target has `states` (`[{ key, domain }]`), `assignments` (each a complete node list
  with its `values`), `initial` and `next[a][s][v]`. Markless side: a cell a class binding reads is marked `styled: true`
  in the payload; after each handler the journal starts with `{ op: 'state', cell, value }` for every styled cell that
  changed (cell order); the host moves to `next[current][s][v]` (the export's state `s` is the one whose key names that
  cell) and applies that assignment's frames and writes to the retained views. Hosts ignore `attribute` entries for
  `class`. The style input gives Dragon `states: [{ cell, domain: [false, true], initial }]` and, per element,
  `classByState: [{ when: { <cell>: boolean }, value }]`; non-boolean styled cells are refused for now.

### Additions for rung 8: text input (pushed 2026-11-17)

- `input` joins the portable elements: iOS `UITextField`, Android `EditText`; its accessible name is `aria-label`.
- Semantic event `input` (iOS `.editingChanged`, Android a `TextWatcher`), dispatched with the field's whole text:
  action `{ event: 'input', host, value }`. In its handler, `event.currentTarget.value` (or `event.target.value`) lowers
  to the expression `{ event: 'value' }`; any other read of the event is refused.
- An element binding may be `{ property: 'value', value: expr }`. Journal entry `{ op: 'property', node, name: 'value',
  value: string }` (`String(value)`, null reads `''`). The runtime never journals the edited field's own value when it
  already equals what was typed, so a host does not write back into the field under the cursor; another handler that
  changes the cell (rung 8's `Use Bo`) does journal it.
- Vectors: `initialProperties: [[node, 'value', text]]` when present; new file `input.json`.

### Several expressions in one text run, and state inside child components (pushed 2026-11-17)

- The analyzer now records each text interpolation's expression on its markup slot (`nativeExpression`, native builds
  only), so `{title} is {open ? 'open' : 'shut'}` in one element lowers to one text node with several parts, as the web
  renders it, instead of being refused.
- A component's own `state()` gets one set of cells per instance, ids prefixed by the call site
  (`component-edge:0/state:open`); module-level state (a top-level `storage()`) stays one shared cell. Refused for now:
  `storage()` declared inside a child component, and top-level state in an imported module.
- Text formatting: `null` renders as empty text (the web's rule); vectors are unchanged.

### `@else if` chains and `@switch` (pushed 2026-11-17, after rung 10)

- A branch node has either `test` (a plain `@if`, unchanged) or `tests`: one per arm, in arm order, `null` for the
  `@else` or `@default` arm. The arm shown is the first one whose test is truthy, else the `null` arm, else none. A
  `@switch` case's test is `{ binary: '===', left: <discriminant>, right: <case> }`, so `@default` applies wherever it is
  written, as in JavaScript. A chain with no `@else` ends with an empty arm whose test is `null`, so "none matched" shows
  nothing. The analyzer records the tests as `SemanticBranchSite.armTestExpressions` (native builds only).
- Vectors: `choices.json`. Hosts: implement `tests`; nothing else changes (`arm` journal entries as before).

### Additions for rung 6: keyed lists (pushed 2026-11-17)

- **Values:** a cell's `initial` may be any JSON (`NativeValue`): arrays and objects too.
- **Expressions** gain `{ array: [{ spread, value }] }`, `{ object: [[key, expr]] }`, `{ member: expr, property }`
  (`length` of a string or array, or an own property of an object; anything else is a runtime error),
  `{ method, target, arguments }` for `filter`, `map`, `findIndex`, `some`, `every`, `includes`, `indexOf`, `join`,
  `concat`, `slice`, `reverse` (only on a fresh array such as `[...list]`; reversing state in place is refused),
  `toReversed`, `toUpperCase`, `toLowerCase`, `trim`, all with JavaScript meaning (a method giving `undefined` is a runtime
  error); `{ lambda: [params], body }` only as a method argument, its parameters read as `{ local }`; and `{ item: <repeat
  id> }`, the current row's item.
- **List region:** `{ kind: 'repeat', id: 'repeat:0', parent, list: { cell }, key: ['id'] }`. The row template's nodes
  follow it with `row: 'repeat:0'`. Each row is an instance keyed by `String()` of the item at `key`; an instance's id is
  `<node>@<key>` (`h6:text0@pear`). Not yet: `@empty`, a list inside an arm or another list, `@if` inside a row, and
  handlers on row elements (each refused by name).
- **Journal:** `{ op: 'rows', node: 'repeat:0', keys: [...] }` when the key order changes: remove rows whose key left,
  build new rows from current values, move the rest into this order. `text`/`attribute` entries for kept rows name the
  instance (`h6:text0@pear`).
- **Vectors:** `initialRows: [[repeat, keys]]` when present; new file `list.json` (rung 6: add, remove, reverse). Text
  nodes in rows appear in `initial` as instances.

### Additions for rung 7: child components (pushed 2026-11-17)

- A component defined in the same module is **inlined at each call site**: its nodes appear in the parent's place with
  ids prefixed by the call site (`component-edge:0/h2`, `component-edge:0/h1:text0`); handler ids likewise
  (`handler:component-edge:0/event:0`). Hosts see one flat tree, as before; no new node kind.
- Props are substituted at build time: a literal prop becomes `{ literal }`, a prop bound to state becomes `{ cell }`.
  A callback prop called from the child (`onClick={() => onStep()}`) lowers to the caller's own statements, so the
  child's handler is the parent's `assign` ops. The analyzer records callback bodies (`nativeStatements`) and `name()`
  calls (`invoke` statements) for native builds only.
- **Components imported from another file (rung 7b, pushed 2026-11-17):** `compileNativeComponent({ ..., readModule })`
  analyzes each relatively imported module (`./Stepper.tsrx`) and passes its analysis to the pass, which builds the
  imported component in place exactly like a same-file one (ids prefixed by the call site; props and callbacks
  substituted). File access is the caller's `readModule(specifier, importer)`; the harness and the ladder's reference
  test pass `readRelativeModule` from `src/harness/rung.ts`. Without a reader, or for a package import other than the
  router's `Link`, the component is refused by name. Tested in `packages/mobile/test/conformance.test.ts`.
- Not yet (each refused by name): state declared in a child or imported component (instance-local cells), children
  passed into a component (`{children}`), components from packages, a callback called with arguments or used as a value.
- Vectors: `components.json` (rung 7).

### Additions for rung 10: routes and the URL (pushed 2026-11-17)

- A page compiles with its page file (`compileNativeComponent({ ..., page: 'pages/[fruit].tsrx' })`); the router's own
  `buildRouteManifestFromFileIds` derives its route. The payload carries `route: { pattern: '/[fruit]', params: ['fruit'] }`.
- The page component's `params` prop reads the expression `{ route: 'params' }` (an object of strings), so
  `params.fruit` is `{ member: { route: 'params' }, property: 'fruit' }`. Hosts open a page with params: the harness's
  launch argument `route: "/apple"` is matched against the payload's `pattern` (a `[name]` segment matches one path
  segment, URL-decoded; catch-all routes are not used yet).
- A router `<Link href="/[fruit]" params={{ fruit: 'pear' }}>Go to pear</Link>` lowers to an `a` element (link trait on
  iOS, `accessibilityClassName` `android.widget.Button` with a link role description on Android) holding its children,
  and an `activate` handler with the op `{ op: 'navigate', route: '/[fruit]', params: { fruit: 'pear' } }`, resolved at
  build time (the link's href and params must be fixed at build time). The journal entry `{ op: 'navigate', route, params }`
  tells the host to build that page from scratch with those params; ops after it do not run.
- One page per payload for now; an app's route table (several pages, back stack, presentation) is the next step.
- Vectors: `route.json` (opens with `params: { fruit: 'apple' }`).

### Where the native facts are collected (pushed 2026-11-17)

The expression trees (`SemanticTemplateRead.expression`, `SemanticBranchSite.testExpression`,
`SemanticEvent.handlerStatements`) are collected in the same analysis walk, but only when the build passes
`nativeFacts: NATIVE_FACT_COLLECTORS` (`compileNativeComponent` does). Web and in-browser compiles neither run nor bundle
that code: the docs pages load the compiler in a worker, and collecting the trees for every compile grew every docs page
by about 500 B gzip (perf-guards G16). Static text and attribute positions stay unconditional (small, and kept out of
the browser's render-data module).

### Building a payload and the conformance vectors (pushed)

- Compile: `compileNativeComponent({ filename, source })` from `@markless/mobile` (`packages/mobile/src/compile.ts`) returns
  `{ passId: 'native-view', payload, diagnostics }`. `payload` is `null` whenever there is a diagnostic (code
  `MARKLESS_NATIVE_UNSUPPORTED`, one per construct with no native lowering yet: child components, `@if`/`@switch`, `@for`,
  `@try`, `attach`, non-text bindings, handlers that read the event, are async, or do more than write state, and events other
  than click). The pass itself is `createNativeViewPayload(semanticGraph)` in `packages/compiler/src/passes/native-view.ts`.
- Reference runtime: `createNativeRuntime(payload)` in `packages/mobile/src/runtime.ts`: `texts()` gives every text node's
  string in document order; `dispatch({ event: 'activate', host })` runs the handler's ops and returns the journal.
- **Vector file** (`markless.native-conformance/0`), one JSON per component under `packages/mobile/conformance/<name>.json`,
  written by `nativeConformance(payload, actions)`:

```json
{
  "version": "markless.native-conformance/0",
  "payload": { "version": "markless.native-view/0", "...": "the payload above" },
  "initial": [["h1:text0", "Counter"], ["h2:text0", "Count 0"]],
  "steps": [
    { "action": { "event": "activate", "host": "h2" }, "journal": [{ "op": "text", "node": "h2:text0", "value": "Count 1" }] },
    { "action": { "event": "activate", "host": "h2" }, "journal": [{ "op": "text", "node": "h2:text0", "value": "Count 2" }] }
  ]
}
```

  Committed files today: `counter.json`, `switches.json` (boolean and string formatting, and a step whose journal is
  empty because the text did not change), `arithmetic.json` (number formatting and coercion), `attributes.json` (rung 4)
  and `if.json` (rung 5). A host must pass every file in
  the folder; a new op or node kind always arrives with a new vector file first.
  A host passes the vectors when, loading `payload`, its mounted text nodes read exactly `initial` (same order) and, for each
  step in turn, dispatching `action` makes its runtime produce exactly `journal` (same entries, same order) and its views then
  show those strings. Hosts run this headless in their own unit tests (XCTest / a JVM test with no device) and may also run it
  in-app behind a launch flag. `packages/mobile/test/conformance.test.ts` fails if the committed vectors drift from what the
  compiler and the reference runtime produce.

### Element to view (per platform, rungs 1 to 3)

| Element | iOS (UIKit) | Android (Views) |
|---|---|---|
| any non-control element (`main`, `div`, `h1`, `p`...) | `UIView` | `FrameLayout` |
| `button` | `UIButton(type: .custom)`, trait `.button` | `android.widget.Button` with platform styling cleared (no background drawable, no min size, no all-caps, no state animator) |
| text node | `UILabel` child of its element (`isUserInteractionEnabled = false`) | `TextView` child (`includeFontPadding = false`, not clickable) |
| `h1`...`h6` | `.header` accessibility trait | `isAccessibilityHeading = true` |

Answered requests (native-android-host, 2026-11-17):

- **A button's text on Android:** confirmed. A `button` whose content is exactly one text run takes that run as the
  `Button`'s own text; a button with an element child or a second run is a loud host error for now. When a rung needs such
  a button, the Android cell becomes a `FrameLayout` with `accessibilityClassName = android.widget.Button`, clickable and
  focusable; this file will say so first. iOS keeps a `UILabel` inside the `UIButton` (UIKit allows children).
- **Units in the style export:** frames and `borderWidths` are device px; every length *inside a write*
  (`font.size`, `border-radius` lengths, and any later write) is CSS px, so hosts multiply by the target's `dpr` (Android)
  or use it as points (iOS, where 1 CSS px = 1 pt). Dragon's export will say so per field.
- **`html` and `body` in the export:** they are Dragon's document wrapper, not payload nodes. Hosts skip any export node
  the payload does not name, add its frame offset to its children, and never apply its writes. The screen behind the
  root is the platform's default background.
- **Pixel ratio:** one export per target device (the export already has one entry per target); a host refuses an export
  whose `dpr` differs from the screen's by more than 0.001.

Answered requests (native-ios-host, 2026-11-17):

- **1, 2, pixel ratio:** as answered for Android above (write lengths CSS px; wrapper boxes only offset; 0.001).
- **3, text frames after a journal entry:** keep the build-time frame and never resize, for now. The real answer is
  linking Dragon's on-device layout engine (generated Swift/Kotlin, `packages/layout/generated/`) and re-laying out after
  text entries; that is a later rung, listed in the owner note.
- **4, `activate` on a non-button:** hosts support it: iOS adds a `UITapGestureRecognizer` and the `.button` trait;
  Android sets a click listener and `accessibilityClassName = android.widget.Button`. The compiler does not refuse it.
- **5, element names:** the compiler refuses them, once, for both hosts (below), so hosts need no list of their own; a host
  may still refuse defensively.
- **6, test ids:** adopted. Node ids are the test ids on both platforms (iOS `accessibilityIdentifier`, Android the id
  Maestro's `id:` matches). Flows may match by text or by id. A button's accessibility label is its text runs joined; text
  inside a button is not its own accessibility element; text in `h1`-`h6` carries the header trait.
- **7, `@markless/core` devDependency:** kept.
- **8, fonts:** every `font` write must name a face listed in `fonts`; anything else is a host error. Ahem appears only in
  Dragon's own fixtures.
- **9, `synthetic-bold` and `anonymous`:** Dragon's definitions apply (native-dragon-styles documents them); until then
  refusing is right.
- **10, export `/1`:** adopted, with the `state` journal entry above.

Answered requests (native-proof-harness, 2026-11-17): **1** the harness row is in the table above. **2** the host entry
points it calls (`MarklessViewController(payload:style:fonts:)`, `MarklessActivity` with `payloadBytes()` and
`styleExportBytes()`) are the contract; a host that changes one says so here first. **3** one app id on both,
`dev.markless.proof`, adopted. **4** `flowSteps()` in `proofs/ladder.ts`, adopted. **5** `fonts[].file` in a Dragon export is
relative to the root of the Dragon checkout it came from (`vendor/fonts/...`); the harness's SHA-256 check stays. **6**
routes at launch arrive with rung 10. **7** rung screenshots are committed under `proofs/<rung>/screenshots/{ios,android}/`.

**Portable elements (compiler-checked).** A native build accepts `main`, `div`, `section`, `article`, `header`, `footer`,
`nav`, `aside`, `h1`-`h6`, `p`, `span`, `b`, `strong`, `em`, `i`, `ul`, `ol`, `li` and `button`; any other element is
refused with `MARKLESS_NATIVE_UNSUPPORTED` naming it. Rungs add to this list (`input` with rung 8).

Rungs 1 and 3 run without Dragon: hosts stack children vertically (start-aligned, system font, platform default size). This
is a temporary layout so the state rungs do not wait on styling; rung 2 replaces it with Dragon frames.

### Styles through Dragon (rung 2), as far as known

Proven tonight in the Dragon worktree (`examples/markless-counter/tools/export.ts`): Dragon compiles the component's CSS and
element tree for `ios` and `android` and emits, per node id, the lowered writes in each backend's vocabulary (background
colour, border widths/styles/colours, corner radii, font face and size, text colour) plus each box's frame from Dragon's
layout engine at the device's viewport and pixel ratio. File: `dragon.native-style-export/0`, units device pixels, frames
relative to the parent box, font faces named by the SHA-256 of the bundled file (Inter Regular and Bold from Dragon's
vendored fonts). Chrome check (`examples/markless-counter/tools/chrome-compare.ts`): every box of the counter matches Chrome
at iPhone 402 pt @3x and Pixel 411 dp @2.625 within Dragon's 1-device-pixel gate (largest difference 0.0005 device px). This
compares Dragon's build-time layout with Chrome, not the device's pixels.

#### The handoff, both directions (pushed on the Markless side)

1. **Markless to Dragon, `markless.native-style-input/0`.** `nativeStyleInput(build.payload, build.styles)` in
   `packages/mobile/src/style-input.ts`, all from compiler facts:
   `{ version, component, nodes: [{ kind: 'element', id, element, parent, attributes } | { kind: 'text', id, parent, text }], css }`.
   `attributes.class` is the class as written to the element, including the component's scope class (`tap mk-uclxwk`);
   `text` is the text node's string at mount (`Count 0`); `css` is the compiler's scoped CSS for the module, the same text
   the web build ships (`.tap.mk-uclxwk { ... }`). There is no `html`/`body`: Dragon wraps the tree in its own document
   (zero body margin, the configured font map: `sans-serif` and the initial font pinned to "Dragon Sans" until the owner
   picks fonts). Ids are the payload's ids; Dragon must use them unchanged for elements and for text nodes (`h2:text0`).
2. **Dragon to Markless, `dragon.native-style-export/0`** (as exported tonight by `examples/markless-counter/tools/export.ts`):
   `{ schema, units, compiler, source, warnings: [{ code, message }], fonts: [{ id, file }], targets: { ios, android } }`,
   each target `{ backend: 'uikit' | 'android-views', viewport: { width, height }, dpr, nodes: [...] }`, each node
   `{ id, parent, kind: 'element' | 'text' | 'anonymous', native, text, frame: { x, y, width, height } | null, borderWidths:
   { top, right, bottom, left } | null, writes: [...] }`. All lengths in device pixels; frames relative to the parent box.
   `writes` are Dragon's lowered writes minus its internal notes: each has `kind` and `key` (the backend property) plus its
   values. Kinds seen so far: `background-color { color }`, `border-widths`, `border-styles { styles[4] }`,
   `border-colors { colors[4] }`, `border-radius { lengths[8] }`, `font { font: { family: <face id>, size } }`,
   `text-color { color }`, `synthetic-bold`; colours are `{ r, g, b, alpha }` 0 to 255. A face id is
   `sha256:<hex of the font file>` and `fonts` maps it to the vendored file the app bundles.
3. **How a build obtains it (planner's decision for tonight, 2026-11-17):** the proof harness generates the export at
   proof time; nothing is committed and nothing is hand-written. For a rung with styles it writes `native-style-input.json`
   from the compiler's facts and runs Dragon's command from a sibling checkout:
   `pnpm --silent --dir "${MARKLESS_DRAGON_DIR:-$HOME/wt/dragon/native-dragon-styles}" run markless:style-export --
   native-style-input.json native-style.json` (`packages/mobile/src/style-export.ts`). The input is the file
   `nativeStyleInput` writes, unchanged. No Markless `package.json` depends on Dragon. If the checkout lacks the command,
   or Dragon refuses the styles (exit 1 with reasons), the harness refuses the rung and prints Dragon's reasons. Fonts are
   read from the same checkout and checked against their `sha256:` ids. **Format:** `dragon.native-style-export/1` as
   `docs/markless-native-styles.md` on the Dragon branch `cw/native-dragon-styles` defines it (`6a1c258671`): per target
   `backend`, `viewport`, `dpr`, `readiness` (Dragon's verdict on its own device lanes; hosts read past it), `states`
   (keyed by cell id, e.g. `state:liked`), `initial`, one full node list per assignment, and `next[a][s][v]`. Known limits:
   Dragon refuses a node inside an `@if` arm or a `@for` row, and non-boolean states, so styled rungs with those are
   refused by name for now. Dragon's Chrome comparison of the export: rung 2, 14 boxes; rung 4, 36 boxes; none outside
   1 device px. How Markless depends on Dragon later (workspace link or prerelease package) is an owner decision.
4. **Hosts:** apply writes by `kind`; fail loudly on a kind they do not implement; place views by `frame` inside their parent
   (absolute), scaling device pixels by the screen scale (iOS points = px / 3 on the proof device, Android uses px); refuse
   to run if the device's scale differs from the target's `dpr`. Text keeps Dragon's frame; after a journal entry the
   frame is not recomputed yet (on-device layout is a later rung), which is visible only when text width changes.

## 5. The ladder

Each rung: a real `.tsrx` compiled by the real compiler, the same Maestro flow green on the iOS simulator and the Android
emulator, the web build of the same component as the reference. A rung green on one platform only is not passed.

Columns: **Web** is `packages/mobile/test/ladder-web.test.ts` (builds each rung as a real router app and drives it in
Chromium; heavy lane). **Native reference** is `packages/mobile/test/ladder-native-reference.test.ts`: the real compiler's
payload run through the reference runtime by a mirror host that changes what it shows only through journal entries,
checked against the same `expected.json`; "refused" means the compiler refuses the rung by name. Neither is a device
result. **iOS** and **Android** pass only with the rung's Maestro flow green on the simulator and the emulator.

| # | Rung | Web | Native reference | iOS | Android | Notes |
|---|---|---|---|---|---|---|
| 1 | Static elements and text | passing | passing | **passing** | **passing** | screenshots in `proofs/01-static-text/screenshots/` |
| 2 | Styles through Dragon | passing (texts, counter) | passing (texts, counter) | **passing** | **passing** | harness verdict passed on both; export made at proof time by Dragon's `markless:style-export`; styled screenshots in `proofs/02-styles/screenshots/` |
| 3 | A state write updates text | passing | passing | **passing** | **passing** | vectors `counter.json` |
| 4 | Attributes and classes that follow state | passing | passing | **passing** | **passing** (the clipped title is fixed: Android now draws Dragon-styled text at Dragon's unhinted advances) | harness verdict passed on both; the button turns `#ef476f` on tap through Dragon's next style assignment; screenshots in `proofs/04-attributes/screenshots/` |
| 5 | `@if` | passing | passing | **passing** | **passing** | vectors `if.json` |
| 5b | `@else if` chains and `@switch` | passing | passing | not yet (host: branch `tests`) | not yet (host: branch `tests`) | `proofs/05b-choices/`; vectors `choices.json` |
| 6 | Keyed `@for` (add, remove, reorder) | passing | passing | **passing** | **passing** | harness verdict passed on both; vectors `list.json` |
| 7 | Child component with props and a callback | passing | passing | **passing** | **passing** | vectors `components.json` |
| 7b | A component imported from another file | passing | passing | **passing** | **passing** | `proofs/07b-imported-component/` imports `proofs/lib/Stepper.tsrx`; harness verdict passed on both |
| 7c | State inside a reused component, one per instance (with joined text) | passing | passing | **passing** | **passing** | `proofs/07c-child-state/` uses `proofs/lib/Panel.tsrx` twice; harness verdict passed on both |
| 8 | Text input and two-way state | passing | passing | **passing** | **passing** | vectors `input.json` |
| 9 | Storage | passing | passing | **passing** | **passing** | relaunch keeps the value |
| 10 | State from the URL and one route change | passing | passing | **passing** | **passing** | harness verdict passed on both (opens at `/apple`, the link rebuilds the page at `/pear`); vectors `route.json` |
| 11 | Async value with `@try`/`@pending`/`@catch` | passing | refused | not started | not started | stopped by design: owner decision (a declared fetch or a script engine) |

**Device receipt (2026-11-17 05:00, tree `06b410c1a`):** one harness run of rungs 1 to 10 on both platforms, then
`proof verdict`: **"proof passed on iOS and Android"** (Android first, then iOS; devices booted for the run and shut down
after; mini-2, simulator `markless-lead`, iOS 27.2; AVD `markless_native`, Pixel 7, API 36). Reports and the verdict are
committed under `docs/goals/native-targets-api/receipts/2026-11-17-*-rungs-1-to-10.*`; rung 7b's own run is beside them.
Earlier partial runs (also committed) record emulator drops under load (`device offline`), which the harness names as
device failures and never retries.

Compiler side done for rungs 1 and 3: static text positions (`SemanticMarkupChunk.texts`, kept out of the web render-data
module), `SemanticEvent.handlerWriteStatements`, the `native-view` pass (`packages/compiler/test/native-view.test.ts`), the
reference runtime and the counter's vectors (`packages/mobile/test/conformance.test.ts`).

## 6. Decisions open for the owner

- How Markless depends on Dragon before Dragon publishes (a workspace link for local builds, or an npm prerelease).
- How an app expresses a platform difference (the `target` constant is a candidate; nothing is built).
- Whether device lanes run in Markless CI (macOS runners with simulator and emulator) or as Dragon does, on a schedule.
