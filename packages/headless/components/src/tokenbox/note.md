# tokenbox — implementation notes

Research: `research.md` beside this file. Catalog ruling: `CATALOG.md`, "tokenbox".

## Shape

One widget family, `tokenboxState`, rooted by `tokenbox.root`. Six parts, all
from SPEC's established set:

- `tokenbox.root` — the wrapper and the state home. Holds `value` /
  `defaultValue`, `disabled`, `required`, `invalid`, `multiline`, `triggers`,
  `name`, `onChange`, and the `element()` handles. It carries **no ARIA role**:
  the surface below is the textbox, and a group here would be one more thing for
  a reader to walk past on the way to the field.
- `tokenbox.label` — the name. It reaches the surface through `aria-labelledby`
  and focuses it on click, because `for` cannot target a contenteditable `div`
  (not a labelable element).
- `tokenbox.input` — the editing surface. `contenteditable`, `role="textbox"`,
  and the element that renders the value.
- `tokenbox.description`, `tokenbox.error` — the usual two, error named first.
- `tokenbox.field` — one hidden input carrying the whole value as JSON.

`ui-*` markers are `ui-tokenbox` (root), `ui-editor` (surface), `ui-token` and
`ui-text` (the runs the surface renders). `ui-surface` was NOT reused: ink and
pad already key CSS off it, and a `@layer markless` default keyed on a shared
marker leaks sideways into another family.

## The v1 bet: the browser owns text, the family owns structure

This is the one decision to know before reading anything else.

`segments` — the cell the surface renders from — is written only when the family
changes the *shape* of the value: a seed, an external `value`, a token, a paste.
Ordinary typing writes nothing. The browser edits its own text nodes, and
afterwards the family derives the value back off the DOM with `Range`
arithmetic and reports it through `reported` and `onChange`.

What that buys:

- **The caret never jumps.** A re-render of a contenteditable moves the caret;
  not re-rendering is the only reliable way to not move it.
- **IME works** — nothing mutates between `compositionstart` and
  `compositionend`, which is the entire rule (`research.md` §3).
- **Mobile works** — a word-sized delete, an autocorrect replacement and a
  swipe-typed insertion are all just "the text changed, re-derive". No path in
  this family reads `event.key` to decide what an edit was.
- **Platform undo survives ordinary editing** (see below).
- **Tokens delete as one unit for free** — a `contenteditable="false"` island is
  atomic to the browser's editing engine, so the family writes no delete
  handling at all.

What it costs, stated plainly:

- `segments` goes stale against the DOM between structural changes. Anything that
  needs the current value reads `reported`, never `segments`. `tokenbox.field`
  and any consumer summary read `reported`.
- A structural change re-renders the whole surface and clears the platform undo
  stack for that step.
- The value the family reports is whatever the browser left in the DOM. A
  browser that inserts markup we did not ask for would show up as text, not as
  structure — which is the safe direction, but it is a derivation, not a
  guarantee.

## Controlled, uncontrolled, and the echo

`value` controls; `defaultValue` seeds once. The controlled path has one rule the
consumer has to know, and it is documented on the prop: **hold the value on a
state object and hand back exactly what `onChange` gave you.** The root passes an
array over when it is the one this family emitted (identity, then structural
equality against the last emit), so an echo does not re-render the surface under
the caret. A genuinely different array does re-render — that is what controlling
it is for, and `scenarios/controlled.tsrx` witnesses both halves.

The comparison is made against a plain closure mirror, deliberately not a cell:
a reactive read in the root body would re-run the root on every keystroke.

## Why there is no `item` part

Every other collection family in this package hands the repeat to the consumer.
This one cannot. The surface is a contenteditable the browser is also editing,
and a consumer-authored repeat inside it means consumer markup, consumer keys and
consumer conditionals in the one region where an unexpected re-render loses a
person's caret mid-word.

So the surface renders its own tokens and text runs, and tokens are styled
through `[ui-token]`. `tokenbox.item` is the named follow-up the moment a
consumer needs markup inside a token (an avatar, a status dot) — and it comes
with the constraint the family already relies on: a token's rendered text is its
accessible text, because that is what a reader speaks crossing it and what a copy
of a range spanning it yields.

