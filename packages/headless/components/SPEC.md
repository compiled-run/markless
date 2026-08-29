# @markless/ui part-naming spec

Every part name is built from two axes:

- **Component role** — the part's primary purpose. The last word of the name.
- **Semantic prefix** — optional, in front of the role, saying what information or
  scope the part carries.

A part name is `[prefix]role`, all lowercase, one word, no separators. The role
alone names the common case (`modal.trigger`); the prefix narrows it
(`select.itemtrigger` = the trigger of one item; `slider.valuelabel` = the label
carrying the current value).

## Component roles

A word becomes a role only when it earns it: **three or more component use
cases**. Minting a new role needs owner sign-off; do not invent one in a build
unit.

Established roles (shipped in 3+ families, or ruled by the owner):

| Role | Purpose | Examples |
| --- | --- | --- |
| `root` | the family's owning element and state home | every family |
| `trigger` | the control that opens/activates/selects | modal, select, accordion `itemtrigger` |
| `content` | the surface a trigger reveals | modal, select, navbar `itemcontent` |
| `item` | one unit of a repeated set | select, tree, navbar, toaster |
| `label` | names a thing for humans and readers | select, textbox, radio-group `itemlabel` |
| `description` | supporting text wired via `aria-describedby` | modal, textbox, combobox |
| `error` | validation message | textbox, combobox, radio-group |
| `indicator` | a purely-presentational state marker | select, radio-group, tree |
| `field` | the form-integration element | select, combobox, radio-group `itemfield` |
| `input` | the editable text element | combobox, textbox, otp |
| `title` | the accessible name of a roled surface | modal, toaster `itemtitle`, popover (chartered) |
| `close` | dismisses the surface it sits in | modal, toaster `itemclose`, popover (chartered) |
| `backdrop` | the layer behind an elevated surface; **optional** in every family that has it | modal; navbar (planned); future sheet/drawer |
| `track` | the rail a value moves along | slider (ruled); candidates: progress, scroll area |
| `thumb` | the handle a person drags along a track | slider (ruled) |
| `area` | a bounded region with its own interaction rules | scroll area; candidates as they earn it |
| `selection` | the chosen region inside an area, movable and resizable by the person | crop (ruled); candidates: slider range, calendar range |

Explicitly **not** roles: `cell` (ruled 2026-08-29 — a cell is `content` wearing a
`row` prefix), `arrow` (no behavior here — anchored arrows are
consumer CSS over the anchor data surface; revisit only if three families need a
behaviored arrow), `portal`, `positioner`, `viewport`, `value` (that is a
prefix), `group` (below the 3-use bar today; first candidate when select/combobox
grow option groups).

## Semantic prefixes

A prefix adds information, never behavior. Reuse before inventing; a new prefix
needs the same owner sign-off as a role.

Established prefixes: `item` (belongs to one item of the set — `itemtrigger`,
`itemcontent`, `itemlabel`, `itemindicator`, `itemfield`, `itemtitle`,
`itemclose`, `itemicon`, `itemlink`), `value` (carries the current value —
`valuelabel`), `nav` (carousel `navtrigger`), `play` (carousel `playtrigger`),
`row` and `col` (belongs to one row or one column of a rows-and-columns family —
table `rowcontent`, `rowfield`, `coltrigger`).

The worked example: the text in a trigger showing the selected value is not a new
role. Its purpose is *label*; the information it carries is the *value*; the name
is `valuelabel`.

## Capability naming

Props, events, and `ui-*` attributes follow the shipped idiom, never a reference
library's spelling:

- Native platform words; booleans over enums; **no mode/role/type enum props**.
  (`orientation: 'horizontal' | 'vertical'` is the one shipped enum shape — it
  selects an axis, it does not fork the component.)
- The primary change callback is `onChange`; secondary ones extend it in our
  grammar (`onChangeEnd`, `onOpenChange`) — never a reference's noun
  (`onValueCommit` → `onChangeEnd`).
