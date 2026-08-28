# U697 — taglist's three recorded defects, measured

U692 filed three findings against taglist and diagnosed none of them. All three were re-measured
here. Two of the three descriptions were wrong about where the failure is, and the third does not
reproduce at all in the shape it was reported.

Everything below is a browser measurement, not a reading of the source.

## 1. The hidden form inputs — not the form, and not the value

U692's account: "in `topics-form.tsrx` the delimiter clears the field but `taglist.value` never
changes, and the hidden inputs stay at the tag the scenario started with. The identical gesture
against `basic.tsrx` passes."

That account is wrong in two ways, and the wrongness is what points at the cause.

`taglist.value` **does** change. A temporary `ui-count={taglist.value.length}` attribute added to
`taglist.field`'s own host element — the very element the repeat is inside — refreshed from 1 to 2
on the gesture, on the same write, in the same turn. The chips and the consumer's `held` output
updated too, which means `take()` ran, wrote the cell, and called `onChange`.

`basic.tsrx` **does not** pass. It only looks like it does because no row in the suite reads the
hidden inputs after an add. Bisected with a scratch suite over four scenarios:

| scenario | after typing `sport,` | hidden inputs | `ui-count` | chips | `held` |
| --- | --- | --- | --- | --- | --- |
| `basic` (`<main>`, no extra parts) | — | `alpha, beta` | 3 | `alpha, beta, sport` | `alpha\|beta\|sport` |
| `basic` wrapped in a `<form>` | — | `news` | 2 | `news, sport` | `news\|sport` |
| topics-form's parts and props under `<main>` | — | `news` | 2 | `news, sport` | `news\|sport` |
| `topics-form` as shipped | — | `news` | 2 | `news, sport` | `news\|sport` |

Every scenario behaves identically. The `<form>` ancestor is not an ingredient, the `error` and
`description` parts are not ingredients, and `required`/`invalid` are not ingredients — U692 had
already ruled the last pair out and stopped one bisect short of ruling out the rest.

Two further gestures separate what works from what does not:

- Removing a tag the first render carried: the hidden input goes away. Works.
- Removing that tag and typing it back in: its hidden input comes back. Works.
- Adding a tag the first render never carried: **no hidden input is ever minted.**

So the defect is exactly this: **a keyed `@for` over the family's own collection drops and restores
rows for keys the first render produced, and never mints a row for a key it did not.** An attribute
binding over the same cell on the same host element refreshes on every one of those writes, so the
cell is subscribed and the write reaches the DOM — only the row minting is missing.

Two rows in `taglist.browser.ts` stay pinned `test.fails` with that mechanism named in a comment
above them, and a new green row (`the form field drops a tag the row started with, and takes it
back`) pins the half that works so a future fix cannot regress it silently.

This is `packages/vitest-browser/browser/shared-repeat.test.ts`'s own stated open edge, quoted from
its file comment: "Growing a repeat PAST the served keys is defect 84 … it is the same gap through a
shared instance and not this fix's to close." `krg.test.ts` has no pinned rows left for plain state
or computed collections, so the shared-instance case is what remains.

### The witness, and what it does not prove

`packages/vitest-browser/browser/taglist-form-value/` reproduces the shape without taglist: a
widget-scope `shared()` spread-object factory, one part holding a keyed `@for` over the collection,
and a sibling part writing it.

**It does not reproduce the taglist failure.** The root writes the collection from its own prop,
which is exactly `TagListRoot`'s `taglist.value = value`, and every row is green in CSR and SSR —
including growth past the keys the first render carried. So the ingredient is something taglist
still adds on top of that reduction. The six rows ship anyway: they are the floor a fix must not
break, and they say which half of the behaviour already works.

One variant was built and then taken back out, and it is worth writing down. With a root that only
*reads* the collection — nothing outside the instance ever writing it — a sibling part's handler
write reaches nothing at all, and the reason is a real runtime throw rather than a silent no-op:

```
TypeError: context.graph.read is not a function or its return value is not iterable
  at symbol_0_… (the emitted handler module for shared-grow-family.tsrx)
  at packages/web/src/fns/instance-scope.ts:341
```

It is a separate defect from the taglist one and it cannot be pinned with `test.fails`, because the
unhandled rejection fails the whole file regardless of the row's expectation. It wants its own card.

### Blocked: which framework function owns this

Blocked, per the packet. The owning function has to be named by someone who can read
`packages/web` and `packages/compiler`, both of which this unit is fenced off from. The question for
that card is:

