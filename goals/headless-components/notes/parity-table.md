# `@markless/ui` parity table — the QDS reference against what ships

State: `feat/headless-ui-pilot` at `fc66d3f9` ("progress named by its label,
indeterminate silent, toggle/textbox described-by wired"), measured 2026-08-23.

This file replaces the 2026-08-20 version, which covered four families and mapped
QDS *test names* to migrated test names. Twelve families ship now, and the unit of
record here is the **part and the behaviour**, not the test title: one row per QDS
part, then one row per behaviour where the shipped family and the QDS reference
differ. Every deviation names the constraint or the owner ruling that forced it.

## What was measured, and how

Two suite lanes, both run in this worktree on the tip above:

```sh
pnpm test:headless   # vp test --project ui       -> 13 files, exit 0
pnpm test:sr         # the virtual screen reader  -> 8 files,  exit 0
```

| lane | files | passed | expected fail | skipped | total |
| --- | --- | --- | --- | --- | --- |
| browser (`src/**/*.browser.ts`) | 13 | 384 | 12 | 17 | 413 |
| virtual reader (`src/**/*.sr.ts`) | 8 | 57 | 5 | 4 | 66 |

Per-file counts, read out of each lane's JSON report (the JSON reporter scores an
expected-fail row as `passed`, so the "expected fail" column below is attributed
from the `test.fails` call sites in each file, and the attributions sum to the
lane totals — 12 and 5):

| family | browser rows | of those pinned | of those skipped | reader rows | of those pinned | of those skipped |
| --- | --- | --- | --- | --- | --- | --- |
| base | 1 | 0 | 0 | — | — | — |
| checkbox | 39 | 0 | 0 | 10 | 2 | 0 |
| checklist | 41 | 2 | 16 | 10 | 1 | 4 |
| collapsible | 24 | 0 | 0 | 7 | 0 | 0 |
| otp | 38 | 0 | 1 | — | — | — |
| pagination | 55 | 7 | 0 | — | — | — |
| progress | 13 | 1 | 0 | 7 | 0 | 0 |
| qr-code | 32 | 0 | 0 | — | — | — |
| radio-group | 41 | 0 | 0 | 7 | 1 | 0 |
| scroll-area | 31 | 0 | 0 | — | — | — |
| tabs | 45 | 1 | 0 | 8 | 1 | 0 |
| textbox | 23 | 1 | 0 | 8 | 0 | 0 |
| toggle | 30 | 0 | 0 | 9 | 0 | 0 |

QDS source read as structural truth at
`~/dev/open-source/qwik-design-system/libs/components/src/<family>/`, read-only.
Part lists below are that folder's listing.

## Status vocabulary

- **supported** — the QDS part or behaviour exists here and a green suite row
  covers it.
- **pinned (Fn)** — the behaviour is expected and does not hold; the row is
  written the correct way round (`test.fails`) so it turns red the day the gap
  closes. `Fn` names the framework gap in the register below.
- **skipped (cause)** — the row cannot run at all; the cause is named.
- **deviation (citation)** — the shipped shape differs from QDS on purpose. The
  citation is either an owner ruling from `goal.md` or a measured Markless
  constraint, and it names where the measurement lives.

The standing order (owner, 2026-08-22, `goal.md`) is that **the QDS API is the
API**: a deviation happens only when a Markless constraint forces one, and then
minimally. Every deviation row below is written to be checked against that.

---

## Framework gap register

Each gap is measured, not assumed; the citation is the note or suite comment that
carries the measurement.

| id | gap | measured where | families it pins |
| --- | --- | --- | --- |
| F1 | A part's render inside a composed widget root does not see a sibling part's server-rendered seed: the group root carries `ui-mixed` while the select-all trigger comes back `aria-checked="false"`. A render-time seed defect, separate from resume. | `checklist/note.md` §"What T075g changed" | checklist (SSR half of 16 skipped rows) |
| F2 | A spread onto a component tag forwards the value but records no prop binding in the semantic graph, so an `el={handle}` or an event forwarded through `{...rest}` across a component edge has no view record and no IDREF is ever minted. | `checklist/note.md` limit 1 and 8; `scroll-area/note.md` limit 2 | checklist (group name, `aria-controls`), scroll-area (`named-by-handle`) |
| F3 | `element()` mints one id per handle per widget instance, so a handle cannot address one of N siblings. Refused by name: `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`, `…_ROW_OWNED`, `…_WIDGET_ROOT`. | `tabs/note.md` §"Trigger ↔ panel pairing"; `checklist/note.md` limit 6 | tabs (`aria-controls`/`aria-labelledby`), checklist (`aria-controls`) |
| F4 | `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` — an `@if` arm that flips cannot hold a part component or an attribute binding. | `otp/note.md` §"Boxes from an arm"; `tabs/note.md` §"What the compiler forced" 6 | otp (arm shape), tabs (arm shape) |
| F5 | A `tabs.content` computed cell goes stale after an SSR resume: `ui-selected` and `hidden` both read the same cell and both stop moving, while the triggers beside it move correctly. Every CSR equivalent is green. | `tabs/note.md` §"What the compiler forced" 1 | tabs (1 browser row) |
| F6 | A component-body shared seed is initial-render only, so a value the consumer changes from outside after mount never reaches the parts. The write lands — the consumer's own read of the same state moves. | `progress.browser.ts` pinned row | progress (1 browser row) |
| F7 | A handler body is a symbol the framework dispatches asynchronously. `event.currentTarget` is null inside it, an `element()` handle is `undefined` inside it after resume, and a caret policy cannot land before the very next keystroke. | `otp/note.md` §"Pinned row" (three measured timings) | otp (1 skipped row) |
| F8 | The widget-root registry holds no entry for a part whose projection site is registered in the root's subtree while the dispatching part is spelled in the consumer's. A registration gap in composition's projection bridge. | `pagination.browser.ts` pinned-row comment | pagination (3 browser rows) |
| F9 | A component body may seed a shared cell only from a bare prop or a constant (`MARKLESS_SHARED_SEED_UNSUPPORTED`); doing the arithmetic in the parts instead compiles and then never refreshes. | `pagination.browser.ts` clamp-row comment; `radio-group/note.md` §"What the compiler forced originally" | pagination (2 browser rows), radio-group (read-site workaround) |
| F10 | A part's own default written before `{...rest}` cannot be replaced by a consumer attribute: the family's value wins either way, so there is no REPLACEABLE default. | `pagination.browser.ts` landmark-name row | pagination (2 browser rows) |
| F11 | `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` — a consumer module cannot call another module's shared factory, because per-module compilation carries no interface describing that module's helper graph. | `pagination/index.ts` header; `checklist/note.md` limit 4 | pagination (`state` export), checklist (composition shape) |
| F12 | No per-part compile-time ordinal. Positional identity therefore has to be an authored prop or a required value. | `tabs/note.md` deviations 1-2; `otp/note.md` §"Shape" | otp (`index` prop), tabs (required `value`) |
| F13 | A construct (`@for`, `@if`) cannot open directly inside a component tag's children — `MARKLESS_PARSE_ERROR`. An element has to wrap it. | `checklist/note.md` limit 7; `tabs/note.md` 6 | checklist, tabs (scenario shape only) |
| F14 | A destructuring default cannot be read from a template position — `MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`. Fail-closed and correct; the fallback moves to the read site. | `scroll-area/note.md` limit 1; textbox section below | scroll-area, textbox (authoring shape only) |
| F15 | `preventDefault()` requested from a handler lands after dispatch returns, so Enter still activates a checkbox trigger that asks for it. | `test-support/README.md`; `checkbox.sr.ts` | checkbox (1 reader row) |
| F16 | The description part renders a plain `div` and wires no `aria-describedby`, so a reader announces the help text as a separate item rather than as part of the control. | `checkbox.sr.ts` | checkbox (1 reader row) |
| F17 | Reader-lane gap, not a family gap: `@guidepup/virtual-screen-reader` reads the `checked` **content attribute**; the family sets the **property**, which is what the platform accessibility tree is built from. | `test-support/README.md`; `radio-group.sr.ts` | radio-group (1 reader row) |
| F18 | One `element()` handle binds one live host, so a label that names the single-line control leaves a dangling `for` when only the multiline control is mounted. | `textbox.browser.ts` pinned row | textbox (1 browser row) |
| F19 | A widget callback slot's dispatch and its return leg: **closed** (T075d/f/g). Recorded because most of `checklist/note.md` is about it and a reader must not treat it as open. Its residue is F1. | `checklist/note.md` §T075f, §T075g | — |