- `ui-*` attributes: presence attributes for booleans (`ui-open`, `ui-disabled`),
  key-value only when genuinely multi-valued (`ui-side="start"`). No `data-*`
  state, no identity attributes.
- CSS custom properties for geometry consumers style against (`--index`,
  `--offset`, `--start`, `--end`), emitted from `computed()` style strings.
- Reference libraries contribute **behavior**. Their names carry over only when
  they already fit; every divergence is noted with its mapping in the family's
  research note.

## Enforcement

Any unit that adds or renames a part checks this spec first. A name outside the
established roles and prefixes is a blocked question for the owner, not an
improvisation. This file is the source of truth; AGENTS.md points here.

## DOM access

Family source (`*.tsrx` and the helper `.ts` files beside it) reaches other
elements only through `element()` handles the family binds itself. Vanilla DOM
queries and tree walks are banned: `closest`, `querySelector`,
`querySelectorAll`, `matches`, `getElementById`, `getElementsBy*`,
`parentElement`, `parentNode`, `children`, `childNodes`, `firstElementChild`,
`lastElementChild`, `nextElementSibling`, `previousElementSibling`, and any
selector-string lookup. A part that needs another part's element binds a handle
to it (or reads the handle the family already holds on its shared instance); a
walk over a set of parts iterates the handles the family registered, never the
DOM. The one containment predicate allowed is `handle.contains(node)` where the
receiver is a handle the family bound — it asks whether a node the platform
handed over (`relatedTarget`, `activeElement`, a press target) sits inside a
part the family knows; it never finds anything. Test files, scenarios and
transcripts may query freely.

Why: a selector or a parent walk couples the family to markup the consumer
owns, silently breaks under composition and projection, and bypasses the
instance scoping that makes handles resolve to the right widget.

## CSS defaults

Anything a family needs from CSS — anchor positioning, hidden-until-open,
overlay stacking — ships as a `<style>` block inside the part's `.tsrx`,
wrapped in `@layer markless`, written as ordinary CSS keyed off the `ui-*`
attributes the part already writes (`[ui-open] { … }`).
Geometry the consumer styles against is exposed as `--*` custom properties.
JS never builds CSS strings (`position-area` values, inset math, `style=`
concatenation) for what CSS can express. The layer is the whole point: a
consumer's unlayered rule beats the default without `!important`.

Placement is never a prop — no `side`, `align` or `offset` under any name. A
family ships one default `position-area` in its layer and the consumer overrides
it in CSS, with `position-try-fallbacks` of their own.

## Recursive composition

A family whose parts nest in themselves (tree, menu submenus) recurses with the
same parts — `item` containing `content` containing `item` — and every nesting
`item` roots its own item-level instance (tree's `treeItemState` precedent).
There is no second root and no `sub*` prefix; activation reports to the one
root.

An item's position is derived from render order — its place in the family's own
roster of bound elements — and a family never takes an index prop for it: a
consumer numbering its own parts by hand is a rename, a reorder or a loop away
from lying, and the family already knows. The count follows from the same
roster. No family takes one: `tour.item` was the last, and it does not.

## Timing

Family source never polls frames. A `requestAnimationFrame` retry loop that
waits for the DOM to show a write the handler just made (`open = true`, a
keyed row's new key) is a framework defect: the runtime commits the write so
`focus()` lands, and a family that cannot focus what it just revealed files a
witness against the runtime instead of retrying. Intent delays that are the
behaviour itself (hover-intent open/close, long-press) are ordinary
`setTimeout`s and stay.

## Testing

A gesture settles through a lazily woken handler module, so a synchronous read
straight after a press, key or drag sees the pre-gesture value. Browser rows
assert after the gesture settles (`expect.poll`, or a read after the dispatch
resolves), never on the next statement; a row that reads synchronously looks
exactly like a broken family and is not one.
