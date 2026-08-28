# tokenbox — research

The catalog entry (`CATALOG.md`, "tokenbox") rules the name and the scope. This file
settles the two things a build needs and nothing else: what the sole reference
implementation actually does, and what each contenteditable landmine costs us —
with the mitigation this v1 ships, or the honest statement that it is deferred.

## Sole reference: React Aria TokenField

<https://react-aria.adobe.com/TokenField>

### Anatomy

One editing surface, not a list. The rendered anatomy is a `role="textbox"`
contenteditable host containing a run of text interrupted by token elements. A
token is not a list item and not a focus stop: it is one atomic glyph inside a
line of text. There is no per-token delete button in the base anatomy, because a
button inside a textbox is not reachable — the textbox owns the caret, and a
tab stop inside it would take Tab away from the field.

The autocomplete popover is a separate widget the consumer composes; TokenField
does not own it. What TokenField owns is the anchoring information: which
trigger character the caret currently sits behind, what has been typed since it,
and where on screen that run is.

### Value model

The value is an interleaved sequence, not a `string[]`. Free text is part of the
value, in order, between tokens. Two consequences that drive everything below:

1. There is no "the tags" and "the input text" — there is one ordered value, and
   the caret is a position inside it.
2. Every operation is a splice on a flattened character space. Insertion,
   deletion and token replacement are all "replace characters `[start, end)`".

### How tokens stay atomic

Three properties, and the reference gets all three from the substrate rather
than from key handling:

- **`contenteditable="false"` on the token element.** Inside a contenteditable
  host, a `false` island is an atomic unit to the browser's editing engine: the
  caret cannot be placed inside it, arrow keys step over it in one press, and a
  backward delete against it removes the element rather than a character.
- **Deletion as a unit, from either side.** Falls out of the above. Chromium's
  two-step behaviour (first press visually selects the island, second removes it)
  and Gecko's one-step behaviour are both "deletes as one unit"; only the press
  count differs, and neither ever leaves half a token.
- **Selection across tokens.** A range that spans a token contains the whole
  token, because a `false` island has no interior selection positions. Copying
  such a range yields the token's rendered text; that is why the token's text
  content must BE its label.

### The findText / DOM-range utilities

The part worth stealing outright. TokenField never walks the DOM tree to work
out where the caret is. It builds a `Range` from the start of the host to the
caret and takes `range.toString().length` — one number, in the same character
space as the value model. The same trick gives each token's occupied span
(`selectNodeContents(host)` + `setEndBefore(token)` for the start,
`selectNode(token).toString().length` for the width).

That is what makes an autocomplete popover anchorable without a tree walk:
`range.getBoundingClientRect()` over the trigger-to-caret range is the rect the
popover is placed against. It is also exactly what this package's DOM-access rule
wants — a Range takes node references, never selector strings, so the family
reaches nothing it did not bind.

## The contenteditable landmine catalogue

One entry per landmine, each with what v1 does.

### 1. Selection and Range management

*The landmine.* Caret positions inside a contenteditable are `(node, offset)`
pairs against whatever text nodes the browser happens to have produced. Typing at
an element boundary can mint a new text node; normalisation can merge two. Any
code that remembers a caret as `(node, offset)` across a re-render is holding a
reference to a node that may no longer exist.

*Mitigation shipped.* The family never stores a `(node, offset)` caret. It stores
a single character offset in the flattened value, computed through a Range
(`token-range.ts` `caretOffset`). It restores a caret only at *node boundaries* —
`selectNodeContents(el)` + `collapse(false)` for "end of this run",
`setStartAfter(el)` for "just past this token" — which are addressable without
naming a text node at all. That is the whole reason token and text runs are both
rendered as elements with handles bound on them.

### 2. beforeinput / input coverage

*The landmine.* `keydown` does not describe an edit. The same visible result
arrives as `insertText`, `insertFromPaste`, `insertFromDrop`,
`insertCompositionText`, `insertReplacementText` (autocorrect), or
`insertFromYank`. A family that reads keys instead of `inputType` silently
mishandles half of them, and every mobile keyboard is in that half.

*Mitigation shipped.* The family listens to `beforeinput` and branches on
`event.inputType`, never on `event.key`, for anything that mutates. It cancels
exactly these classes:

| `inputType` | v1 behaviour |
| --- | --- |
| `insertFromPaste`, `insertFromDrop` | cancelled; the text is sanitised and spliced in through the model (landmine 4) |
| `insertParagraph`, `insertLineBreak` | cancelled when `multiline` is off |
| everything else | **not cancelled** — the browser performs the edit |

`insertText`, `deleteContentBackward`, `deleteContentForward`, `deleteWordBackward`,
`insertCompositionText` and friends all run natively. After the edit lands, the
`input` handler re-derives the value from the DOM and reports it. This is the
central bet of the v1 design and it is stated plainly in `note.md`: **the browser
owns text editing; the family owns structure.**

The alternative — cancel every mutating `inputType` and drive all editing through
the model — was rejected. It requires restoring a character-offset caret after
every keystroke, which is landmine 1 at its worst, and it breaks IME outright
(landmine 3) and platform undo outright (landmine 5).