---

# base

QDS: `button/button.tsx`, `label/label.tsx`, `visually-hidden/visually-hidden.tsx`.
Target: `src/base/`. Evidence: 1 browser row, green; no reader suite.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `button` | `base.button` | supported | `base.browser.ts` "CSR: base one-offs render their single elements" |
| `label` | `base.label` | supported | same row |
| `visually-hidden` | `base.visuallyhidden` | supported | same row |

| behaviour | status | citation |
| --- | --- | --- |
| single-element components export flat, no root | deviation — matches QDS | owner ruling 2026-08-18 (one-offs): `base` is a consumer-facing namespace |
| reached through the root barrel, not a subpath | supported | owner ruling 2026-08-22 (one import surface); `base.browser.ts` imports the barrel deliberately |

---

# checkbox

QDS parts: `checkbox-root`, `checkbox-trigger`, `checkbox-indicator`,
`checkbox-label`, `checkbox-description`, `checkbox-error`,
`checkbox-hidden-input` (plus `checkbox-context`, not a part).
Target: `src/checkbox/`. Evidence: 39 browser rows green; 10 reader rows,
8 green + 2 pinned.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `checkbox-root` | `checkbox.root` | supported | 39/39 browser |
| `checkbox-trigger` | `checkbox.trigger` | supported | tri-state `aria-checked`, `ui-checked`/`ui-mixed`/`ui-disabled` |
| `checkbox-indicator` | `checkbox.indicator` | supported | arm follows a gesture in CSR and after resume |
| `checkbox-label` | `checkbox.label` | supported | `for=` resolves to the trigger through an `element()` handle |
| `checkbox-description` | `checkbox.description` | supported (renders) / pinned F16 (announced) | `checkbox.sr.ts` "the help text under a box is conveyed with the box itself" |
| `checkbox-error` | `checkbox.error` | supported | |
| `checkbox-hidden-input` | `checkbox.field` | deviation | owner ruling 2026-08-18 (field): there is no `hiddeninput` role; `field` is canonical |

| behaviour | status | citation |
| --- | --- | --- |
| `onChange$` → `onChange` on the root | deviation | owner ruling 2026-08-18 batch 3 (b): `onChange` for the family's main state |
| `bind:checked` → `checked` prop + `onChange` | deviation | owner ruling 2026-08-18 (bindings): `useBindings`/`bind:*` dropped entirely |
| no `default*` props | deviation | owner ruling 2026-08-18 batch 3 (a): values are values, no "uncontrolled" concept |
| `ui-qds-*` identity attributes and `data-*` in library markup | deviation (dropped) | owner ruling 2026-08-18 (attributes) |
| author-spelled `id="${localId}-trigger"` → `element()` handle | deviation | owner ruling 2026-08-18 (attributes): a cleaner mechanism replaces identity attributes |
| axe accessibility row | deviation (dropped) | no axe dependency in this repo; the reader lane carries the announcement claims instead |
| Space activates, Enter does not | pinned F15 | `checkbox.sr.ts` "pressing enter leaves a checkbox alone" — the trigger calls `preventDefault()` on Enter and the request lands after dispatch returns |
| a real NVDA / VoiceOver reading | not covered | `checkbox.nvda.ts` / `checkbox.voiceover.ts` exist and cover two aria-at steps; both lanes fall back to a smoke script in CI (`test-support/README.md`) |

---

# checklist

