# U723 — focus after a removal: what the commit actually does, and the replay that answers it

taglist's keyboard removal focused a live neighbour and left the page on `<body>`. U697 measured
the symptom and named a plausible mechanism ("the commit removes the element that had focus, and
removing a focused element resets focus to the body"). This unit measured the ordering directly.
The symptom is real, the guarantee is now held by the runtime, and the mechanism is one step to the
side of the one that was written down.

## The measurement

Instrumented `display-only.tsrx` in the browser: `HTMLElement.prototype.focus` patched to log every
call with the active element before and after it, plus a document-wide `MutationObserver` logging
every removal with the active element at that moment. Focus green's delete button, press Delete:

```
focus(itemclose-green) from BODY
  -> active itemclose-green connected=true
focus(itemclose-blue) from itemclose-green
  -> active itemclose-blue connected=true      <- the handler's call TOOK
removed item-green active=BODY
removed item-red   active=BODY
removed item-blue  active=BODY                 <- the row focus was on is taken out too
removed #text      active=BODY
final active=BODY sameBlue=true
```

Three facts, none of them guesses:

1. The handler's `focus()` **took**. The neighbour was connected and focused before the handler
   returned, so this was never a focus refused by a hidden or inert target.
2. The commit removed **every** row, not just the removed one — including the row holding the
   focus the handler had just landed. The buttons are the same nodes afterwards
   (`sameBlue=true`), so they were re-inserted, not re-minted.
3. Focus was gone by the first removal. Taking the focused node out of the document is what reset
   the page to `<body>`; the previously focused element (green's button) had already lost focus to
   the handler's own call by then.

So U697's account was right that a removal blanks the focus and wrong about which removal: it is
the commit taking out the node the handler focused, not the node the handler focused *away from*.
Both are true in taglist's gesture, which is why the wrong one was believable.

## What reproduces it, and what does not

`packages/vitest-browser/browser/focus-after-removal/` carries three pages, each in CSR and SSR.
All three do the same thing: the handler drops the focused row's key from a keyed collection and
focuses the neighbour's button, read off a plural `element()` handle after the write.

| page | row shape | before the fix |
| --- | --- | --- |
| `keyed-row-page.tsrx` | page-local `state` array, each row a `<div>` wrapper | green |
| `flat-sibling-page.tsrx` | same, the button IS the row root (no wrapper) | green |
| `component-row-page.tsrx` | widget-scope `shared()` holding the collection and the plural handle, each row a component rooting its own instance | **red: `<body>`** |

A keyed repeat over plain elements keeps its surviving rows in place, so nothing disturbs the focus
and the two plain pages were green before this unit's change. The ingredient is the **component
row**: a repeat whose rows are component roots re-inserts the rows it keeps, and re-inserting the
focused node drops the focus. That is taglist's shape (`taglist.item` roots one instance per tag),
and `component-row-page.tsrx` is the smallest thing that reproduces it - no field, no live region,
no edit session, no cap.

A double write of the same keys in one handler (the round trip a consumer's `onChange` makes) was
tried on the plain page and did **not** reproduce it. That excludes the leading suspect U697 left.

## The fix

`packages/web/src/resume-events.ts`. The hold was already there for a focus a hidden or inert target
REFUSED; it now covers a call the target took and the commit undid:

- the shim records the last `focus()` of the dispatch either way, with a `took` flag read at the
  call site;
- at the end of the commit, a hold whose call took is landed only if the document has fallen back
  to its `body`. An element that claimed focus in the meantime keeps it.

The body test is what keeps overlapping dispatches working: a menubar item that opens its surface by
dispatching a synthetic event lands the inner dispatch's focus first, and the outer dispatch must
not steal it back. A commit that dropped the focus leaves the body; a dispatch that moved it leaves
a real element. Node rows for both are in `packages/web/test/focus-hold-per-dispatch.test.ts`.

No frame is waited on and nothing polls: the replay runs at the same flush the writes commit in.

## Bytes

The replay costs real bytes in the always-loaded dispatch chunk, and the fixture runtime-chunk
budget (5,190 gzip, a hard budget rather than an anchor) does not have room for it. It was paid for
inside the two files this unit owns rather than by raising anything:

- `resume-events.ts` and `render-csr.ts` each built the focus-preload name lists by spreading three
  arrays on every call. Both now hold the two composite lists as module constants and return them;
  `isFocusPreloadEventName` is one `includes` over the longer list instead of three. Same names,
  same answers, no per-call allocation.
- `dispatchViewEvent`/`dispatchRowEvent` opened the focus-commit window as the first statement
  inside their `try`, which forced a `let focusCommit = 0` and a `!== 0` guard in the `finally`.
  Opening it before the `try` cannot throw, so both are gone.

Measured on this tree, all at NODE_ENV=test through the tests themselves:

| gate | before | after |
| --- | --- | --- |
| fixture largest runtime chunk (`@fixtures/vite-csr`) | 5,190 budget, passing | passes |
| music-player CSR `page-load execute` | 14,344 (ceiling 14,349) | 14,343 |
| music-player CSR `page-load download` | 137,363 | 137,471 |

`page-load download` is red on this tree **before** this change (137,363 against a 137,362 ceiling)
and its own anchor comment records that the stage is not reproducible run to run - three builds on
one unchanged tree spread over 800 bytes and the chunk count itself moved. The +108 here sits inside
that band, on a stage that was already over. Not attributed, not repaid, not raised.

The resume closure wall is untouched: `resume-events.ts` is in no closure the wall governs
(`event-only-resume` 2,961, `resume` 20,931, `resume-runtime` 20,970 - the anchor - all measured
with the wall's own walk, none containing this file).

## taglist

`taglist.browser.ts`'s "delete on a focused tag removes it and focus lands on the neighbour" row
now pins DOM focus, in both CSR and SSR: the neighbour's button is the same node before and after,
and it holds the focus. The comment that said DOM focus was not pinnable here is gone. The family
source was not touched - the ordering it already ships (write, then read the handle, then focus) is
the one the rule asks for.

Two rows in that file still flake at baseline, on this tree with this change reverted as well as
with it in: `CSR/SSR: the cap refuses the tag past it and says so` and `SSR: the form field drops a
tag the row started with, and takes it back`. They are typing rows, they fail one per run and never
the same one twice, and they are unrelated to focus.

## Leads this unit did not chase

A handler *inside* an `@if` branch that writes the branch's own condition did not commit in CSR
while the same page in SSR did (`dropped` stayed `false`, read off an attribute binding on an
element outside the branch, so the write itself never landed). It was found while building a
flat-sibling page around a branch, and the page was rebuilt around a keyed repeat instead, so
nothing in the suite pins it. It wants its own card.