> A keyed `@for` over a widget-scope `shared()` instance's array cell reconciles keys the first
> render carried and mints nothing for a key it did not. Which function decides the mintable key set
> for a repeat whose source is a shared instance, and why does the same repeat over a component's
> own `state()` object mint correctly?

Two compiler diagnostics blocked the reduction from going further, and each is a candidate
ingredient in its own right — a witness for the taglist shape cannot be authored around them:

- `MARKLESS_STATE_UNRESOLVED_WRITE` — "Cannot write to `box` because the compiler cannot resolve that
  target", raised at the **call site** of a factory method that takes a parameter and writes a cell
  (`box.add('gamma')`), in a part whose template reads the instance through `computed()`. taglist's
  `taglist.take(...)` and `taglist.remove(...)` are that exact shape and compile; the reduction's do
  not, and the difference was not found.
- `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` — invoking a callback slot (`box.onChange?.(…)`)
  from a handler rather than from inside a factory method emits a handler module that still names
  the instance. This is why the witness could not close the loop taglist actually runs: `take()`
  writes the cell **and** calls `onChange`, whose consumer writes `own.tags`, which re-runs the
  root's `taglist.value = value` — a second write to the repeat's source cell, from a component body,
  in the same turn. That double write is the leading unexcluded suspect and the first thing the
  framework card should try.

## 2. Focus after a keyboard removal — the family focuses a live node; the commit blanks it

Measured on `display-only.tsrx`: focus the `green` tag's delete button, press Delete.

- `held` becomes `red|blue`: the removal committed.
- `document.activeElement` is `<body>`.
- The `blue` delete button is the **same DOM node** before and after the gesture, and is still
  connected.

That last line disproves the family's own comment, which said the neighbour was looked up before the
removal because "afterwards the repeat has already taken this row out and a stale node takes no
focus". The keyed repeat does not replace the neighbour. The family focuses a live, connected
element and the focus is gone by the time the write is visible.

Moving the lookup to after `taglist.remove()` — the ordering the repo rule prescribes, write commits
then focus lands — changes nothing: still `<body>`. The reordered form is what ships now, because it
is the ordering the rule asks for and its comment now records the measured fact instead of the wrong
one. No retry loop was added; per the repo rule a first gesture that needs frames is a runtime bug.

The mechanism this leaves: the handler focuses the neighbour, the handler returns, the runtime
commits the removal of the element that had focus, and removing a focused element resets focus to
`<body>` — clobbering the focus the handler asked for. That is the focus replay in
`packages/web/src/resume-events.ts` not re-landing a handler's focus after the commit that took the
old focus owner out. The existing `browser/write-then-focus/` witnesses hold the runtime to
"a handler's focus is landed by the time its write is visible" for a **revealed** element; this is
the same guarantee for the case where the same commit **removes** the previously focused element.

Blocked on the same fence: `packages/web` is another unit's. The browser row stays as U692 left it,
pinning the highlight and stating that DOM focus is not pinned here.

## 3. A consumer component reading `taglist.state()` — does not reproduce as reported

U692: "Moving the repeat into a nested `function Row()` that calls `taglist.state()` gave
`undefined` for every seeded cell, including `name`."

It does not. `scenarios/consumer-state.tsrx` mounts a consumer-owned `Summary()` component inside
`taglist.root` that calls `taglist.state()`, and every seeded cell reads correctly in CSR and SSR:
`ui-name` is `topics`, `ui-count` is `2`, and the text is `alpha|beta`. That is a green row now.

What that scenario did surface is narrower and is the same split as finding 1. After adding a tag:

- `ui-count={list.value.length}` on the `<output>` refreshes to `3`.
- the element's text child, `{list.value.join('|')}` on the same element, stays `alpha|beta`.

An attribute over the collection refreshes; a text child derived from the same collection on the
same element does not. Pinned `test.fails` with that stated in a comment. It belongs with finding 1
on the framework card, not with the cross-family adopted-ownership class in `U670*`/`U656*` — those
are about an instance resolving to the wrong owner, and here the instance resolves correctly and
one binding kind out of two refreshes.

## Files

- `packages/headless/components/src/taglist/taglist.tsrx` — the delete-key handler reads the
  neighbour's element after the removal instead of before, and its comment states the measured fact.
- `packages/headless/components/src/taglist/scenarios/consumer-state.tsrx` — new; a consumer
  component reading `taglist.state()` inside the root.
- `packages/headless/components/src/taglist/taglist.browser.ts` — three new rows (two green, one
  pinned), and a mechanism comment over the pinned form rows.
- `packages/headless/components/src/taglist/note.md` — findings rewritten against the measurements.
- `packages/vitest-browser/browser/taglist-form-value/` — the reduction; green, and green is the
  finding.