QDS parts: `checklist-root`, `checklist-label`, `checklist-error`,
`checklist-hidden-input`, `checklist-select-all`,
`checklist-select-all-indicator`, `checklist-item`, `checklist-item-trigger`,
`checklist-item-label`, `checklist-item-description`,
`checklist-item-indicator` (plus `checklist-context`).
Target: `src/checklist/`. Evidence: 41 browser rows — 23 green, 2 pinned,
16 skipped; 10 reader rows — 5 green, 1 pinned, 4 skipped.

The QDS folder's exact eleven-part list ships. This is the family with the most
open rows, and every open row traces to one place: parts of a composed widget
root do not agree with the root at server-render time.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `checklist-root` | `checklist.root` | supported | roots the group and is the select-all's own checkbox root, as QDS does |
| `checklist-label` | `checklist.label` | supported | `for` equals the select-all trigger's minted id |
| `checklist-error` | `checklist.error` | supported (renders) / pinned (CSR invalid flag) | `checklist.browser.ts` "a mounted error marks the group invalid" is `test.fails` in CSR only |
| `checklist-hidden-input` | `checklist.field` | deviation | owner ruling 2026-08-18 (field) |
| `checklist-select-all` | `checklist.selectall` | supported | anatomy renders and resolves to one instance |
| `checklist-select-all-indicator` | `checklist.selectallindicator` | supported | |
| `checklist-item` | `checklist.item` | supported | roots a second checkbox instance; each item mints its own id |
| `checklist-item-trigger` | `checklist.itemtrigger` | supported | |
| `checklist-item-label` | `checklist.itemlabel` | supported | |
| `checklist-item-description` | `checklist.itemdescription` | supported | |
| `checklist-item-indicator` | `checklist.itemindicator` | supported | |

| behaviour | status | citation |
| --- | --- | --- |
| select-all state is a pure function of `value` × `values` | deviation | Markless seeds are order-independent; no second state cell, no item registration, no construction-order index (`note.md` §Shape) |
| ticking one item moves the select-all to mixed (CSR) | supported | flipped green by T075g |
| the same rows after an SSR resume | skipped F1 | 16 browser rows run through `csrOnly(mode)`; the served select-all trigger reads `aria-checked="false"` while the group root already carries `ui-mixed` |
| `aria-controls` on the select-all | pinned F3 | `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` refuses an IDREF list; QDS is in the same place. Row turns red the day an IDREF set lands |
| the group has an accessible name of its own | pinned F2 | reader row; naming the group needs `aria-labelledby` off a handle the label part forwards through `{...rest}` |
| a partly ticked select-all is announced as partially checked | pinned | `checklist.sr.ts`; four more reader rows skipped on the same render-time seed gap |
| `@for` wrapped in a `<div>` inside `<checklist.root>` | deviation F13 | a construct cannot open directly inside a component tag |
| a callback slot recognised only from a written `TSFunctionType` | deviation (authoring shape) | `isCallbackSlotDeclaration`; the alias here indexes a type in another module, so the function type is spelled out (`note.md` limit 5) |

---

# collapsible

QDS parts: `collapsible-root`, `collapsible-trigger`, `collapsible-content`.
Target: `src/collapsible/`. Evidence: 24 browser rows green; 7 reader rows green.
No `note.md` — there are no measured deviations to record beyond the prop
spellings below.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `collapsible-root` | `collapsible.root` | supported | 24/24 browser, 7/7 reader |
| `collapsible-trigger` | `collapsible.trigger` | supported | |
| `collapsible-content` | `collapsible.content` | supported | |

| behaviour | status | citation |
| --- | --- | --- |
| root props `open` / `disabled` | supported — exact QDS parity | `collapsible-types.ts` against `collapsible-root.tsx` `PublicCollapsibleRootProps` |
| `onChange$` → `onChange` | deviation | owner ruling 2026-08-18 batch 3 (b) |
| `bind:open` / `bind:disabled` → props + `onChange` | deviation | owner ruling 2026-08-18 (bindings) |
| the panel stays mounted; `hidden` decides whether it shows | supported — matches QDS | `collapsible-types.ts`: focus, scroll position and pointed-at ids survive a close |
| trigger ↔ panel pairing (`aria-controls` / `aria-labelledby`) | supported | this is the one family with exactly one pair, which is what F3 can express; `tabs/note.md` cites it as the contrast case |

---

# otp

QDS parts: `otp-root`, `otp-field`, `otp-item`, `otp-item-indicator`.
Target: `src/otp/`. Evidence: 38 browser rows — 37 green, 1 skipped. No reader
suite.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `otp-root` | `otp.root` | supported | |
| `otp-field` | `otp.field` | supported | one real `<input>`; `expectOneFormControl()` asserts the property, not the attributes |
| `otp-item` | `otp.item` | supported, with a deviation on identity (below) | a looped box follows the code exactly like a flat one |
| `otp-item-indicator` | `otp.itemindicator` | deviation | a bare `<span>` caret slot with no state; the item beside it reports `ui-empty` / `ui-disabled` (`note.md` §Deviations 2) |

| behaviour | status | citation |
| --- | --- | --- |
| every `otp.item` is `aria-hidden="true"`; the input carries the code | deviation | QDS exposes each box, which puts every character in the accessibility tree twice. Named as a QDS defect in `note.md` §Shape and asserted here |
| no per-item hidden input; a declared `length` prop replaces the construction-order item count | deviation F12 | `note.md` §Deviations 1 |
| `<otp.item index={n}>` | **deviation, open against an owner ruling** | owner correction 2026-08-22 (no index props on parts) calls this WRONG and charters a compiler per-part ordinal. `scenarios/basic.tsrx` still writes `index={0..5}`; blocked on F12 |
| the consumer's `onInput` runs after the family has taken the value | deviation | `note.md` §Deviations 3, with a witness row |
| focus on a filled field puts the caret at the end | supported in CSR / skipped F7 in SSR | `note.md` §"Pinned row": measured `"51234"` back-to-back in **both** modes, `"12345"` after a 400 ms wait, so the deferral is framework-wide rather than an SSR delay |
| `commit()` takes no parameter | deviation (preference, no longer forced) | re-measured 2026-08-23: the parameterised shape compiles and the whole suite passes on it; kept zero-arg so the write stays in one place |
| boxes delivered from a flipping `@if` arm | deviation F4 | `armed-length.tsrx` decides its arm from a module constant; a flipping arm holding `<otp.item>` is refused at compile time |
| a real clipboard paste / SMS autofill | not covered | not drivable from browser mode; `pasteInto()` writes the one input event both reach the page as, and is named so the rows are not read as end-to-end coverage |

