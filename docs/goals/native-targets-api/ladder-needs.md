# What each ladder rung needs from the native payload

Owner: native-ladder (branch `cw/native-ladder`). For the lead. In ladder order: for each rung, what the proof component
does, which semantic-graph facts already describe it, and what `markless.native-view/0` does not carry yet.

## How the facts below were found

Not by text search. I ran the real pass, `buildSemanticGraph` from `packages/compiler/src/index.ts`, on each rung's
`packages/mobile/proofs/<nn>-<name>/App.tsrx` (contract commit `792151cb4`) and read the records it produced. Every fact
quoted below is copied from that output. Files I read to interpret it: `packages/compiler/src/passes/semantic-graph/types.ts`
(the artifact shape), `.../semantic-graph/index.ts` (entry point), the lead's `writeStatementCount` in
`.../semantic-graph/collect-elements.ts`, and the `SemanticEvent` and `SemanticMarkupChunk` types in
`packages/compiler/src/artifacts.ts`. The pass was run with no `routeRoot` flag, so rung 10's page-root facts are not shown.
I did not read the styles pass, so where `<style>` text lives is not answered here.

## The ladder, as proven tonight

Web column: `packages/mobile/test/ladder-web.test.ts` builds each App.tsrx as the page of a real router app (production
build, its own Nitro server), opens it in Chromium and walks the rung's `expected.json`. All 11 pass. Mutation check: with
the last step of every expected.json made wrong, all 11 fail. iOS and Android columns belong to the host workers.

| # | Rung | Web | iOS | Android | Proof |
|---|---|---|---|---|---|
| 1 | Static elements and text | passing | not started | not started | `proofs/01-static-text` |
| 2 | Styles through Dragon | passing (texts only) | not started | not started | `proofs/02-styles` |
| 3 | A state write updates text | passing | not started | not started | `proofs/03-counter` |
| 4 | Attributes and classes that follow state | passing | not started | not started | `proofs/04-attributes` |
| 5 | `@if` | passing | not started | not started | `proofs/05-if` |
| 6 | Keyed `@for`: add, remove, reorder | passing | not started | not started | `proofs/06-keyed-for` |
| 7 | Child component with props and a callback | passing | not started | not started | `proofs/07-child-component` |
| 8 | Text input and two-way state | passing | not started | not started | `proofs/08-text-input` |
| 9 | Storage | passing | not started | not started | `proofs/09-storage` |
| 10 | State from the URL and one route change | passing | not started | not started | `proofs/10-url-route` |
| 11 | Async value with `@try`/`@pending`/`@catch` | passing | not started | not started | `proofs/11-async` |

## One gap that crosses rungs: parenthesized handler bodies

`handlerWriteStatements` is set for `() => count++` and for `() => { liked = !liked; }`, but **not** for
`() => (liked = !liked)`, the style the docs use everywhere. Probe: the same rung 4 component with only the first handler
rewritten as a block gave `[["() => { liked = !liked; }",1],["() => (liked = false)",null]]`. The arrow body is a
parenthesized expression, which `writeStatementCount` does not look through. Rungs 4, 5, 6, 8, 9 and 11 are written that
way, so every handler on them is refused by the v0 rule as it stands. Filed in `requests/native-ladder.md`.

## Rung 1: static elements and text

