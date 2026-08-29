# menubar conformance: why the two parts-present rows are only red in the full lane

## The two rows

`test-support/conformance.browser.ts > menubar > {CSR,SSR}: every part the scenario
writes is on the page`, run through `runConformance` in `test-support/conformance.ts:152`.

Full lane on the pilot tip (`pnpm exec vitest run --project ui`, 455s):

```
 Test Files  2 failed | 43 passed (45)
      Tests  3 failed | 2582 passed | 23 expected fail | 18 skipped (2626)
```

The assertion, identical in both modes:

```
AssertionError: exactly one [data-testid="menu-file"]: expected +0 to be 1
 ❯ expectOnePart test-support/conformance.ts:297:63
 ❯ test-support/conformance.ts:154:39
```

So the first wrong fact is not a race, a leaked document, a stalled demand load or
wall-clock: the part is not on the page because nothing renders it, in either mode,
on every run.

## Cause

Commit `3d449b06` ("menubar recurses with its own item/itemcontent") rewrote the
menubar Basic scenario. Before it, each menu on the bar was a whole `menu.root`
carrying `data-testid="menu-file" | "menu-edit" | "menu-view"`, with a
`menu.trigger` inside it named `bar-*`. After it the bar item *is* the menu level:
`menubar.item data-testid="bar-file"` composes `MenuRoot` internally
(`src/menubar/menubar.tsrx`, `MenubarItem`), and the scenario passes no testid to
that inner root — `{...rest}` goes on to `MenubarItemControl`, and `MenuRoot`
receives none. The three `menu-*` testids stopped being written.

The conformance descriptor's `parts` list, which is defined as "Every part testid
the Basic scenario renders at rest", was not updated in that commit and kept naming
all three. `menu-file` appears in exactly one file in the repo after the rewrite:

```
packages/headless/components/test-support/conformance.browser.ts:390: 'menu-file',
```

`menubar`'s barrel exports `root`, `item`, `itemcontent`, `label` only — there is no
`menu` part a scenario could name — so the fix is to drop the three dead names, not
to re-add a testid.

## Why narrowing hid it

`--project ui menubar` is a filename filter. `test-support/conformance.browser.ts`
has no "menubar" in its path, so a narrowed run never loads the file that holds
these rows. Receipt:

```
$ pnpm exec vitest list --filesOnly --project ui menubar menu
[ui (chromium)] packages/headless/components/src/menu/menu.browser.ts
[ui (chromium)] packages/headless/components/src/menubar/menubar.browser.ts
```

Two files, and the battery is not one of them. "Green when narrowed" was the rows
not running, not the rows passing. `3d449b06`'s own message ("green on its own,
51/51") was measured the same way, which is how the stale descriptor survived the
commit that made it stale. Any future menubar/menu change wants the battery named
explicitly — `pnpm exec vitest run --project ui menubar menu conformance` — or the
full lane.

## Fix

`packages/headless/components/test-support/conformance.browser.ts`: removed
`'menu-file'`, `'menu-edit'`, `'menu-view'` from the menubar descriptor's `parts`.
No family source changed; the DOM was already right.

Full lane after the fix, same machine:

```
 Test Files  45 passed (45)
      Tests  2585 passed | 23 expected fail | 18 skipped (2626)
```

Both menubar rows pass.

## Flake seen once, not reproduced

The pre-fix run's third failure was `src/popover/popover.browser.ts > SSR: a popover
served open is showing, and Escape closes it` ("Matcher did not succeed in time" at
popover.browser.ts:385) — a different family, outside this unit's file contract and
nothing to do with the menubar cause. It passed in the post-fix run with no popover
change, so it is intermittent rather than a standing red. Worth watching, not worth
a fix on one observation.