---

# pagination

QDS parts: `pagination-root`, `pagination-item`, `pagination-item-trigger`,
`pagination-item-link`, `pagination-back-trigger`,
`pagination-forward-trigger` (plus `utils.ts`, internal).
Target: `src/pagination/`. Evidence: 55 browser rows — 48 green, 7 pinned. No
reader suite. No `note.md`; the measurements live in the suite's own pinned-row
comments, cited per row.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `pagination-root` | `pagination.root` | supported | `<nav>` landmark, clamps internally through `getEntries()` |
| `pagination-item` | `pagination.item` | supported | carries `value`; the list element, per the owner's 2026-08-22 anatomy correction |
| `pagination-item-trigger` | `pagination.itemtrigger` | supported | `aria-current` is family-derived, never consumer-authored |
| `pagination-item-link` | `pagination.itemlink` | supported | the dedicated-part answer to element polymorphism |
| `pagination-back-trigger` | `pagination.backtrigger` | supported | |
| `pagination-forward-trigger` | `pagination.forwardtrigger` | supported | |

| behaviour | status | citation |
| --- | --- | --- |
| `value` stays a required prop on `pagination.item` | supported — matches QDS | owner order 2026-08-22: it is QDS's own required prop (`PublicPaginationItemProps`); a page number is semantic data, not position |
| `getPageRange` stays internal | supported | owner correction 2026-08-22 (pageRange is not consumer API); `pagination-range.ts` is not re-exported as an algorithm |
| the consumer surface is `pagination.state()` with a zero-arg `getEntries()` | **deviation, open against an owner ruling** | owner-approved final surface 2026-08-22. Blocked on F11 — the exact diagnostic is quoted in `pagination/index.ts`. The family exports `pageRange as entries` instead, which is the owner's own earlier ratified shape and the nearest reachable point |
| a page number past the end is clamped for the current-item comparison | pinned F9 (×2 modes) | the family clamps on the way out (`getEntries()`) and on every write (`goTo()`), but a component body may not clamp on the way in, and clamping in the parts stops every click row refreshing |
| a consumer `aria-label` replaces the default landmark name | pinned F10 (×2 modes) | spread-before-state order is kept deliberately — it is what stops a consumer overwriting `aria-current` and `disabled` |
| the rendered control set follows the page as the range changes | pinned F8 (×2 modes) | the item's widget id stays in page space because the item part's projection site is registered at `r:page%3A5:c0:p2:` while the dispatching part is spelled at `c3:` |
| SSR: the served looped range is the one the consumer computed | pinned F8 | the served half is green and stays asserted; only the first click after resume lands nothing |
| keyboard | supported | there is no APG pattern for pagination; the rows prove the family does not get in the way of a native button and a native anchor |

---

# progress

QDS parts: `progress-root`, `progress-label`, `progress-track`,
`progress-indicator` (plus `progress-context`).
Target: `src/progress/`. Evidence: 13 browser rows — 12 green, 1 pinned;
7 reader rows green.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `progress-root` | `progress.root` | supported | `role="progressbar"`, the four `aria-value*` attributes |
| `progress-label` | `progress.label` | supported | and now names the bar — see below |
| `progress-track` | `progress.track` | supported | kept as an accepted one-off role (owner ruling 2026-08-18) |
| `progress-indicator` | `progress.indicator` | supported | the transform is asserted (`translateX(-70%)` at 30 of 100); QDS computed it and never asserted it |

| behaviour | status | citation |
| --- | --- | --- |
| the bar carries the name its visible label gives it | supported (**changed since the last table**) | fixed on this tip by `fc66d3f9`; `progress.sr.ts` is 7/7 with no pinned row. `test-support/README.md` still lists this as a gap and is stale |
| an indeterminate bar reports no current value | supported (**changed since the last table**) | same commit; the hard-coded `aria-label="progress"` and the `min`-derived `aria-valuetext` are gone |
| `bind:value` → `value` prop | deviation | owner ruling 2026-08-18 (bindings) |
| `getValueLabel` callback prop | deviation (dropped) | the family announces a percentage through `aria-valuetext`; re-adding the callback is a decision for after the callback route landed (it has since — see F19 — so this is now re-openable) |
| QDS's root throws on an invalid range (`max` not finite, `max <= min`, `value < min`) | deviation (not migrated) | a library that throws during render takes the page down; Markless has a fail-closed diagnostic channel for compile-time facts. Owner-visible drop |
| the bar follows an amount the consumer changes from outside | pinned F6 | `progress.browser.ts`; the write lands and the consumer's own read moves, but no part hears about it |
| `ui-qds-progress-*` identity attributes | deviation (dropped) | owner ruling 2026-08-18 (attributes) |

---

# qr-code

QDS parts: `qr-code-root`, `qr-code-frame`, `qr-code-pattern-svg`,
`qr-code-pattern-path`, `qr-code-overlay` (plus `qr-code-context`).
Target: `src/qr-code/`. Evidence: 32 browser rows, all green. No reader suite.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `qr-code-root` | `qrcode.root` | supported | |
| `qr-code-frame` | `qrcode.frame` | supported | kept as a one-off the owner reserved to rethink later (ruling 2026-08-18, one-off roles) |
| `qr-code-pattern-svg` | `qrcode.patternsvg` | supported | one `<svg>` with the `viewBox` sized to the module count, so scaling is CSS |
| `qr-code-pattern-path` | `qrcode.patternpath` | supported | one `<path>` of 1×1 squares |
| `qr-code-overlay` | `qrcode.overlay` | supported | |

