---
name: markless-debugging
description: Use when debugging this markless app — dead clicks, missing updates, empty lists, build errors, or resume/loading problems. Query the live debug channel and run targeted checks instead of guessing from source.
---

# Debugging markless apps

Markless is compiled and fail-closed: most bugs are either an authored shape the compiler
rejects loudly, or a runtime question the debug channel answers directly. Work the ladder
below top-down; do not guess from source before consulting the live channel.

## 0. Reproduce with the dev server running

`pnpm dev`, open the page, reproduce. Dev builds expose `window.__MARKLESS_DEBUG__`.
If you have browser tooling (Chrome DevTools MCP, Playwright, a console), you can evaluate
the queries below directly in the page.

## 1. Dead click / interaction does nothing

```js
const el = document.querySelector('<selector>');
window.__MARKLESS_DEBUG__.explainInteraction(el, 'click')
```

The explanation names the actual cause. Common verdicts and their fixes:
- container disposed → the component unmounted; look for a lifecycle bug upstream.
- no event record for this element → the handler was never compiled onto this node; check
  the authored shape (handler on a keyed row? see §3).
- handler present but state never changed → the handler likely read `event.currentTarget`
  (always `null` — use `event.target`) or threw silently; check the browser console for a
  pageerror.

## 2. State changed but the DOM did not update

- DOM commits land on a later task than the event; wait/poll for the observable effect —
  `graph.flush()` is not a commit barrier.
- A computed that never re-derives usually means its dependency read is outside the
  supported shape (e.g. a string literal colliding with a state variable's name, or a
  read through an unsupported construct). Simplify the computed body to plain reads.

## 3. Keyed list renders empty cells / rows missing / list dead

Keyed `@for` rows may bind plain row fields only. These all fail SILENTLY:
- expressions in row text bindings (`{row.a + 1}`) → cells render empty;
- non-row state bound anywhere in a component that contains a keyed `@for` → the component
  export is dropped (bundler reports MISSING_EXPORT);
- per-row components, module-scope calls, template literals in row expressions.
Fix: precompute display values into row objects; keep row bindings as `{row.field}`.

## 4. Build errors

Markless build errors are fail-closed and name the offending construct (unsupported row
binding, duplicate element handle, unresolved symbol route). Change the authored shape —
never suppress or work around the gate. If the message names a file and construct, the fix
is local to that file.

## 5. Environment / loading / resume problems

- `pnpm doctor` — environment and build sanity with targeted guidance.
- `@markless/analyzer` (devDependency) verifies runtime invariants in tests: preload windows
  (an interaction-triggered code fetch is a preload failure), network policy, resume
  integrity. Its verdicts are machine-readable JSON.
- SSR/resume rule of thumb: everything needed by the first interaction must be preloaded;
  if the first click fetches code, that is the bug, not the network.

## 6. Verify like the framework does

When you fix something interactive, prove it with an observable-DOM wait (poll or
MutationObserver on the expected change), not a sleep and not `graph.flush()`.