## Reaching an element without an identity attribute

The family binds two plural handles: `tokenEls` on every token run and `textEls`
on every text run. A segment's index within its own kind IS its position in the
matching roster (`rosterIndex`), because the surface renders in model order and a
roster reads back in document order. That is how the caret reaches the run it
belongs in after an insertion, with no run carrying an id to be found by.

Caret placement is always at a **node boundary** — `selectNodeContents` plus a
collapse, or `setStartAfter` — never at a character offset, so nothing has to
name a text node the browser may have split or merged.

Nothing in `tokenbox.tsrx`, `token-walk.ts` or `token-range.ts` queries the DOM.
The one containment predicate is `surface.contains(node)` on the family's own
handle, asking whether a node the platform named (`Selection.focusNode`) sits
inside the part.

## The synchronous cancel, and why deletion is not in it

`preventDefault()` here has to be decidable before the lazy handler module loads,
from event fields and graph state only. The surface therefore cancels a fixed set
keyed on `event.inputType`, `event.isComposing` and `disabled`/`multiline`:
`insertFromDrop` always, and `insertParagraph` / `insertLineBreak` when the box is
single-line. Paste is cancelled unconditionally in its own handler, because the
clipboard's text is not something the synchronous policy can see.

Deletion is deliberately absent. "Cancel this delete if the caret happens to sit
next to a token" reads the Selection, which the policy cannot represent — and it
does not need to, because the island already deletes as one unit.

## Undo: the choice, made explicitly

**Platform undo, partially.** `document.execCommand` is dead and is not used.
Because the family does not rewrite the DOM while a person types, the browser's
own undo stack stays intact across ordinary typing and deletion. The two
operations that rewrite — `insertToken` and a paste — are not undoable.
`historyUndo` and `historyRedo` are not cancelled, so nothing pretends to own an
undo it does not have.

A state-driven history is the route if this becomes a real complaint. It is not
shipped because it must own *all* undo the moment it owns any; a half-stack that
sometimes defers to the platform is worse than either.

## v1 scope fences

1. **Plain-text paste and drop only.** `text/html` is never read. Images, files
   and rich content are dropped, not degraded.
2. **Single line by default.** `multiline` sets `aria-multiline` and stops
   cancelling `insertParagraph`; paragraph structure is not modelled, so a hard
   break derives back as whitespace.
3. **IME respected by never rewriting during composition.** Nothing derives,
   reports or re-renders between `compositionstart` and `compositionend`.
4. **Undo is the platform's, partially** (above).
5. **No `item` part** (above).
6. **Triggers are single characters, at a boundary, same run.** A trigger is one
   character from `triggers`, at the start of a text run or after whitespace,
   with no whitespace between it and the caret. `a@b` opens nothing; `@ali ce`
   has already closed.
7. **No programmatic selection API.** A consumer can place a token and read the
   caret's trigger context; it cannot select a range.
8. **The anchor rect degrades honestly.** `anchorRect()` spans the trigger run
   when the caret's own node holds those characters, and falls back to the
   collapsed caret rect when it does not — a worse anchor, never a wrong one.
9. **Mobile viewport is the consumer's.** Keeping an anchored popover above an
   on-screen keyboard is not this family's job.

## Form serialization

One hidden input under the root's `name`, carrying the segment array as JSON with
keys omitted:

```json
[{"kind":"text","text":"hi "},{"kind":"token","value":"u_1","label":"Alice Chen"}]
```

Read it back with `JSON.parse` and hand it straight to `value` (or use `parse`
from `token-walk.ts`, which drops anything that is not this shape rather than
guessing). A flat delimited string was rejected: a label may hold any character,
so every delimiter needs an escape scheme, and an escape scheme is a worse
contract than JSON.

## Two rows that pin the substrate rather than this family


`tokenbox.browser.ts` carries two rows whose subject is the browser, and they say
so in place:

- *backspace against a token takes the whole token* — the claim is "as one unit",
  not "in one press". Chromium selects the island first and removes it on the next
  press; Gecko removes it outright. The row asserts what both share: no fragment
  of the label is left behind.