There is a second, compiler-shaped reason the cancel list is a fixed set of
`inputType` values: `preventDefault()` in this framework must be decidable before
the lazy handler module loads, from event fields and graph state only
(`MARKLESS_SYNC_POLICY_UNEXTRACTABLE`). "Cancel this delete if the caret happens
to sit next to a token" reads the Selection, which the synchronous policy cannot
see. A cancel keyed on `event.inputType` and `event.isComposing` can be.

### 3. IME composition

*The landmine.* Between `compositionstart` and `compositionend` the browser owns a
region of the DOM. Mutating it, re-rendering it, or cancelling the composing
`beforeinput` drops the candidate window, loses the pre-edit string, or commits
garbage. Korean, Japanese and Chinese entry all break, and so does every
swipe/predictive keyboard on Android, which composes.

*Mitigation shipped.* A `composing` flag is raised on `compositionstart` and
lowered on `compositionend`. While it is up:

- the `input` handler returns immediately — no derivation, no `onChange`, no
  trigger recomputation;
- nothing writes the rendered segment cell, so no re-render can touch the region;
- the paste/break cancels carry `event.isComposing === false` in their guard, so
  a composing keyboard is never intercepted.

On `compositionend` the family derives once and reports once. The rule stated as
one line: **never mutate mid-composition.**

### 4. Paste sanitisation

*The landmine.* A default paste into a contenteditable inserts the clipboard's
`text/html`: fonts, colours, nested tags, `contenteditable` islands the family
does not know about, and in the worst case script-bearing markup.

*Mitigation shipped.* Every paste and every drop is cancelled.
`clipboardData.getData('text')` is read, newlines are folded to spaces when
`multiline` is off, and the result is spliced into the model as text. Because the
cancel is keyed on `inputType` alone it is decidable by the synchronous-policy
rule. Rich content, images and files are dropped, not degraded — v1 fence.

### 5. Undo

*The landmine.* `document.execCommand('undo')` is dead: deprecated, unreliable in
Chromium, absent from any spec anyone implements. And the platform's own undo
stack is destroyed the moment JavaScript rewrites the DOM out from under it, so
"just let the browser do it" is only true for an editor that never writes.

*The honest answer for v1, stated as a choice rather than an oversight:* v1 keeps
**platform undo, partially.** Because the family does not rewrite the DOM while a
person types, the browser's undo stack stays intact across ordinary typing and
ordinary deletion, and Cmd/Ctrl-Z does what a person expects. The two operations
that *do* rewrite the DOM — `insertToken` and a paste — are not undoable: they
re-render the surface from the model, which clears the platform stack for that
step. `historyUndo` and `historyRedo` are deliberately NOT cancelled, so nothing
pretends to own an undo it does not have.

A state-driven history (a ring of value snapshots, Cmd-Z restoring one) is the
route if this becomes a real complaint. It is not shipped because it must own
*all* undo the moment it owns any — a half-stack that sometimes defers to the
platform is worse than either. Recorded as the named follow-up in `note.md`.

### 6. Mobile keyboards

*The landmine.* Virtual keyboards compose (see 3), send `deleteContentBackward`
for a whole word, fire `beforeinput` with no useful `key`, and on iOS may not
fire `keydown` at all for character entry. Autocorrect arrives as
`insertReplacementText` over a range the family did not choose. Anything keyed on
`keydown` is broken on a phone.

*Mitigation shipped.* No mutation path in this family reads `event.key`. The
value is derived from the DOM after the fact, so a word-sized delete, an
autocorrect replacement and a swipe-typed insertion are all just "the text
changed, re-derive". `enterkeyhint` and `inputmode` are ordinary attributes the
consumer can pass through `{...rest}`.

*What is not covered:* the visual-viewport dance (keeping an anchored popover
above the on-screen keyboard) is the consumer's, and Android's composing-while-
suggesting behaviour means the trigger context can lag one composition behind on
some keyboards. Named as a v1 fence rather than claimed.

## What v1 defers, plainly

- **No `tokenbox.item` part.** The surface renders its own tokens and text runs.
  A consumer-authored repeat inside a contenteditable that the browser also edits
  is a foot-gun the library should not hand out until there is a consumer who
  needs custom token markup. Tokens are styled through `[ui-token]`.
- **Multiline is a prop, not a feature.** `multiline` sets `aria-multiline` and
  stops cancelling `insertParagraph`. Paragraph structure is not modelled: the
  value model has no line segments, so a hard break derives back as whitespace.
- **No rich paste, no drop payloads, no images.**
- **No token undo** (see 5).
- **No selection API of our own.** A consumer cannot programmatically select a
  range; only the caret placements the family performs after a structural change.
- **Trigger detection is single-character and same-run.** A trigger must be one
  character, at the start of a text run or after whitespace, with no whitespace
  between it and the caret. `@ali ce` stops being a trigger at the space.

## Name mappings against the reference

Divergences from React Aria's spelling, per SPEC's "reference libraries
contribute behavior" rule:

| React Aria | here | why |
| --- | --- | --- |
| `TokenField` | `tokenbox` | owner ruling in `CATALOG.md`; `-box` is the textbox lineage |
| `onChange` over a document value | `onChange` over `TokenBoxSegment[]` | same name, our value model |
| its popover-anchoring utilities | `tokenbox.state().trigger` + `anchorRect()` | one reactive cell plus one method, rather than a utility a consumer wires |
