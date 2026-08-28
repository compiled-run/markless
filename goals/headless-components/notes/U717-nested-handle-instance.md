# The nested handle read was never broken; the refusal had nowhere to land

`packages/vitest-browser/browser/own-instance-handle/` now exits **0 with 14
green rows and no unhandled errors**. It used to exit 1 with 12 green rows and
three unhandled `RuntimeResumeError`s. No file under `packages/web/src/` changed,
because nothing there was wrong.

## What the three errors actually were

Every one of them came from **one authored handler**, not from the nest:

```
symbol_0 … own-instance-handle%2Foutside-page.tsrx:symbol%3A0
 > Object.getElementHandle  resume-events.ts:147
 > get                      resume-locators.ts:173
 > ambiguousElementHandleError
```

Six occurrences of the message in the run, six naming `outside-page.tsrx`, zero
naming `nest.tsrx` or `pair.tsrx`. `OutsidePage` is the scenario whose header
says *"the read that must STAY refused"*: a page-level handler that stands inside
no rendered level asks for `nestLevelState`'s `contentEl`, which two rendered
levels bind. It asks under the bare compiled id, two elements are filed there,
and the registry throws — exactly the designed loud refusal.

The three errors were two window `error` events (the CSR row and the SSR row) and
one `unhandledrejection` (the SSR dispatch path is async, so the same throw
surfaces as a rejected promise). The rows stayed green throughout because they
only asserted the counter moved and no element was touched — which is true of a
throw.

So the process exit was never evidence of a wrong-element delivery. It was a
correct refusal running off the end of a handler that did not catch it.

## The nest levels resolve their own instance, and now a row says so

The three `NestContent` handlers each read the handle their own level binds, and
each reached its own element before this card and after it. The new rows,
`CSR/SSR resume: no refusal escapes the nest levels onto the window`, click
**all three** levels in turn (the old rows only clicked the inner two), assert
each level marked itself and no deeper level moved, and assert the window
capture stayed empty. The page-wide key is never what a level's handler
resolves.

## The bisect: U694 is exonerated

`6d01ccb2` was the prime suspect — `materializeElementHandles` gained a fourth
key, `rows + handleId`, filing a component-local handle under the row segments of
its host. Reverting that hunk to its pre-U694 shape and rerunning the file gives
**the identical result**: 12 passed, 3 unhandled errors, exit 1, all six error
lines naming `outside-page.tsrx`.

It could not have been the cause. `ROW_SEGMENT` matches `r:…:` segments of the
host node id, and none of these pages contains a repeat, so `rows` is the empty
string, `rows + handleId === handleId`, and the `new Set` drops it. The key set
on this page is byte-identical either side of the commit. The error predates it;
`git log` on the scenario directory dates the outside page to `cc6b1af1` /
`340de9b6`, both older.

The `TypeError: context.graph.read is not a function or its return value is not
iterable` quoted in the card does not appear in any run on this tip — zero
matches in the captured output before or after the fix.

## The fix, and why it is in the scenario and not the runtime

The refusal is a `throw`. The handler that asked is where a throw lands, and a
consumer who wants the page to survive it catches it. `OutsidePage` now does:

```js
try {
	level.contentEl?.setAttribute('data-outside-hit', 'yes');
} catch (error) {
	page.refused = String((error as { readonly code?: string } | null)?.code ?? 'unknown');
}
```

and publishes it as `data-refused`. The two outside rows keep every assertion
they had and gained one: the refusal is `MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS`,
named by the page itself. That is a stronger pin than the old rows, which could
not tell a refusal apart from a read that silently answered `undefined`.

Swallowing the throw inside `dispatchViewEvent` was the alternative and is the
wrong trade: it would make a refusal that a consumer never sees, which is the
silence this registry exists to end.

## The window capture is not decoration

`beforeEach` installs `error` and `unhandledrejection` listeners that record any
reason carrying a string `code` and `preventDefault()` it, in the shape
`repeat-owner-path/rop.test.ts` uses. To prove the capture is not vacuous, the
scenario's `catch` was removed and the file rerun: the two outside rows went red
on `expect(escaped).toEqual([])` with
`MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS` collected, and the nest rows stayed
green — the escape is real, the harness sees it, and it comes from the outside
page alone. The `catch` was then restored.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/web` — 94 files, 640 rows. The
  event-only resume closure wall is inside that lane and holds.
- `pnpm exec vitest run --project browser` over `own-instance-handle`,
  `item-collections`, `single-component-family` — 3 files, 44 rows, exit 0.