| behaviour | status | citation |
| --- | --- | --- |
| no default `aria-label` | deviation | QDS names the code `` `QR code for ${value}` ``, which reads a TOTP secret aloud for this family's commonest real use. `unnamed.tsrx` asserts the absence so the default cannot creep back |
| `value` is required | deviation | QDS defaults it to `""`, which encodes a valid, scannable, useless code |
| `recovery` defaults to `medium`, spelled in words | deviation | QDS defaults to `low` while also shipping an `overlay`; a logo over a `low` code does not scan |
| the encoding follows the props | deviation (fixes a QDS defect) | `path` and `viewBox` are `computed()` over the seeded props, not a task over a copied signal, so a rotated pairing code re-encodes |
| no `ui-*` attribute on any part | supported | there is no state to reflect, and the suite asserts the absence so it does not read as an oversight |
| the encoded value never reaches the root as an attribute | supported (**changed since the last table**) | `qr-code/note.md` says two rows are pinned `test.fails` on the destructured-prop leak. They are **not** pinned on this tip: both run as plain rows and pass. The spread lowering now subtracts destructured names (the same fix `pagination.browser.ts` credits to `6d8f6818`). The note is stale |
| the encoder is written here rather than taken from `uqr` | deviation | adding a dependency was out of the unit's contract. Verified rather than trusted: **5,185 cases matched `uqr` byte for byte** across payload lengths 1-1,300 at all four recovery levels, versions 1-40, plus non-ASCII and emoji |
| numeric / alphanumeric encoding modes | not covered | byte mode only, which is correct for every input but not the tightest code for a purely numeric or alphanumeric string. Additive, no API change |
| whether the encoder stays out of the client bundle | not covered | belongs in `packages/bundler/test/`; not measured, and nothing here is evidence about it |
| whether a rendered code actually scans | not covered | no decoder available; determinism, geometry and the cell-for-cell `uqr` agreement are evidence about the encoder, not about a camera |

---

# radio-group

QDS parts: `radio-group-root`, `radio-group-label`, `radio-group-description`,
`radio-group-error`, `radio-group-field`, `radio-group-item`,
`radio-group-item-trigger`, `radio-group-item-label`,
`radio-group-item-indicator`, `radio-group-item-field`.
Target: `src/radio-group/`. Evidence: 41 browser rows green; 7 reader rows —
6 green, 1 pinned.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `radio-group-root` | `radiogroup.root` | supported, as a `<fieldset>` | see deviation below |
| `radio-group-label` | `radiogroup.label` | supported, as a `<legend>` | |
| `radio-group-description` | `radiogroup.description` | supported | |
| `radio-group-error` | `radiogroup.error` | supported (**changed since the last table**) | `note.md` says "a mounted error marks the group invalid" is pinned `test.fails` in both modes. It is **not** pinned on this tip: the suite comment reads "Unpinned: the seed map a part writes now reaches the widget ROOT as well as the parts projected into it". The note is stale |
| `radio-group-field` | — | deviation (dropped) | the QDS part renders nothing and pushes `name`/`required` into context with its own dev warning that it must come before any item. Both are plain props on the root here: one fewer part, no ordering footgun, and `field` keeps the meaning it has in checkbox and toggle — the hidden native control |
| `radio-group-item` | `radiogroup.item` | supported | roots a second widget family, `radiogroupItemState` |
| `radio-group-item-trigger` | `radiogroup.itemtrigger` | supported | |
| `radio-group-item-label` | `radiogroup.itemlabel` | supported | points `for` at its own input with no registry and no index |
| `radio-group-item-indicator` | `radiogroup.itemindicator` | supported | reads a `computed()` rather than an inline expression — see below |
| `radio-group-item-field` | `radiogroup.itemfield` | supported | the native radio |

| behaviour | status | citation |
| --- | --- | --- |
| `root` is a `<fieldset>` and `label` is its `<legend>` | deviation | it is the group's accessible name with no id and no IDREF, which F3 makes impossible via `aria-labelledby`; it also gives group `disabled` natively. QDS emits an `aria-labelledby` pointing at an id that may not exist, which is not copied |
| `itemtrigger` carries no `aria-checked` and no `role` | deviation (fixes a QDS defect) | QDS puts `aria-checked` on a plain `div`, where it is inert. The radio semantics live on the native input; the trigger reports `ui-selected` |
| `itemtrigger` does not render `itemfield` for you | deviation | so placing both parts cannot produce two inputs. Owner principle: every piece of markup is free |
| the arrow axis is gated on `orientation` | deviation | 5 of 7 surveyed libraries do this; QDS takes the prop and does not |
| arrow keys move focus **and** choose | supported | the APG rule for this pattern |
| roving tab stop without a construction-order index | deviation F12 | while `value` is empty every enabled option holds a tab stop and the first focus writes `tabbable`; once a choice exists the chosen option is the only stop. The multi-stop window before first focus is the known cost |
| `item.disabled = disabled \|\| group.disabled` seeded in the body | deviation F9 | `MARKLESS_SHARED_SEED_UNSUPPORTED`; the item seeds its own prop and every read site adds `\|\| group.disabled` |
| `@if` over an expression refreshes | deviation (authoring shape) | measured: an `@if` condition written as an expression renders once and never refreshes, while `@if (someComputed)` does. Worth 17 rows of this suite; the indicator therefore reads a `computed()` |
| `tabindex` hoisted to a `computed()` | deviation (authoring shape) | measured, not preferred: 4 runs with it inline went red 3 times in two different rows; 3 of 3 green hoisted |
| an arrow announces the radio it chose | pinned F17 | reader-lane gap: the option's `input.checked` is `true` and the indicator reads "Chosen" while the `checked` content attribute stays `null`. This is the assertion the real-reader lanes exist to carry |

---

# scroll-area

QDS parts: `scroll-area-root`, `scroll-area-view-port`, `scroll-area-scrollbar`,
`scroll-area-thumb` (plus `scroll-area-context`).
Target: `src/scroll-area/`. Evidence: 31 browser rows, all green (the four
scroll-timeline rows are gated on `CSS.supports` and the gate is open on this
Chromium, so they run for real). No reader suite.

