# combobox — implementation notes

Research: `goals/headless-components/notes/research-combobox.md` (every file of
the Qwik UI combobox, read as structural truth:
`github.com/qwikifiers/qwik-ui`, `packages/kit-headless/src/components/combobox/`).
The naming is QDS's; QDS itself has no combobox.

## Shape

Eleven parts, the owner-trimmed list: `combobox.root`, `.label`, `.input`,
`.trigger`, `.content`, `.item`, `.itemlabel`, `.itemindicator`, `.description`,
`.error`, `.field`. Dropped by owner ruling and not replaced: `empty` (the
consumer's `@empty`), `group`/`grouplabel`, `control` (its two jobs are the
overlay behaviour's), `listbox`/`popover` (one `content`), and `inline` — which
survives as a boolean on the root, never as a part.

One widget family, `comboboxState`, rooted by `combobox.root`, and a second,
`comboboxItemState`, rooted by each `combobox.item`. Both are exported as
`state` and `itemstate` beside the parts, per the owner's namespace ruling.

## Why this is not select

The research note argues it at length; the short version, because the next
reader will ask. The cells overlap — `value`, `open`, `disabled`, `required`,
`name` — and **no behaviour does**:

| | select | combobox |
| --- | --- | --- |
| Focus while showing | roves onto the option | never leaves the field |
| Highlight | none; `:focus` is the highlight | a state cell, `ui-highlighted` |
| Printable keys | a typeahead buffer | the field's own text |
| Click on the chosen option | chooses again, closes | unchooses, stays showing |
| Arrow at the end | stops | wraps when `loop` |
| Keydown owner | `select.content` | `combobox.input` |

So the families share types and nothing else (research §7, option C). A shared
base cannot be rooted by either family under the compiler's own rule
(`shared-seed-pass.ts` `widgetRootComponents`), so building one would rewrite a
green select onto the composition seam. The revisit trigger is concrete: if
`aria-activedescendant` lands and select moves off roving focus, the keyboard
models converge and a shared base is worth re-pricing.

## Deviations from Qwik UI, and the constraint that forced each

1. **No family filter.** Upstream, every item runs a task on the field's text and
   writes `itemRef.value.style.display`. Three reasons that cannot ship: the
   owner's no-DOM-selectors order, the family has no way to read an option's
   text, and hiding rows the compiler rendered is the "runtime rewrites what the
   compiler knew" shape the byte doctrine forbids. The consumer filters their own
   list from `combobox.state().input`. `onEmpty` and the `empty` part go with it.
2. **`value` is required on `combobox.item`, and `label` is new.** Upstream reads
   an item's display text out of `ItemLabel`'s children at pre-render. There is
   no build-time child scan here, so the text arrives as data. `label` defaults
   to `value`, which is why an option whose value already reads like a name needs
   nothing extra.
3. **`inline` is a boolean, not a mode enum**, per the owner's final ruling that
   behaviour switches are spelled like native HTML boolean attributes.
4. **No `displayValue` and no `scrollOptions`.** The first is reachable as
   `combobox.state().input`; the second is behaviour 5.14, deferred with a pinned
   row rather than half-built.
5. **`aria-describedby` names both handles, error first.** `description` and
   `error` stand behind separate handles and the input names them as a list:
   `aria-describedby={[errorEl, descriptionEl]}`. A field that mounts both is
   described by both, error first — standard announcement order, so what is
   wrong is conveyed before the hint, whichever order the two parts are written
   in. A part that was never placed drops out of the list rather than dangling,
   and a field that placed neither carries no attribute at all.
6. **`combobox.field` carries the chosen value, not the option list.** Select's
   shape. `multiple` wants one option per chosen value; see the repeat wall below.
7. **`{...rest}` is spread first**, so a consumer cannot silently overwrite the
   ARIA state.

## The value in the markup

`combobox.item` renders `ui-value={item.value}`. This is the one place the
family puts data in the DOM, and it is worth saying why, because select
deliberately does not.

The highlight is family state keyed by the option's value, and DOM focus never
lands on an option — that is the whole focus model. So when the arrow walk is
handed the live options (through the plural `element()` handle) and picks one,
there is no channel from that element back to the value it stands for. Select
never needs one: it commits through `option.click()` and the option's own
handler reads its own instance. This family does that too for Enter — but
*moving the highlight* is not a click, and it has to name a value.

`ui-`, not `data-`: the owner's ruling forbids `data-*`, and `ui-` is the
family's own vocabulary, already used for anatomy elsewhere (`ui-navbar-item`).
**Open question for the owner:** whether an option's value belongs in the markup
at all, or whether the highlight should wait for the ordered-collection
capability that would let it be named without one.

## One content part, two modes

The owner ruled on 2026-08-23 that `overlay` accepts an instance-constant
conditional value, which is exactly what lets one `combobox.content` be elevated
in popup mode and in-flow when `inline`. **The compiler does not implement it
yet**: `overlayLiteralValue`
(`packages/compiler/src/passes/semantic-graph/overlay-attribute.ts`) returns
`null` for anything but a boolean literal and the caller refuses it as
`MARKLESS_OVERLAY_VALUE_UNSUPPORTED`.

So popup mode is complete — bare `overlay`, `hidden` gating, `onDismiss` closing
on Escape and outside-press, with the trigger collision guarded by pressTarget
identity the way navbar's landed pattern does it — and `inline` writes the same
`overlay` mark. The consequence is exactly one: an inline list enlists in the
overlay stack, which the ruling says it never should. Nothing a person
experiences changes, because the dismissal handler ignores the report when
`inline`. `combobox.browser.ts` carries the pinned row `an inline list carries no
overlay mark and never enlists`, and it turns red the day the capability lands.

The overlay module already anticipates this: *"An element with no `hidden`
binding at all - the inline shape - therefore never enlists whatever it looks
like, which is what will make a future `inline` mode free."* The binding is what
this family cannot make conditional, not the mark alone.

## What the compiler forced — measured on this tip

Everything below was measured by running the suite, not assumed.

1. **A keyed repeat does not follow its source, when the rows root widgets.**
   This is the sharpest finding in the unit and it is what pins the consumer
   filter. Measured twice, both shapes red in CSR and SSR:
   - source a `computed()` over the adopted instance
     (`scenarios/filtered.tsrx`);
   - source a plain `state()` array rewritten from the family's own `onInput`.

   In both, **the array itself updates** — the page renders `matches.length` and
   it goes from `4` to `2` as the field is typed in, which is the green row
   `the consumer's own filter recomputes as the field is typed in` — while the
   `@for` keeps all four rows in the DOM. The rows root a widget each
   (`combobox.item`), which is the one thing this shape has that the landed
   repeat witnesses under `packages/vitest-browser/browser/` do not: those
   sources are `state()` arrays whose rows hold plain elements or a composed
   family, and they reorder rather than change length. **The family's whole
   reason to exist is a filtered list, so this is the top-priority framework
   follow-up out of this unit.**

2. **A module-level `const` read from a `computed()` is not carried into the
   lowered symbol.** `const FRUITS = [...]` at module scope, read inside a
   `computed()` in a component body, throws `ReferenceError: FRUITS is not
   defined` at the first refresh (from `refreshSyncComputed`). The data is
   written inside the computed instead.

3. **A repeat cannot be sourced from a shared instance.**
   `@for (const one of combobox.chosen; key one)` inside `combobox.field` —
   `chosen` being a `computed()` on the instance — compiles with no diagnostic
   and throws `ReferenceError: combobox is not defined` at render. That is why
   the field ships select's single-option shape and `multiple` submits only
   through the visible parts. Pinned nowhere yet: the field row asserts the
   single-value contract, and this note is the record.

4. **A lazily loaded keydown handler runs after the browser has already edited
   the field.** `removeOnBackspace` needs "was the field empty *before* this
   keystroke", and reading `event.target.value` in the keydown answers the state
   *after* the deletion — so the very first backspace gave a chosen value back.
   The family's own `input` cell still holds what the last input event reported,
   which is exactly the pre-keystroke text, so that is what the flag reads. Cells
   across two events work; the DOM does not.

5. **A page's own submit handler is a lazily loaded symbol.** The suite's submit
   helper polls rather than reading the output on the next line.

6. **A three-handler widget-root part works.** `combobox.item` carries `onClick`,
   `onFocus` and `onPointerover` and all three run, in CSR and after resume.
   Defect 57 (a widget-root element honouring only its first handler) does not
   reproduce here, which matches select's re-measurement.

7. **Multi-parameter shared methods work.** `choose(next, label)` is arity two
   and the handler runs to completion. Select's note records the opposite from an
   older tip; this family is the counter-measurement.

## Keyboard model

On the field, and only on the field — the trigger is `tabindex="-1"` and the
options are never focused, so there is one keyboard owner in this family.

`ArrowDown` from a closed list shows it on the first enabled option; `ArrowUp`
shows it on the **last** — that asymmetry is Qwik UI's own. With the list
showing, the arrows step one enabled option and `loop` decides whether the ends
wrap. `Home` and `End` are absolute moves in the same walk. `Enter` takes the
highlighted option **through that option's own click rule**, so one place in the
family reads a value and one place decides whether the list closes. `Escape`
closes and leaves the value untouched; in inline mode it is a no-op, which is
what upstream asserts. `Tab` closes and keeps its native move. `Backspace`
records the pre-keystroke emptiness for `removeOnBackspace`.

**Printable keys are absent on purpose.** Typing belongs to the field: there is
no typeahead buffer, no `Alt+ArrowDown`, and no all-same-character cycling. That
is the rule most likely to be got backwards by whoever writes this family and
select in the same week.

**Clicking the option that is already chosen unchooses it and leaves the list
showing.** Qwik UI's deliberate quirk, two upstream tests assert it, and this
suite carries it in both modes so nobody "fixes" it later.

## What a handler reaches, and what it does not

This family makes no DOM query. Nothing calls `querySelector`,
`querySelectorAll`, or `closest`. Every element a handler touches arrives as an
`element()` handle read off the handler's own widget instance: `inputEl`,
`triggerEl`, `contentEl`, `labelEl`, `descriptionEl`, `errorEl`, and `optionEls` — one
array-typed handle bound on every option, read back as the live options in
document order. `option-walk.ts` is plain functions handed those options.

`aria-activedescendant` is the one thing that cannot be reached. The compiler
leaves it out of `IDREF_ATTRIBUTES` deliberately
(`packages/compiler/src/passes/semantic-graph/idref-attributes.ts`): it names one
row of a live collection and needs per-row identity. The plural handle landed
since that comment was written and answers the ordered walk, but nothing yet
reads ONE row's minted id from an IDREF position. **Until it does, this family's
highlight is visible and inaudible.** `combobox.sr.ts` carries that as a pinned
row rather than as silence, and `combobox.browser.ts` carries the attribute half.

## Rows this family does not carry

- **`@if` and `@for` cannot be direct children of a component tag**
  (`MARKLESS_PARSE_ERROR`), so the filtered scenario wraps its loop in a
  `<div role="presentation">` inside `combobox.content`. Presentational children
  are re-parented in the accessibility tree, so the listbox still owns its
  options.
- **An inline combobox cannot stop a reader saying "not expanded".** Neither
  `aria-expanded` nor `aria-haspopup` is written in inline mode and the browser
  suite proves both are absent, yet the reader still announces "has popup
  listbox, not expanded". That is ARIA's own doing — `role="combobox"` carries an
  implicit collapsed state — and the only way out is to stop being a combobox,
  which the authoring practices forbid. Qwik UI's inline mode announces
  identically. Pinned in `combobox.sr.ts` so nobody spends a second afternoon
  on it.
- **The error part does not drive `invalid`.** Upstream, mounting the error
  component is what makes the whole combobox `aria-invalid`. That is a
  render-phase write to an already-rendered part (defect 31, the same shape
  `radiogroup.error` pins). `invalid` is a root prop here.

## Follow-ups this unit did not take

- The keyed-repeat wall in "What the compiler forced" item 1. Highest priority:
  it is the family's reason to exist.
- `aria-activedescendant` admission, gated on the owner's ordered-collection
  pick.
- Scroll the highlighted option into view (behaviour 5.14). Nothing blocks it —
  it is one `scrollIntoView({ block: 'nearest' })` on the element the walk
  already hands back, plus the `isKeyboardMove` guard this family already
  carries. Scope, not capability.
- Promoting `combobox`, `listbox`, `option`, `notSelected` and `invalid` into
  `test-support/vocabularies.ts`, so `Conveys` can name them like every other
  role. They live in a local table in `combobox.sr.ts`, the same call select
  made; promoting them changes a table every family's driver reads.
