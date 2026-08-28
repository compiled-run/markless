# The chaos lane

Chaos engineering, applied to widgets. Scripted suites check the interactions
someone thought to write down. This lane generates interaction _storms_ — rage
clicks, jittery drags, keyboard mashing, rapid open/close toggling, and gestures
started before the previous one settles — and then checks that the widget did not
break in ways nobody enumerated.

It exists for the last stretch of QA: the failures a frustrated human finds and an
agent writing test cases does not.

## Running it

The lane is gated. It is not in the root `vite.config.ts` projects list, so
`pnpm test` does not run it.

Exploratory — a fresh random seed every time, which is the point of the lane:

```sh
pnpm exec vitest --run --config packages/headless/components/chaos/vitest.config.ts
```

CI — the pinned seed, so a red run is the tree changing and not the dice:

```sh
CHAOS_SEED=20260828 pnpm exec vitest --run --config packages/headless/components/chaos/vitest.config.ts
```

`package.json` is owned elsewhere; these are the two script lines to copy into it
when the scripts are added:

```json
"chaos": "vitest --run --config packages/headless/components/chaos/vitest.config.ts",
"chaos:ci": "CHAOS_SEED=20260828 vitest --run --config packages/headless/components/chaos/vitest.config.ts"
```

It needs the same machine conditions as the other browser lanes: a Chromium that
Playwright can drive, and no other browser lane running at the same time.

### How long a run is

Every family gets exactly **two** storms of **30** gestures. With 35 families
that is 70 storms and 2,100 gestures, and the guard row at the top of
`families.chaos.ts` fails if a family ever declares a third — the arithmetic is
pinned rather than described.

Which two a family gets is stated in its own entry:

- `mixed` always. It draws from the whole move set, pointer and keyboard both, so
  no family loses pointer coverage by not having a `pointer` storm.
- plus `keyboard` where the family's contract _is_ a keyboard protocol — roving
  focus, typeahead, arrow stepping, a focus trap.
- plus `pointer` where the family's contract is a pointer-capture drag or a
  hover-and-press surface, and a keyboard-only storm would never reach it.

The lane was 6 families x 3 storms x 40 gestures when it was a pilot. Three
storms and forty gestures across 35 families would have been 4,200 gestures and
took the run past the budget; two storms of thirty keeps it there while adding
five times the families. Measured: **84 seconds of tests**, 96 seconds wall clock
including the module import, on one headless Chromium.

## Reproducing a failure

Every run picks a random seed and prints it before the first test:

```
chaos run seed 2748329104 - replay with:
  CHAOS_SEED=2748329104 pnpm exec vitest --config packages/headless/components/chaos/vitest.config.ts
```

Every failure prints it again, together with the seed of the individual storm and
the full list of gestures in the order they were performed:

```
menu: the keyboard storm broke an invariant.

  Replay:     CHAOS_SEED=2748329104 pnpm exec vitest --config packages/headless/components/chaos/vitest.config.ts
  Run seed:   2748329104
  Storm seed: 1180334292

  Broken:
    - focus fell back to <body>: the storm dropped it and nobody caught it

  Gestures (17, in order):
    01 key-mash ArrowDown Escape at [data-testid="trigger"]
    ...
```

Set `CHAOS_SEED` to the run seed and you get the identical run: the same
families, the same storms, the same gestures, in the same order. Nothing in the
storm generator reads the clock or calls `Math.random` — a single
[mulberry32](./seed.ts) generator drives every choice, and each storm derives its
own seed from the run seed and its own name, so adding or reordering a family
does not disturb the storms that were already there.

`CHAOS_SEED` reaches the page through `define` in `chaos/vitest.config.ts`:
vitest runs in node, the storm generator runs in the browser, and `process.env`
does not exist there.

## What is checked

After every storm, and during it for the first one:

