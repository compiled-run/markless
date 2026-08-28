# The five menubar rows: not instance resolution, a resting mouse

The defect U677 and U681 chased is measured and closed. It is not a widget
instance the runtime resolves wrongly, and there is nothing to fix in
`packages/web`. The five rows fail because the real mouse cursor is parked over
the bar's first item when the page mounts, and the bar's own hover-after-open
rule then hands the open menu over to that item. The fix is one line in the
menubar suite, which this unit's contract forbids it to touch.

## What was instrumented

Temporary probes in `packages/web`, all reverted:

- `resume-events.ts` `dispatchViewEvent` — the element's `data-testid`, the
  event name and key, `eventRecord.hostNodeId`, `symbolIds`, `performance.now()`
  and the `hidden` state of every `panel-*` on the page at that moment.
- `render-csr.ts`, inside `installDelegatedTriggers`' capture listener, before
  any `await` — so its order IS the browser's dispatch order: event name,
  target, `isTrusted`, `event.timeStamp`, `performance.now()`.
- `fns/instance-scope.ts` `marklessComposedGraphNodeId` — every id containing
  `menubarItemState`, with the instance path in, the id out, the widget registry
  it consulted, and a stack slice.

## Instance resolution is correct on the red run

On a red run of the failing row (`CSR: Enter and Space open an item's menu on
its first command`), the keydown on `bar-edit` matched
`hostNodeId c9:c1:h1`, symbol `bound:symbol%3A4:component-edge%3A9` — the second
item's own record — and every id it read or wrote qualified to `c0:p9:`, which
is the second item's own root. The third item's Space qualified to `c0:p13:`.
The registry held all three roots (`c0:p2:`, `c0:p9:`, `c0:p13:`). Nothing
resolved to the first item. `sameTestid` and the `panel-edit` count were both 1,
so there was never a second container on the page either.

## What actually happens

The capture probe shows three events arriving in one millisecond, in this order:

```
CAPTURE now=3441 focusin     target=bar-edit  trusted=true
CAPTURE now=3441 keydown Enter target=bar-edit trusted=false
CAPTURE now=3441 pointerover target=bar-file  trusted=true    <- nobody hovered
  RUN   now=3446 keydown Enter  el=bar-edit    panel-edit hidden
  RUN   now=3450 pointerover    el=root        panel-edit SHOWING
  RUN   now=3457 click          el=bar-file    (menubar-walk reveal)
  RUN   now=3462 click          el=bar-edit    (menubar-walk conceal)
```

The `pointerover` is trusted and lands on `bar-file`. It is the mount
re-hit-test `packages/headless/components/test-support/pointer-parking.ts`
already documents: Chromium hit-tests again when a tree mounts under a resting
cursor, and fires `pointerover` on whatever is underneath without the pointer
moving. The bar's `onPointerover` is Radix's hover-after-open rule — do nothing
until some menu is open, then open the neighbour at once. It arrives after the
Enter has opened `panel-edit`, so `open !== -1`, and `menubar-walk.ts` `reveal`
clicks `bar-file` open and `conceal` clicks `bar-edit` shut. The row then polls
`panel-edit` for five seconds and times out.

That is also why `expanded` looked like it landed on the first item: it did land
there, through a click the family itself dispatched at `bar-file`, one gesture
later — not through a mis-resolved instance.

## Why exactly those five rows

The rule predicts the table in U681 exactly. The stray `pointerover` is harmless
when nothing is open (the walk rows) and harmless when the open menu is already
`bar-file`'s, because `isShowing(wanted)` returns early. It is fatal whenever the
open menu belongs to any other item:

| row | open when the stray hover lands | result |
| --- | --- | --- |
| ArrowDown/ArrowUp opens an item's menu | `panel-file` | green |
| Enter and Space open an item's menu | `panel-edit` | red |
| an arrow inside an open menu closes it | `panel-file` | green |
| an arrow on an open item travels too | `panel-edit` | red |
| Escape closes the open menu | `panel-edit` | red |
| a command reports to the bar's own root | `panel-edit` | red |
| a command in a nested submenu | `panel-file` | green |
| a checkbox command toggles | `panel-view` | red |

It also explains the CSR/SSR split. The SSR rows sit after
`CSR: nothing opens on hover…`, the one row that calls
`parkPointerClearOfMount()` and then hovers real items; by then the cursor is off
the bar and no SSR row saw a stray `pointerover` in any measured run.

## Why it looked like a demand-load race

It is file ORDER, not load. Across four instrumented runs of the three-suite
command the correlation is exact:

| run | file order | stray trusted `pointerover` in the menubar suite | result |
| --- | --- | --- | --- |
| 1 | menubar, menu, toolbar | none | green |
| 2 | menu, menubar, toolbar | nearly every CSR row | red |
| 3 | menubar, menu, toolbar | none | green |
| 4 | menu, menubar, toolbar | nearly every CSR row | red |

The menu suite's context-menu rows are the only ones on the lane that drive a
real pointer, and they leave the cursor where the menubar's first item renders.
Whenever the menu file runs before the menubar file, the whole menubar CSR half
mounts under that cursor.

U681 reported that the pairs never went red. That was ordering luck, not a load
threshold: running `menu` and `menubar` alone reproduces it. Two runs of the
pair here, menubar first, gave 153 passed; the run where the menu file went
first gave the same 5 failures. Two suites are enough — the load reading is
wrong.

## Why there is nothing to fix in the runtime

The capture probe records the browser's own dispatch order, before any `await`.
The browser sent `pointerover` AFTER `keydown`. A synchronous native listener
would run in the same order and see the same open menu, so the runtime did not
invert anything and the cold queue did not reorder anything: `dispatchQueued` is
FIFO and delivered the three events in arrival order. Suppressing a trusted
`pointerover` because the page mounted underneath it is also not available — the
event is indistinguishable from a real crossing, and a user whose cursor happens
to rest where a menu mounts should get hover behaviour.

So the ruling stands the other way from the packet's premise: the framework is
faithful here, and the CSR demand-load window is not the variable.

## The fix, and why this unit did not make it

`packages/headless/components/src/menubar/menubar.browser.ts` should park the
pointer before each mount, the way the hover row at line 370 already does:

```ts
beforeEach(parkPointerClearOfMount);
```

`parkPointerClearOfMount` is already imported in that file and is best-effort by
design, so a row that cannot reach the pad is unaffected. That file is
`packages/headless/**`, which this unit's contract forbids, so the change is
left for a unit whose contract holds it.

Two smaller things worth doing in the same pass. The park is a lane-wide
problem, not a menubar one — any suite mounting a hover-sensitive part after the
menu suite's real-pointer rows can take the same hit, so the parking belongs in
shared setup rather than one file's `beforeEach`. And if a row ever needs to
prove the family's hover-after-open rule, it should do it with an explicit
hover, which `CSR: nothing opens on hover…` already does.

## What was not built

The packet asked for a `packages/vitest-browser/browser/composed-root-demand-load/`
witness that goes red before a runtime fix and green after. There is no runtime
defect to hold, so no such witness was written; a red witness for correct
behaviour would pin a fiction. The existing witness stays as it is.