- *the caret steps over a token instead of into it* — one ArrowLeft crosses the
  whole label, because a `contenteditable="false"` island has no interior caret
  positions.

If either ever goes red, the finding is about an engine, not about a regression
here, and it belongs in a witness rather than in a patch to this family.

## Landmine found while building this

A `{/* … */}` JSX comment written as a child of an `@if` block fails to parse:
`TS91001 Markless TSRX parse error: Expected '</' to close the JSX element, but
found '@'`, reported at the enclosing `@for` rather than at the comment. The same
comment one line above the `@for` parses. Worked around here by moving the
comment out; it is a compiler defect worth its own witness.

## Registration

`src/index.ts` exports the family and the scenarios import from `../../index.ts`.
Still outstanding: the `exports` map in `package.json`, and the gallery anchor in
`apps/sr-gallery/preview-server.ts` — `tokenbox-transcript.ts` holds the anchor
as the literal `'/#tokenbox'` with the swap to `FAMILY_ANCHORS.tokenbox` noted at
the constant.

## Four framework rules this family ran into, and what they cost

The ui lane refuses things `pnpm typecheck` cannot see, because the refusals come
from the vite plugin. Recorded here because none of them is discoverable from the
type checker and all four shaped the design.

1. **A handler may not name an `element()` handle inside a larger expression.**
   `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`. Read it into a local on
   its own line first (`const tokens = tokenEls;`) and build from the local. The
   local for a roster consulted after a write must still be read *after* that
   write, or it holds the pre-render array.
2. **A roster may not be indexed by a computed expression.**
   `MARKLESS_STATE_DYNAMIC_PATH_READ` — graph read paths must be statically
   resolvable. Hand the whole roster to a plain module and let it index
   (`elementAt` in `token-range.ts`; taglist's `elementForValue` is the same
   shape).
3. **A `shared()` method cannot be called from another module.**
   `MARKLESS_SHARED_METHOD_CROSS_MODULE` — a method call compiles by copying the
   method's authored body into the caller's handler module, and the definition
   module's imports do not travel with the copy. This is why `tokenbox.itemtrigger`
   exists: a consumer cannot call `insertToken` from their own handler, so the
   family publishes the control that calls it. It is also why the popover anchor
   rect is a field on the `trigger` cell rather than an `anchorRect()` method —
   reads cross module boundaries fine, calls do not.
   A related trap from the same copying: a local named `context` inside a shared
   method collides with a binding the generated symbol module already holds and
   throws `Cannot access 'context' before initialization` at gesture time. Locals
   in shared methods need names that cannot collide.
4. **A component body may seed a shared cell only from its own props or from
   constants.** `MARKLESS_SHARED_SEED_UNSUPPORTED`. `tokenbox.segments = <prop>`
   is legal; `tokenbox.segments = withIds(defaultValue)` is not.

## Known red, and the redesign it needs

**The family compiles and the ui lane runs 40 rows: 10 pass, 30 fail.** Everything
that asserts rendered content fails, because the surface renders empty.

The cause is rule 4 above meeting rule 3. The root currently seeds through
`tokenbox.seed(defaultValue)` / `tokenbox.adopt(value)` — shared-method calls from
an eagerly-rendered component body, which do not take effect, so `segments` stays
empty. Writing the same logic inline in the root is refused by rule 4, because it
derives a local (`withIds(...)`) instead of assigning a prop straight across.

The redesign that fits the framework, not yet done:

- The root assigns `tokenbox.segments = value` directly, taglist-style, with no
  derivation in the body. That means the id-minting the current value model
  depends on cannot happen there.
- So `id` comes off the public segment type, and the surface's repeat keys on
  content plus position instead — computed inside the surface part, where a
  `computed()` is legal. An echo of structurally identical content then yields
  identical keys and patches nothing, which is what protects the caret; a real
  change yields different keys and re-renders. That preserves the v1 bet without
  needing the echo-suppression the root can no longer express.
- `reported` cannot be seeded from the root either, so `tokenbox.field` submits
  an empty value until the first edit. It needs to fall back to `segments`.

The pure value arithmetic in `token-walk.ts` and the Range work in
`token-range.ts` are unaffected by all of this — those rows pass.