There is no `shared()`, no `state()` and no event handler in this family, and the
served HTML is already complete: `SSR: nothing moves after resume` compares the
root's `outerHTML` across a turn of the event loop and it is byte-identical.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `scroll-area-root` | `scrollarea.root` | supported (tier 1) | |
| `scroll-area-view-port` | `scrollarea.viewport` | supported (tier 1) | **naming note:** the owner's 2026-08-18 one-off-roles ruling said to remove `viewport` in favour of `scrollarea.area`. The later standing order (2026-08-22, "the QDS API is the API") points the other way, and the shipped name follows QDS. Flagged for the owner rather than decided here |
| `scroll-area-scrollbar` | `scrollarea.scrollbar` | supported (tier 2) | painted, `aria-hidden="true"` |
| `scroll-area-thumb` | `scrollarea.thumb` | supported (tier 2), decorative | positioned by a CSS scroll-driven animation; **cannot be dragged** |

| behaviour | status | citation |
| --- | --- | --- |
| dragging the thumb (QDS tier 3) | not implemented, deliberately not stubbed | blocked on two owner questions in `research-scroll-area.md` §8: whether an `element()` handle can be read for a live DOM property inside a handler, and whether an element-observation surface should exist at all (a proportional thumb needs it). No drag scaffolding was added, so nothing has to be unpicked |
| `type` (`hover`/`scroll`/`auto`/`always`) and `hideDelay` on the root | deviation (dropped) | they exist only to drive a JavaScript-computed `ui-state` off mouse events and a timer; at these tiers there is no JavaScript to compute it with. `hover` and `always` are plain CSS, `auto` was already a synonym for `always` in QDS's own `shouldShow()`, and `scroll` is the one value that needs a listener. The props return with tier 3 |
| `ui-orientation="vertical"` → `ui-vertical` / `ui-horizontal` presence attributes | deviation | owner ruling 2026-08-18 (attributes); every shipped family follows it and CSS reads either spelling |
| no `aria-label` default on the viewport | deviation | QDS hard-codes `role="region"` + `aria-label="Scrollable content"`, which is untranslatable and gives three identically named landmarks on a page with three areas. Role and `tabindex` are kept because a focusable container must be nameable |
| the shared `thumbRef` across both orientations | absent by construction | there is no ref; `both-axes.tsrx` asserts each scrollbar contains only its own thumb |
| `document.querySelector("[ui-qds-scroll-area-viewport]")` picking the first area | absent by construction | no DOM sensing; `two-areas.tsrx` is the counter-proof |
| the per-scroll-event `querySelector` for the thumb | absent by construction | the suite asserts that scrolling rewrites nothing in the markup |
| two unconditional `document` listeners per thumb | absent by construction | the suite wraps `document.addEventListener` and asserts none of `mousemove`, `mouseup`, `pointermove`, `pointerup`, `wheel`, `resize` registered. It deliberately does not assert "zero listeners" — the framework's own delegation is not this family's to promise |
| naming the area from a heading through an `element()` handle | pinned F2 | `named-by-handle.tsrx` keeps the handle shape with two `test.fails` rows; `named-by-heading.tsrx` writes the id by hand, which works in both modes |
| the family ships no CSS | deviation | QDS's `scroll-area.css` selects on identity attributes, which are dropped by owner ruling, leaving a shipped stylesheet nothing stable to select. The scenarios write the recipe instead |
| trackpad momentum, touch, OS scrollbar settings, browser zoom | not covered | not drivable from vitest browser mode |

**Stale in `scroll-area/note.md`:** the closing section says the family "is not
reachable from the package yet" and that `src/index.ts` has no
`export * as scrollarea` line. It does, and `package.json` has a `./scroll-area`
entry. Wired at fan-in as the note predicted; the note was not updated.

---

# tabs

QDS parts: `tabs-root`, `tabs-list`, `tabs-trigger`, `tabs-content`.
Target: `src/tabs/`. Evidence: 45 browser rows — 44 green, 1 pinned; 8 reader
rows — 7 green, 1 pinned.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `tabs-root` | `tabs.root` | supported | |
| `tabs-list` | `tabs.list` | supported | carries `aria-orientation` — see below |
| `tabs-trigger` | `tabs.trigger` | supported | |
| `tabs-content` | `tabs.content` | supported in CSR / pinned F5 in SSR | `test.fails` "SSR: clicking a tab moves the panels": the panel renders correctly from the served HTML and then never refreshes, while the triggers beside it move |

No indicator part and no per-tab wrapper: QDS ships neither, and an indicator is
a pure-CSS concern in the three libraries that do. `tabs.trigger` / `tabs.content`
stay bare — owner ruling 2026-08-18 batch 4 (c) rejected the Judge's tabs rename.