1. **Nothing threw.** No uncaught errors, no unhandled promise rejections, no
   `console.error` output. The storm stops early at the first one, so the gesture
   log ends at the gesture that provoked it rather than 30 gestures later.
2. **Focus is not lost.** After a keyboard-only storm, `document.activeElement`
   has to be a real, still-connected, focusable element. Falling back to `<body>`
   is the failure: a keyboard user stranded with no way back into the widget. The
   single exception is a `Tab` that walked off the last tabbable element on the
   page — see [Emulated `Tab`](#emulated-tab) — which is where the user asked to
   go, and which the next `Tab` returns from.
3. **ARIA agrees with what is on screen.** A trigger reporting
   `aria-expanded="false"` must not still be showing the element its
   `aria-controls` names.
4. **The widget recovers.** After the storm, one scripted normal interaction —
   the one that family's own browser suite already pins — still behaves. A menu
   opens on its trigger and lands on its first item; a drawer opens, takes focus,
   closes and hands focus back; a slider steps by one from `Home`.

Recovery runs after an `Escape` unwind, because a storm can leave a modal drawer
open with its own trigger inert. That is the storm's leftovers, not a defect.

## Emulated `Tab`

A dispatched `keydown` is untrusted, and the browser performs sequential focus
navigation only for trusted keys. So a synthetic `Tab` used to fire the family's
handler and then move nothing, and the two halves of a correct family disagreed:
`select` closes its listbox on `Tab` and deliberately does not pull focus back to
its trigger, because a real `Tab` is on its way somewhere else. With the move
missing, focus stayed on an option that had just been hidden, the browser dropped
it to `<body>`, and the lost-focus check reported a strand that a real keyboard
user would never have hit.

[`tab-order.ts`](./tab-order.ts) performs the move itself. After a `Tab` or
`Shift+Tab` `keydown` that was not `defaultPrevented`, it collects the page's
tabbable elements — `tabIndex >= 0`, rendered and visible, not disabled, not
inside an `[inert]` subtree — orders them the way the browser does (a positive
`tabindex` first, ascending, then everything at 0 in document order) and focuses
the next one, or the previous one for `Shift+Tab`. The `keyup` then goes to
wherever focus landed, as it would in a browser.

Three details are worth knowing:

- **The move starts from where focus was when the key went down**, not from
  wherever it is by the time the move runs. A handler can hide the focused
  element mid-press, and the browser drops focus to `<body>` before the emulation
  gets to look; starting from the recorded element matches the navigation point
  the HTML spec keeps at the position of the element that went away.
- **When the focused element is not itself tabbable** — a roving `tabindex="-1"`
  option, say — the walk continues from its position in document order.
- **There is no wrap.** If nothing tabbable follows, focus is blurred to `<body>`
  on purpose, exactly as a browser hands focus out to its own chrome. The move is
  recorded, the gesture log says so, and the lost-focus check accepts `<body>`
  only while that record stands. Anything that takes focus afterwards clears it,
  so a genuine strand later in the same storm still fails, and a page left with
  no tabbable element at all is not recorded as a tab-out — there would be
  nothing for the next `Tab` to come back to. A press made while nothing is
  focused walks in from the first (or last) tabbable, which is the press that
  comes back out of the chrome.

Everything stays seed-driven: the emulation reads the DOM and the pressed key,
never the clock and never `Math.random`.

## Coverage

Every interactive shipped family in `src/`, on the scenario a consumer would
copy, used unchanged.

| Family      | Scenario                                | Storms             |
| ----------- | --------------------------------------- | ------------------ |
| accordion   | `src/accordion/scenarios/basic.tsrx`     | keyboard, mixed    |
| buttongroup | `src/buttongroup/scenarios/basic.tsrx`   | keyboard, mixed    |
| calendar    | `src/calendar/scenarios/basic.tsrx`      | keyboard, mixed    |
| carousel    | `src/carousel/scenarios/basic.tsrx`      | pointer, mixed     |
| checkbox    | `src/checkbox/scenarios/basic.tsrx`      | pointer, mixed     |
| checklist   | `src/checklist/scenarios/basic.tsrx`     | pointer, mixed     |
| collapsible | `src/collapsible/scenarios/basic.tsrx`   | pointer, mixed     |
| colorpicker | `src/colorpicker/scenarios/basic.tsrx`   | pointer, mixed     |
| combobox    | `src/combobox/scenarios/basic.tsrx`      | keyboard, mixed    |
| crop        | `src/crop/scenarios/basic.tsrx`          | pointer, mixed     |
| datebox     | `src/datebox/scenarios/basic.tsrx`       | keyboard, mixed    |
| drawer      | `src/drawer/scenarios/basic.tsrx`        | keyboard, mixed    |
| fileupload  | `src/fileupload/scenarios/basic.tsrx`    | pointer, mixed     |
| hovercard   | `src/hovercard/scenarios/basic.tsrx`     | pointer, mixed     |
| ink         | `src/ink/scenarios/basic.tsrx`           | pointer, mixed     |
| menu        | `src/menu/scenarios/basic.tsrx`          | keyboard, mixed    |
| menubar     | `src/menubar/scenarios/basic.tsrx`       | keyboard, mixed    |
| modal       | `src/modal/scenarios/basic.tsrx`         | keyboard, mixed    |
| navbar      | `src/navbar/scenarios/click-only.tsrx`   | pointer, mixed     |
| numberbox   | `src/numberbox/scenarios/basic.tsrx`     | keyboard, mixed    |
| otp         | `src/otp/scenarios/basic.tsrx`           | keyboard, mixed    |
| pad         | `src/pad/scenarios/basic.tsrx`           | pointer, mixed     |
| pagination  | `src/pagination/scenarios/basic.tsrx`    | pointer, mixed     |
| popover     | `src/popover/scenarios/basic.tsrx`       | keyboard, mixed    |
| radio-group | `src/radio-group/scenarios/basic.tsrx`   | keyboard, mixed    |
| select      | `src/select/scenarios/basic.tsrx`        | keyboard, mixed    |
| slider      | `src/slider/scenarios/basic.tsrx`        | pointer, mixed     |
| tabs        | `src/tabs/scenarios/basic.tsrx`          | keyboard, mixed    |
| textbox     | `src/textbox/scenarios/basic.tsrx`       | keyboard, mixed    |
| toaster     | `src/toaster/scenarios/basic.tsrx`       | pointer, mixed     |
| toggle      | `src/toggle/scenarios/basic.tsrx`        | pointer, mixed     |
| toolbar     | `src/toolbar/scenarios/basic.tsrx`       | keyboard, mixed    |
| tooltip     | `src/tooltip/scenarios/basic.tsrx`       | pointer, mixed     |
| tour        | `src/tour/scenarios/basic.tsrx`          | keyboard, mixed    |
| tree        | `src/tree/scenarios/nested.tsrx`         | keyboard, mixed    |

`navbar` storms `click-only` rather than `basic`: the starter opens its dropdowns
on hover intent, and hover intent is a timer a dispatched pointer event cannot
wind forward. `click-only` is the same family driven by presses, which is what a
storm makes.

### Families deliberately not stormed

- **progress** — a bar that reports a number. There is no gesture to storm; the
  family has no handler of its own.
- **qr-code** — renders a code. Same reason: nothing to press.
- **base** — the shared primitive the families are built out of, not a family a
  consumer mounts. Its behaviour is stormed through every family above.

Nothing else in `src/` is skipped.

## Adding a family

One entry in [`families.ts`](./families.ts):

```ts
{
	name: 'accordion',
	mount: () => render(AccordionBasic),
	rootTestId: 'root',
	keyboardEntryTestId: 'shipping-trigger',
	storms: ['keyboard', 'mixed'],
	async recover() {
		await driveTo('shipping-trigger', 'aria-expanded', 'false');
		el('shipping-trigger').click();
		await expect.poll(() => el('shipping-content').hasAttribute('hidden')).toBe(false);
	},
},
```

- `mount` renders client-side only. The SSR harness rewrites its marker at the
  literal call site, so it cannot be reached through a descriptor.
- `rootTestId` is what the storms are aimed inside of. Leave it off when the
  scenario's controls sit _outside_ the family root — `toaster`'s buttons and
  `tour`'s start button do — and the storm takes the whole mounted body instead.
- `keyboardEntryTestId` is where a keyboard-only storm puts focus before its
  first keystroke — without it, "focus fell back to `<body>`" would fire on a
  storm that never focused anything.
- `storms` is two of `pointer`, `keyboard`, `mixed`. The guard row fails on any
  other count; see [How long a run is](#how-long-a-run-is).
- `unwind` is optional, and is for leftovers `Escape` does not clear: a dialog
  the storm reopened after the last `Escape`, a sticky toast still on the page, a
  dropped file still in the list. It runs before `recover`, its throws are
  ignored — it is setup, not a measurement.
- `recover` should assert a gesture that family's own `*.browser.ts` suite
  already pins, and should not assume where the storm left the widget. Drive it
  to a known state first if the assertion depends on one: `driveTo` presses a
  two-state control until it reads the value you want, `calendar` measures its
  arrow against whichever day holds the roving stop rather than a fixed date,
  and `otp` empties its boxes with `Backspace` before typing one digit.

The storms find their own targets: anything inside the root that looks
interactive (a button, a field, a link, anything with a `role`, a `tabindex`, an
`aria-expanded` or an `aria-haspopup`). No per-family gesture list to maintain.

The lane may query the DOM freely — the `element()` handle rule in `SPEC.md`
binds family source, not tests.

## Findings

What the storms turned up. Nothing here is fixed in this lane — the lane's job
is to produce the reproduction, and the families and the runtime are owned
elsewhere. Every family below stays in the exploratory set.

The pinned CI seed `20260828` is red on 13 of 71 rows as this lands. That is the
lane doing its job on its first full pass, not a lane to weaken: the storms and
the invariants are unchanged from the pilot, and the recoveries are the families'
own pinned gestures. Read the exclusion note under each finding before making CI
green with it.

### The runtime's error reporter destroys the error it was handed

- **Families:** colorpicker, crop, fileupload, ink, pad
- **Seed:** `CHAOS_SEED=20260828`; storm seeds 1618785780 (colorpicker/pointer),
  1015029678 (colorpicker/mixed), and the crop and fileupload rows of the same run
- **Storms:** pointer and mixed
- **Gesture excerpts:**
  - colorpicker/pointer: `01 jitter-drag 5 steps within 11px on [data-testid="root"]`,
    `02 interrupt: hold [data-testid="root"], then End + click [data-testid="hue-thumb"], then release`,
    `03 toggle-thrash x6 on div[role="slider"]`
  - colorpicker/mixed: `01 toggle-thrash x6 on div[role="slider"]` — one gesture is enough
  - crop/pointer: `01 jitter-drag 9 steps within 19px on [data-testid="handle-block-start"]`,
    `02 rage-click x4 on [data-testid="root"]`
  - fileupload/mixed: `03 interrupt: hold [data-testid="trigger"], then PageDown + click [data-testid="field"], then release`,
    `04 toggle-thrash x6 on [data-testid="trigger"]`
- **What is reported:**
  `TypeError: Cannot set property code of  which has only a getter`, thrown at
  `packages/web/src/runtime-error-reporting.ts:25` (`reportable.code = code`),
  reached through `resume-events.ts` `dispatchViewEvent` → `reportRuntimeError`.
- **Cause hypothesis:** a handler threw a `DOMException`, whose `code` is a
  read-only accessor, and the reporter assigns to it while enriching — so the
  reporter throws, the original error is lost, and what surfaces says nothing
  about what actually went wrong. The likeliest original is an unguarded
  `setPointerCapture(pointerId)` for a pointer id with no active pointer
  (`crop.tsrx:191`, `crop.tsrx:230`, `colorpicker.tsrx:246`, `colorpicker.tsrx:288`),
  but that is a hypothesis: the masking is what makes it one rather than a
  reading. fileupload calls `setPointerCapture` nowhere, so its throw is
  something else, equally masked.
- **Why this is the first finding to fix:** every other defect these three
  families have is invisible until the reporter stops eating it.

If a CI run has to be green before that lands, exclude `colorpicker`, `crop`,
`fileupload`, `ink` and `pad` by name — and record here that the exclusion is
standing, with the date, so it does not quietly become permanent.

### A keyboard storm leaves menubar's focus behind its own menu

- **Family:** menubar
- **Seed:** `CHAOS_SEED=20260828`; storm seed 204403345
- **Storm:** keyboard (the mixed storm of the same run is green, so the recovery
  script itself is sound)
- **Gesture excerpt:** thirty key mashes at the bar and inside its panels,
  including `04 key-mash s Shift+Tab ArrowDown PageUp p at [data-testid="bar-file"]`
  and `10 key-mash e PageUp Shift+Tab ArrowUp End at [data-testid="level-recent"]`
  — both of which `Shift+Tab` out of an open menu.
- **What is reported:** after the storm, `Enter` on `bar-edit` opens `panel-edit`
  as it should, but focus is on some other element rather than `item-undo`.
- **Cause hypothesis:** a `Shift+Tab` out of an open panel leaves the bar's
  roving state pointing at the item the storm walked off, so the next open moves
  focus relative to that stale position rather than to the panel's first command.

### A keyboard storm stops modal from taking focus into its dialog

- **Family:** modal
- **Seed:** `CHAOS_SEED=20260828`; storm seeds 458575258 (keyboard) and the mixed
  row of the same run
- **Storms:** keyboard and mixed — both of modal's storms
- **Gesture excerpt:**
  `06 key-mash   Tab a ArrowUp Shift+Tab Escape at [data-testid="trigger"]`
  (`Tab` walks off the end of the page and `Shift+Tab` comes back), then repeated
  `Escape` bursts at the trigger and the root.
- **What is reported:** the dialog reopens — the backdrop assertion before it
  passes — but `content.contains(document.activeElement)` stays false. The dialog
  is on screen with focus still outside it, which is the one thing a modal may
  not do.
- **Cause hypothesis:** the storm's `Escape` bursts and its walk off the end of
  the tab order leave the family holding a focus-restore target that no longer
  exists, and the reopen's focus move is skipped rather than retried.
- **Reproduced twice, on two independent seeds** (`20260828` and `1853720671`),
  in both of modal's storms each time. `drawer`, whose entry asserts the same
  focus move, is green in both runs — so this is modal's own, not the lane's
  reading of what a dialog owes.

### A keyboard storm stops radio-group's arrow from choosing

- **Family:** radio-group
- **Seed:** `CHAOS_SEED=20260828`; storm seed 1407382990
- **Storm:** keyboard (the mixed storm of the same run is green)
- **Gesture excerpt:** `01 type "tsn" into [data-testid="monthly-field"]`,
  `09 key-mash ArrowLeft Shift+Tab p PageDown PageUp PageDown at [data-testid="monthly-field"]`
  (`Shift+Tab` walks off the page), then repeated `type ... after clearing` into
  the option fields.
- **What is reported:** `ArrowDown` from `monthly-field` moves focus to
  `annual-field`, but `annual-indicator` stays empty instead of reading `Chosen`.
  The move happened; the choice did not.
- **Cause hypothesis:** the storm writes directly to the hidden option inputs'
  `value` (that is what `type-into` does, because a dispatched keydown changes no
  input value), and the group's chosen-option cell and the inputs' own checked
  state come apart — after which an arrow moves the roving focus without the
  group agreeing anything was chosen.

### The storm used to navigate the page away

Found and fixed here, because it was the lane's own defect rather than a
family's: `hovercard`'s trigger is a real `a[href]`, a dispatched click follows a
link exactly as a real one does, and the run died with `Cannot connect to the
iframe. Received URL: .../users/jane`. `holdTheLinksOnThePage` in
[`actions.ts`](./actions.ts) now cancels navigation last in the bubble phase, so
every family handler still sees the untouched click.

### An otp box shows a character the field no longer holds

- **Family:** otp
- **Seed:** run seed `1853720671` (the exploratory run; the pinned CI seed does
  not reach it)
- **Storm:** keyboard
- **What is reported:** recovery empties the code with six `Backspace`s and polls
  the field to `''` — which passes — then types `4`, and box zero reads `'e'`.
- **Cause hypothesis:** the box's painted character is a cell that did not follow
  the field back to empty, so the box and the field disagree.
- **Caveat worth carrying:** the letters came from the storm's `type-into`, which
  writes `input.value` directly because a dispatched `keydown` changes no value —
  so the family's own character guard never saw them, and a real keyboard could
  not have put an `e` there. The disagreement between the box and the field is
  still real; how a person would reach it is not established.

### Which seed to run

The pinned CI seed is `20260828`. Both seeds run so far land on the same core
set, which is why it is worth pinning one rather than chasing the dice:

| Run                     | Red rows | Families                                                    |
| ----------------------- | -------- | ----------------------------------------------------------- |
| `CHAOS_SEED=20260828`   | 13 of 71 | colorpicker, crop, fileupload, ink, pad, menubar, modal, radio-group |
| run seed `1853720671`   | 15 of 71 | colorpicker, crop, fileupload, ink, pad, modal, otp, radio-group     |

## Known limits, v1

- **Gestures are dispatched, not driven.** Real pointer and keyboard input over
  the browser protocol would cost minutes of round trips per family and add
  timing the seed cannot reproduce. Dispatched events reach the same handlers.
  Trusted input is the obvious v2 axis, and the recovery step already uses it
  where a family's own suite does.
- **`Tab` moves focus by emulation, not by the browser.** The lane computes tab
  order and focuses the next element itself (see [Emulated `Tab`](#emulated-tab)).
  It is a good model, not the browser's own: focus inside a shadow root, an
  `iframe`, or a `dialog`'s top layer is not accounted for, and neither is the
  browser chrome the real key hands focus to.
- **A dangling `aria-controls` is not reported.** These families keep their
  surfaces attached, so it would be a real defect, but a storm can be read
  mid-move and a first run should not be spent on it.
- **CSR only.** Server-rendered mounts are not stormed.
- **Links do not navigate.** A dispatched click on an `a[href]` would follow it
  and tear the test iframe out from under the run, so the storm cancels
  navigation last in the bubble phase. Every family handler still sees the
  untouched click; what is not covered is a family whose contract is what happens
  *after* the page changes.
- **`type-into` writes the value directly**, because a dispatched `keydown`
  changes no input value. That reaches a family's `input` handler, but not its
  character guard — so a storm can put a character into a field that a real
  keyboard could not. Weigh that when reading a finding that turns on a field's
  contents.

## Typechecking

`chaos/tsconfig.json` is here because the root `tsconfig.json` includes only
`src/**` and `test-support/**` for this package:

```sh
node packages/typescript-plugin/src/tsc.ts -p packages/headless/components/chaos/tsconfig.json
```

`chaos/vitest.config.ts` is excluded from it, the same way
`test-support/vitest.config.ts` is excluded from the root config: `defineConfig`
comes from `vitest` and `playwright()` from `vite-plus`, which ships its own copy
of the vitest types, and the two do not unify.
