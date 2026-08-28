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

```sh
pnpm exec vitest --config packages/headless/components/chaos/vitest.config.ts
```

It needs the same machine conditions as the other browser lanes: a Chromium that
Playwright can drive, and no other browser lane running at the same time.

One run is 6 families x 3 storms x 40 gestures. Minutes, not hours.

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

| Family   | Scenario                            |
| -------- | ----------------------------------- |
| menu     | `src/menu/scenarios/basic.tsrx`     |
| drawer   | `src/drawer/scenarios/basic.tsrx`   |
| select   | `src/select/scenarios/basic.tsrx`   |
| combobox | `src/combobox/scenarios/basic.tsrx` |
| tree     | `src/tree/scenarios/nested.tsrx`    |
| slider   | `src/slider/scenarios/basic.tsrx`   |

The scenarios are the ones a consumer would copy, used unchanged.

## Adding a family

One entry in [`families.ts`](./families.ts):

```ts
{
	name: 'accordion',
	mount: () => render(AccordionBasic),
	rootTestId: 'root',
	keyboardEntryTestId: 'shipping-trigger',
	async recover() {
		el('shipping-trigger').click();
		await expect.poll(() => el('shipping-content').hasAttribute('hidden')).toBe(false);
	},
},
```

- `mount` renders client-side only. The SSR harness rewrites its marker at the
  literal call site, so it cannot be reached through a descriptor.
- `keyboardEntryTestId` is where a keyboard-only storm puts focus before its
  first keystroke — without it, "focus fell back to `<body>`" would fire on a
  storm that never focused anything.
- `recover` should assert a gesture that family's own `*.browser.ts` suite
  already pins, and should not assume where the storm left the widget. Drive it
  to a known state first if the assertion depends on one.

The storms find their own targets: anything inside the root that looks
interactive (a button, a field, a link, anything with a `role`, a `tabindex`, an
`aria-expanded` or an `aria-haspopup`). No per-family gesture list to maintain.

The lane may query the DOM freely — the `element()` handle rule in `SPEC.md`
binds family source, not tests.

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