| behaviour | status | citation |
| --- | --- | --- |
| `value` is required on `tabs.trigger` and `tabs.content` | deviation F12 | QDS makes it optional and falls back to a declaration-order index from a mutable counter (`context.currTriggerIndex++`). Markless seeds are order-independent and the owner ruled out a runtime creation-order counter |
| omitting `value` on the root shows no tab | deviation F12 | follows from the above: QDS's `"0"` default only selects the first tab because the index fallback exists |
| `ui-orientation="vertical"` → `ui-vertical` presence attribute | deviation | owner ruling 2026-08-18 (attributes) |
| `aria-orientation` on the list | deviation (fixes a QDS gap) | QDS emits only `ui-orientation`, which no assistive technology reads; the APG requires the ARIA attribute |
| `{...rest}` spread first | deviation (fixes a QDS defect) | QDS spreads `{...props}` last on the trigger and the content, after `aria-selected` and `tabIndex`, so a consumer silently overwrites the ARIA state. Pinned by `consumer-attributes.tsrx` |
| no handler arrays | deviation | QDS composes with `onClick$={[a, b]}`; each handler here is an authored closure that calls the family's rule then the consumer's |
| `aria-controls` on the tab and `aria-labelledby` on the panel | pinned F3, in both suites | neither is emitted, and neither is emitted by QDS. The single-pair workaround was tried on this tip on 2026-08-22 and refused (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`); binding the handle on the button compiles and is worse — every trigger renders the same minted id. Until then a consumer can name a panel itself, because `{...rest}` is spread first and the family writes no `aria-label` |
| the trigger compares two cells, the panel compares against its prop | deviation (authoring asymmetry, measured) | seeding the trigger's value into `tabsPartState` fixed 4 red trigger rows; doing the same in `tabs.content` made things worse (10 red rows), so the asymmetry is a measurement rather than a preference |
| one graph cell per read position | deviation (authoring shape) | each part derives a single `computed()` read by `aria-selected`, `tabindex`, `hidden` and `ui-selected` alike, carrying radio-group's measured hoist |
| `preventDefault()` guarded by a plain key comparison | deviation | a guard over locals derived from graph state is `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`; the orientation gate lives in a second non-preventing branch — the same split QDS reaches through `sync$` |
| a conditionally offered **tab** | not expressible F4/F13 | `arm-tabs.tsrx` arms a panel instead, from a module constant |
| panels stay mounted; `hidden` decides | supported — matches QDS | a panel that unmounts loses focus, scroll position and form state on every tab change |
| `tabsPartState` is not in `index.ts` | deviation (deliberate) | it is a workaround, not consumer surface |

**Stale in `tabs/note.md`:** the closing section says `src/index.ts` does not
carry `tabs` and neither does the package's `exports` map. Both do now.

---

# textbox

QDS parts: `textbox-root`, `textbox-label`, `textbox-input`, `textbox-textarea`,
`textbox-description`, `textbox-error`, `textbox-field`.
Target: `src/textbox/`. Evidence: 23 browser rows — 22 green, 1 pinned; 8 reader
rows green.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `textbox-root` | `textbox.root` | supported | owns `value`, `disabled`, `required`, `readonly`, `name`; reflects `ui-disabled` / `ui-required` / `ui-readonly` / `ui-empty` |
| `textbox-label` | `textbox.label` | supported | |
| `textbox-input` | `textbox.input` | supported (**changed since the last table**) | the 2026-08-20 table recorded a rename to `textbox.trigger`. The shipped name is QDS's `input`, per the owner's 2026-08-22 standing order; the suite's locators name it that way |
| `textbox-textarea` | `textbox.textarea` | supported (**changed since the last table**) | likewise: the recorded `multilinetrigger` rename is not what shipped |
| `textbox-description` | `textbox.description` | supported | announced with the control on this tip — `textbox.sr.ts` is 8/8 with no pinned row (fixed by `fc66d3f9`; `test-support/README.md` still lists this as a gap and is stale) |
| `textbox-error` | `textbox.error` | supported | same commit closed the worse form of that gap (a field conveyed as invalid whose error text was unreachable) |
| `textbox-field` | — | deviation (dropped) | the QDS part renders `<slot/>` and only writes `name`/`required` into context. `field` is the form field and renders a hidden control; a renderless config carrier is not that. `name` and `required` are props on the root |

| behaviour | status | citation |
| --- | --- | --- |
| the OR-merge restriction rule | supported | `disabled`, `required` and `readonly` may be set on the root **or** the control, and a part may add a restriction and never remove one the root set. Both directions are pinned: a `strict` case and a `loose` case that passes `required={false}` under a `required` root and still gets a required control |
| those three props carry no destructuring defaults | deviation F14 | a defaulted prop local read outside a component-body assignment fails closed with `MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED` |
| naming runs both ways | supported | the label binds its own handle and each control renders `aria-labelledby={textbox.labelEl}`, so a textarea gets its name too; the label additionally renders `for=` so clicking it focuses the single-line control |
| a label beside a multiline control names an element that exists | pinned F18 | one handle binds one live host, so the multiline case leaves a dangling `for` |
| `readOnly` → `readonly` | deviation | HTML attribute spelling, as everywhere else in Markless (`tabindex`, `class`, `for`) |
| `onChange$` → `onChange`; `bind:value`/`bind:disabled`/`bind:readOnly`/`bind:required` → props + `onChange` | deviation | owner rulings 2026-08-18 (batch 3 b, bindings) |
| axe rows | deviation (dropped) | no axe dependency in this repo |

---

# toggle

QDS parts: `toggle-root`, `toggle-trigger`, `toggle-thumb`, `toggle-label`,
`toggle-description`, `toggle-error`, `toggle-field`, `toggle-hidden-input`.
Target: `src/toggle/`. Evidence: 30 browser rows green; 9 reader rows green.

| QDS part | @markless/ui | status | evidence |
| --- | --- | --- | --- |
| `toggle-root` | `toggle.root` | supported | |
| `toggle-trigger` | `toggle.trigger` | supported, as a real `<button role="switch">` | |
| `toggle-thumb` | `toggle.thumb` | supported | kept as an accepted one-off role (owner ruling 2026-08-18) |
| `toggle-label` | `toggle.label` | supported | points at the trigger by a minted id; QDS pointed it at the hidden input |
| `toggle-description` | `toggle.description` | supported, and announced with the control (**changed since the last table**) | `toggle.sr.ts` is 9/9 with no pinned row on this tip (`fc66d3f9`); `test-support/README.md` still lists toggle under the help-text gap and is stale |
| `toggle-error` | `toggle.error` | supported | |
| `toggle-field` + `toggle-hidden-input` | one `toggle.field` | deviation | owner ruling 2026-08-18 (field). QDS had both: `field` took `name`/`value`/`required` and rendered `hidden-input`, which held the actual `<input>` |

| behaviour | status | citation |
| --- | --- | --- |
| `name` / `value` / `required` move from the field part to the root | deviation | one place decides what a form receives, matching checkbox. Retires QDS's two mechanisms for the same three props |
| QDS's `AutomaticField` (the root renders a hidden input when no `field` exists) | deviation (dropped) | owner ruling 2026-08-18 batch 4 (d): every piece of markup is free and parts are independently placeable; a root that silently renders a part the author did not write is the opposite |
| no keyboard rule at all | deviation (simplification) | QDS's trigger is a `<span role="switch">` and re-implements Space and Enter plus a synchronous `preventDefault`. A real `<button role="switch">` already activates on both keys, so the port deletes all of it and the rows drive the real keyboard |
| no `indicator` part | supported — matches QDS | QDS's toggle has none and roles are not invented without an owner ruling |
| a disabled trigger cannot take focus | deviation (stronger than QDS) | QDS had to focus a `<span>` and guard inside the handler |
| the field renders the config a form needs | deviation (stronger than QDS) | QDS asserts only that the root is visible; this asserts `name`, `value`, `required`, `checked`, the clipping that hides it, and the absence of a library class name |
| `bind:checked` / `bind:disabled` / `bind:required`, `onChange$`, `ui-qds-toggle-*`, `data-testid` in library markup, `${localId}-*` id strings | deviation | owner rulings 2026-08-18 (bindings, batch 3 b, attributes, field) |

---

## Cross-cutting: what every family does the same way

| rule | applies to | citation |
| --- | --- | --- |
| `{...rest}` is spread **first** on every host element | all twelve | fixes QDS's spread-last order, which let a consumer overwrite ARIA state; pinned per family by a `consumer-attributes` / `spread-first` scenario where one exists |
| only `ui-*` state attributes; no `data-*` in library markup; no `ui-qds-*` identity attributes | all twelve | owner ruling 2026-08-18 (attributes) |
| presence attributes for state reflection (`ui-vertical`), not value attributes (`ui-orientation="vertical"`) | tabs, radio-group, scroll-area | owner ruling 2026-08-18 (attributes) |
| no author-spelled and no minted-string ids; `element()` handles name relationships | all families that pair parts | owner ruling 2026-08-18 (attributes) |
| `useBindings` / `bind:*` dropped entirely; two-way is a prop plus `onChange` | all stateful families | owner ruling 2026-08-18 (bindings) |
| no `default*` props, no "uncontrolled" concept | all stateful families | owner ruling 2026-08-18 batch 3 (a) |
| `onChange` for the family's main state; `onXChange` for anything else | all stateful families | owner ruling 2026-08-18 batch 3 (b) |
| every part is a PascalCase component re-exported under a lowercase role alias into an ES module namespace | all twelve | owner ruling 2026-08-18 (aliasing) |
| every family namespace exports `state` beside its parts | eleven of twelve | owner-approved final surface 2026-08-22. **scroll-area** has no shared state to export (it has no `shared()`), and **pagination** cannot export it — see F11 |
| no axe rows | all | no axe dependency in this repo; the reader lane carries the announcement claims |

## Open against an owner ruling

Three places where the shipped tree does not match a ruling in `goal.md`. None is
a silent drift; each is blocked on a named capability.

1. **`pagination.state()` with `getEntries()`** (owner-approved final surface,
   2026-08-22). Blocked on F11; `pagination/index.ts` quotes the exact
   diagnostic and exports `pageRange as entries` instead, which is the owner's
   own earlier ratified shape.
2. **`<otp.item index={n}>`** (owner correction 2026-08-22: no index props on
   parts). Blocked on F12, the chartered per-part compile-time ordinal. The
   scenarios still write `index={0..5}`.
3. **Per-family export subpaths** (`./checkbox`, `./pagination`, …) are still in
   `packages/headless/components/package.json` while the owner's 2026-08-22
   one-import-surface ruling charters their removal once nothing imports through
   them. Scenarios and suites already use relative intra-package paths and the
   `sr-gallery` uses the root barrel, so the removal is unblocked — it has just
   not been done.

Plus one naming question the rulings answer in two directions:
**`scrollarea.viewport`**. The 2026-08-18 one-off-roles ruling said to remove
`viewport` in favour of `scrollarea.area`; the 2026-08-22 standing order says the
QDS API is the API, and QDS's part is `scroll-area-view-port`. The shipped name
follows the later order. Owner's call.

## Findings: where a `note.md` and the measured suite disagree

Recorded, not fixed — this file is documentation of record, and each of these is
a note that fell behind its own family.

1. **`qr-code/note.md` limit 1** says two rows are pinned `test.fails` on a
   destructured prop leaking through `{...rest}`. On this tip both rows run as
   plain rows and pass (`qr-code.browser.ts`, "the encoded value does not reach
   the root element as an attribute" and "a TOTP secret never appears anywhere in
   the code's own markup"). `pagination.browser.ts` credits the fix to the
   rest-binding spread change `6d8f6818`. The note's claim that this leak is
   family-wide (naming collapsible and progress) is stale by the same fix.
2. **`radio-group/note.md` §"Pinned row"** says "a mounted error marks the group
   invalid" is pinned `test.fails` in both modes. It is not: the suite carries an
   explicit "Unpinned:" comment above the row and radio-group is 41/41 green.
   Checklist's equivalent row is still `test.fails` in CSR only, so the note's
   "Checklist pins the same row for the same reason" no longer reads across.
3. **`tabs/note.md` §"Not wired into the barrel"** and
   **`scroll-area/note.md` §"Outside this unit's file contract"** both say the
   family is not exported from `src/index.ts` or `package.json`. Both are wired.
4. **`test-support/README.md` §"Some expectations are recorded red"** lists four
   family gaps that are closed on this tip: the help text conveyed with the
   control for **toggle** and **textbox** (checkbox's is still pinned), the
   **progress** bar carrying the name its visible label gives it, and an
   indeterminate **progress** bar reporting no current value. `fc66d3f9` closed
   all four and the `.fails` rows were deleted, but the README still describes
   them as gaps.
5. **`otp/note.md`** and **`tabs/note.md`** both say "otp still takes
   `index={n}`" as an aside about the missing ordinal. That is accurate, and it
   is the one place where a note is *right* and the shipped tree is open against
   a ruling — listed above rather than here.

## What no lane covers

- **Real screen readers.** The NVDA and VoiceOver suites exist for checkbox only
  and cover two steps of the aria-at checkbox plan. Both CI jobs currently run
  `scripts/ci/screen-reader-smoke.mjs` instead, because the served gallery does
  not render; `test-support/README.md` carries that blocker in full.
- **Four of the seven vocabulary slots** in `Vocabulary` are each reader's
  documented wording and have never been observed against this markup.
- **Cross-framework portability via frameless**, which is part (e) of the goal
  oracle. Nothing in these two lanes speaks to it.
- **Bundle-size claims**, including whether the QR encoder stays out of the
  client bundle.