Covered by v0. Facts: `hostNodes` (`h0`..`h5`: main, h1, p, section, h2, p), `markup.chunks[0].hosts` child-index paths, and
`markup.chunks[0].texts` with each static run. Nothing to add beyond the element map having `section` and `h2` in it (the
contract's table covers both: non-control element and heading).

## Rung 2: styles through Dragon

Facts: the scoped class is resolved (the static HTML reads `class="screen mk-9w8itc"`), but only inside `statics`, the
HTML strings. There is no structured per-host attribute record for a static `class`, and the `<style>` text is not in the
semantic graph's markup.
Payload needs: per element its static attributes (at least `class`, with the scope class), and the component's style sheet
text, so Dragon's input comes from analyzer facts instead of hand transcription (contract section 4 already names this).

## Rung 3: a state write updates text

Covered by v0 (the contract's own example). Facts: `graphBindings` `state:count` initial `0`; `templateReads` `h2`, target
`{ kind: "text", prefix: "Count " }`; `stateWrites` `update` `++`; `events` `click` with `handlerWriteStatements: 1`.

## Rung 4: attributes and classes that follow state

Facts that exist:

- `templateReads` on `h2`: `{ kind: "class", trueValue: "like on mk-1smfzwp", falseValue: "like mk-1smfzwp" }` (the class
  is already resolved to its two possible strings), `{ kind: "attribute", name: "aria-label" }` reading
  `computed:templateExpression:0`, `{ kind: "attribute", name: "aria-pressed" }` reading `liked`; on `h3`
  `{ kind: "attribute", name: "disabled" }` reading `computed:templateExpression:1`.
- The template expressions are `computed` bindings with `dependencies` (`state:liked`) and `functionSource`
  (`() => liked ? 'Unlike' : 'Like'`, `() => !liked`). The expression itself is only source text.
- `stateWrites` `assign` (twice); no record of what value is assigned (`!liked`, `false`).

Payload needs: attribute and class bindings as nodes or node fields (`{ host, attribute, value }`); a small expression form
for values (a cell, a literal, `!cell`, `cond ? a : b` over literals) or a refusal when the expression is outside it;
handler ops beyond `add`: `set` (a literal) and `toggle` (`x = !x`); journal entries for attributes. Per-platform mapping
the hosts own: `aria-label` to `accessibilityLabel` / `contentDescription`, `disabled` to `isEnabled = false` on both,
`aria-pressed` to the selected trait / `isSelected`. The flow asserts the label and `enabled: false`, so these are checked.

## Rung 5: `@if`

Facts: `branchSites` `{ id: "branch-site:0", kind: "if", armCount: 2, testSource: "open" }`; one `markup.chunks` entry
per arm (`branch:branch-site:0:arm:0`, `...:arm:1`, kind `branch-arm`, with their own `statics` and `texts`); the parent
template's slot `{ kind: "branch", branchSiteId, armTemplateIds, coordinate: comment-anchor [0, 2] }`. The button label
is a text slot reading `computed:templateExpression:0` (`open ? 'Hide details' : 'Show details'`).
Payload needs: a conditional region node (parent, position among siblings, test as a cell or the expression form above,
one subtree per arm); journal entries to insert an arm's subtree and remove the other; text parts that read an expression,
not just a cell. Missing as a fact: the test as structured data (only `testSource` text exists).

## Rung 6: keyed `@for` with add, remove, reorder

Facts: `keyedRepeats` `{ parentHostNodeId: "h5", itemName: "fruit", collectionGraphNodeId: "state:fruits", keyPath: ["id"],
rowHostNodeId: "h6" }`; row chunk `repeat:repeat:0:row` with a text slot `{ residue: { kind: "repeat-item", path: ["name"] } }`;
`state:fruits` `valueKind: "array"` with its initial value known.
Payload needs: a list region node (parent element, key path, row subtree, row-relative reads like `item.name`); journal
entries keyed by row key: insert at index, remove, move. The three handlers are array expressions
(`[...fruits, {...}]`, `fruits.filter(...)`, `[...fruits].reverse()`); the analyzer records them only as `assign` with
`handlerSource` text. Either the analyzer classifies these shapes (append a literal, remove where key equals a literal,
reverse) as ops, or v1 refuses them and the rung needs a JS engine for handlers, an owner decision.

## Rung 7: child component with props and a callback

Facts: `componentEdges` (two, `App` to `Stepper`) with typed props: `label` `{ kind: "serializable", value: "Apples" }`,
`value` `{ kind: "graph-reference", graphNodeId: "state:apples" }`, `onStep` `{ kind: "callback", source: "() => apples++",
parameters: [] }`; `componentPropBindings` for `Stepper` (`label`, `value`, `onStep`, with `propPath`); the child's
event on `h2` is `() => onStep()`. The child's text `{label} {value}` became one template expression
(`joinsText: true`, functionSource `` `${(label) ?? ''} ${(value) ?? ''}` ``) rather than parts; `Total {apples + pears}`
reads `computed:templateExpression:1`.
Payload needs: component instances (either inlined per edge with props substituted, which v0's flat node list can carry,
or instance boundaries with prop cells); a callback prop resolved at build time to the parent's handler ops (here, the
child's `onStep()` becomes `add state:apples 1` for the first instance and `state:pears` for the second); multi-part text
(`label`, a literal space, `value`) as parts; computed text (`apples + pears`) via the expression form or a derived cell.
Missing as a fact: `handlerWriteStatements` does not apply to `() => onStep()`; the call-a-callback-prop handler shape needs
its own fact (the analyzer has handler-prop machinery in `handler-props.ts`, which I did not read).

## Rung 8: text input and two-way state

Facts: `templateReads` on the input `h2`: `{ kind: "property", name: "value" }` reading `name`; `events` on `h2`:
`input`, handler `(event) => (name = event.currentTarget.value)`, `handlerParameters: ["event"]`; `stateWrites` `assign`.
Payload needs: an `input` element mapping (iOS `UITextField`, Android `EditText`) with its accessible name from
`aria-label`; a property binding `value` with the rule that the host does not write the field back while it is the source
of the change; a semantic event `input` (iOS `.editingChanged`, Android `TextWatcher`); an op `set` from the event's text.
Missing as a fact: that the assigned value is the event target's value (only `handlerSource` text has it).

## Rung 9: storage

Facts: the binding `storage:<file>#ladder-visits` with `storage: { key: "ladder-visits" }`, `initialValue: "0"`, kind
`state`; the handler assigns `String(Number(visits) + 1)`.
Payload needs: a storage key on the cell; hosts read it before first paint (iOS `UserDefaults`, Android
`SharedPreferences`) and write it on every change; the relaunch step in the flow (`stopApp`, `launchApp`) proves it. The
handler's string-number increment is outside v0's ops: either a `add` on a string cell that holds a number is defined, or
the rung's component should keep a number (storage is string-only in the public API today, `storage(key, fallback: string)`).

## Rung 10: state from the URL and one route change

Facts: `componentPropBindings` `App.params` (`propPath: ["params"]`); `templateReads` `h1` reading `params.fruit` with
prefix `"Fruit "`; `componentEdges` to `Link` from `@markless/router` with `href` `{ kind: "serializable", value: "/[fruit]" }`
and `params` `{ kind: "opaque", buildTimeValue: { value: { fruit: "apple" } } }`.
Payload needs: the app's route table (pattern to page component), route params as read-only cells per page, `Link` as an
activatable element whose op is `navigate` to a resolved path; a host navigation model (replace the page's views, or push
a screen). How a native app opens at a route is a harness choice: the flow passes `launchApp: arguments: { route: "/apple" }`.

## Rung 11: async value with `@try`/`@pending`/`@catch`

Facts: `asyncBoundaries` `{ id: "boundary:0", componentName: "Answer", errorName: "error" }`; `computed:answer` with
`async: true`, `dependencies` (`prop question`) and `functionSource` `async () => answerAfter(question, 2000)`;
a keyed repeat of `Answer` rows (`rowRange: true`) with the edge prop `question` `{ kind: "opaque", rowRead: { repeatId,
path: [] } }`; `error.message` read in `@catch`.
Payload needs: an async region node with three arm subtrees; something the host can run to produce the value. The value
comes from author JavaScript (a local function with `setTimeout`); with no JS engine there is no data form for it. Options:
a declarative async source (a fetch of a URL template, with the response's JSON path) that the analyzer recognises, or a JS
engine for async computeds only. That is an owner decision; until then rung 11 cannot pass on a device.
