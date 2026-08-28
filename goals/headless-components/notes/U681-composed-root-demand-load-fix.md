# The cold menubar defect: what was measured, and what it is not

Five `menubar.browser.ts` CSR rows fail only when the menubar suite runs beside
the menu and toolbar suites. This unit set out to fix the runtime cause. It did
not find it. What follows is the measurement, so the next attempt does not
re-walk the same ground.

## The failure is intermittent, and it selects by item

Running

```
pnpm exec vitest run --project ui packages/headless/components/src/menubar packages/headless/components/src/menu packages/headless/components/src/toolbar
```

five times on this machine gave three red runs (the same 5 rows each time) and
two fully green runs. Neither pair — menubar+menu, menubar+toolbar — ever went
red. Three suites is enough load on the one dev server to widen the demand-load
window; two is not.

The five red rows are not the five slowest rows. They are exactly the rows whose
gesture lands on the second or third bar item:

| row | item pressed | result |
| --- | --- | --- |
| Enter and Space open an item's menu | `bar-edit`, `bar-view` | red |
| an arrow inside an open menu closes it | `bar-file` | green |
| an arrow on an open item travels too | `bar-edit` | red |
| Escape closes the open menu | `bar-edit` | red |
| a command reports to the bar's own root | `bar-edit` | red |
| a command in a nested submenu | `bar-file` | green |
| a checkbox command toggles | `bar-view` | red |

Every row that presses the first item passes; every row that presses a later one
fails. Each row mounts its own fresh page, so position in the file is not the
variable — which rendered instance the gesture lands in is. That matches the
U677 probe: the press moves the bar's own cells correctly and writes `expanded`
on the first item's level instance.

## Three candidate causes were measured and ruled out

**The widget registry is empty when the cold read resolves.** A probe inside
`marklessComposedGraphNodeId` (`packages/web/src/fns/instance-scope.ts`) logged
every `menubar.tsrx` id resolution together with the registry it consulted. 198
of them did resolve against a registry holding no roots at all. A stack probe on
exactly those showed every one arriving from `marklessComposedSharedDefinition`
during composition — the registry is filled as composition merges children, so
an empty registry early in that walk is the design, not the defect. None came
from dispatch.

**The qualification picks the wrong root for the later items.** A detector was
added that fires whenever an id spelled at `c0:p9…` or `c0:p13…` (the second and
third items' paths) resolves to anything other than that item's own root. It ran
through a red run — all five rows failed — and printed nothing. Id qualification
is not producing the wrong instance for the item that was pressed. The wrong
instance therefore comes from running the first item's symbol, not from
mis-qualifying the pressed item's.

**`marklessEnclosingWidgetRoots` prefers the first rendered instance.** This is
the packet's named starting point, and it is off the path: it belongs to
`row-component-mint.ts`, which runs only for client-minted repeat rows, and
`menubar/scenarios/basic.tsrx` writes its three items out longhand with no
repeat anywhere.

## The packet's other pointer is also off the path

`packages/web/src/inline/resumer.ts` and its primed replay are the SSR
bootstrap: the body keys off `[data-async-container]` and a
`script[type="markless/view"]`. The five failing rows are all CSR. The CSR cold
window is `installDelegatedTriggers` in `packages/web/src/render-csr.ts`: one
capture listener per event name, a `recordsByElement` map keyed by element, and
`dispatchQueued`, which holds the event until `demandRuntime()` has built the
graph and imported `resume.ts`. Anything that picks a first instance on the cold
CSR path lies between that queued dispatch and the symbol that finally runs, in
`resume-events.ts` `createEventWiring`. That is where the next attempt should
start, not in the inline resumer.

## The witness still does not reproduce

`packages/vitest-browser/browser/composed-root-demand-load/` was driving its
gesture through `userEvent.keyboard`, whose round trip out to the browser driver
and back is long enough for the handler module to land — the demand-load window
the witness exists to hold open was already shut. It now dispatches the keydown
synchronously one statement after `focus()`, which is the shape the menubar rows
use. That was not enough: the witness is still 4/4 green. The remaining
difference from the menubar has not been isolated. The candidates not yet ruled
out are the third widget level (the menubar has a page-level bar root above the
per-item roots; the witness has none), the surface being projected through two
components rather than one, and the `overlay` behaviour, which CSR activates
before the graph exists and which therefore resolves its element handles against
`marklessWidgetScope.active` rather than the page's own registry.
