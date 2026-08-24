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

Explicitly **not** roles: `arrow` (no behavior here — anchored arrows are
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
`valuelabel`), `nav` (carousel `navtrigger`), `play` (carousel `playtrigger`).

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
