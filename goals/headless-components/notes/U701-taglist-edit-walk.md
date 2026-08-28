# U701 — taglist's per-tag edit runs editable's session, and gains a keyboard route

U698 extracted the inline-edit session into
`packages/headless/components/src/editable/edit-walk.ts` and ruled that taglist should adopt it
rather than keep its hand-written twin. This unit does that adoption, and takes the one behaviour
U698 said the adoption buys: a way into per-tag edit that does not need a mouse.

No edits outside `packages/headless/components/src/taglist/**`. `edit-walk.ts` served taglist
unchanged — no helper change was needed, so no block was filed.

## What the family now imports instead of spelling

| From `edit-walk.ts` | Where it lands in taglist | What it replaced |
| --- | --- | --- |
| `editKey(key)` | `TagListItemInput`'s keydown | three hand-written `key === 'Enter'` / `key === 'Escape'` branches |
| `settled(previous, typed, keep)` | `settle()` on the shared instance | an early `if (keep !== true) return;` plus a separate `now.trim()` |
| `landCaret(box, words)` | `edit()` on the shared instance | three `if (box !== undefined)` lines writing, focusing and selecting |
| `opensEdit(detail, onDoubleClick)` | `TagListItem`'s click | `event.detail === 2` |

`settled` folds taglist's cancel path into its commit path rather than shortening it. Cancelling
settles on the words from before the session, and `rename(held, was, was)` gives the held array back
by identity, so the `after === held` guard that was already there is what ends a cancel — one branch
where there were two. The live-region phrase, the highlight it leaves behind and the `onChange` call
are untouched.

What deliberately did **not** move: `rename` stays in `tag-walk.ts`. It splices in place, drops the
tag when the words are emptied and merges when they collide with a tag already held. That is list
arithmetic over a keyed row of an array; `settled` answers for one string and knows nothing about
the row it sits in. This is the split U698 called for, kept.

## The keyboard route: F2 on the tag, Enter kept where it already was

The packet asked for Enter or F2 and for the researched default to be named. Both keys ship, for the
two different focus regimes — and the memo's default is the one that was already here:

**Enter, from the field, on the tag under the walk.** This is the researched default in
`goals/headless-components/notes/U692-taglist.md` ("Enter on a highlighted tag, or a double-click on
the tag, opens the edit input"; Ark/Zag and Melt both ship Enter). It was already implemented in
`TagListInput`'s keydown and is already green in the suite. It is untouched here.

**F2, on the tag that has DOM focus.** This is the regime that had no keyboard route at all, which
is what U698 meant by "taglist's `TagListItem` hand-writes `event.detail === 2`, and therefore has no
keyboard route through the item itself". A display-only row mounts no field, so the only thing a
keyboard reaches is each tag's delete button — and there Enter and Space are that button's own native
activation, which the U692 memo rules for itself ("Enter / Space | removes the tag"). One element
cannot answer for two meanings on one key without taking removal away from every reader who already
learned it, and the packet forbids changing an existing row. So the second regime takes F2, the
WAI-ARIA grid pattern's edit-in-place key and the convention a Windows user brings with them.

The handler sits on `taglist.item` and fires from the keydown that bubbles out of whatever inside the
tag has focus. It opens only when the row is `editable`, the tag is the one under the walk, it is not
already open, and **this tag actually mounts a `taglist.iteminput`** — the last is the packet's
"with an `iteminput` present", read off `taglist.editEls`, the family's own plural handle. F2 on a
display-only row therefore does nothing rather than hiding the tag's words behind a field that is not
there.

### One guard the click needed

`opensEdit` opens on `detail === 0`, which is how a control that asks for a double-click stays
operable from a keyboard. In this family a detail-0 click also arrives from Enter or Space on the
tag's own delete button, and it bubbles to the item — so a naive swap would have opened an edit on
the tag that press had just removed. The click handler passes over any click that came out of this
tag's delete button, using `handle.contains(node)` on the family-bound `closeEls` handle, which is
the one DOM predicate the package's DOM-access rule allows. A real double-click (`detail === 2`) and
a real single click are unaffected.

## Rows

Three new rows, each in CSR and SSR (six in total), in `taglist.browser.ts`:

- `F2 on a tag under the walk opens its own field with its words in it` — focus the delete button,
  wait for `ui-highlighted` to land, press F2; the tag's field is shown, focused, and carries the
  tag's words.
- `enter on a focused delete button removes the tag instead of opening it` — the row that pins the
  reason F2 was chosen. Without it, a future change to Enter would look free.
- `F2 opens nothing on a row that mounts no edit field` — the display-only row stays as it is.

The four `test.fails` pins are untouched and still expected-fail; they are framework cards
(`goals/headless-components/notes/U697-taglist-defects.md`).

## Verification, and a flake worth knowing about

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project ui packages/headless/components/src/taglist` — 91 passed, 4
  expected fail, 0 failed.
- `pnpm test:sr` — 315 passed, 10 expected fail, 4 skipped, over 40 files. The virtual-reader rows
  for taglist are untouched by this change.

**This suite flakes at baseline, before this unit's changes.** Measured by stashing the change and
re-running the same command on the pilot tip: one run came back `2 failed | 83 passed | 4 expected
fail`, the next `85 passed | 4 expected fail`. With the change in, the same happened — a first run
failed `the form field drops a tag the row started with, and takes it back`, a second failed a
different row (`the cap refuses the tag past it and says so`), and a third was fully green. The two
rows that flaked are both gestures that go through a demand load on a resumed document, which is the
area `U697` already has framework cards open on. A red run of this file is worth re-running once
before it is believed.

`pnpm test:sr` flaked the same way: the first run failed one row (`a committed tag reaches the same
live region` in `taglist.sr.ts`, which types into the field and waits on the live region), and the
two runs after it were fully green. Same shape — a first gesture waiting on a demand load — and the
same advice.
