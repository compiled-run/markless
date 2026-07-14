# Working on this markless app

This project uses [markless](https://markless.dev). Markless looks like JSX but is **not
React**: `.tsrx` files are compiled, there is no virtual DOM, no hooks, and no effects
system. Getting these rules wrong fails silently more often than loudly — read this before
proposing changes.

## The model (what to write)

- Reactive state is `let x = state(initial)` with a **literal** initializer; derived values
  are `const y = computed(() => …)`. Reads are plain (`{x}`, `x + 1` in handlers); writes are
  plain assignments (`x = 5`, `x++`). There are no `$`-sigils, no hooks, no signals API.
- There are **no effects**. Element lifecycle uses `element()` handles and `attach={(host) =>
  { …; return cleanup }}` behaviors.
- Event handlers receive the native event **after** propagation: use `event.target`, never
  `event.currentTarget` (it is `null` and your handler dies silently).
- Keyed lists (`@for (item of items; key item.id)`) may bind **plain row fields only**
  (`{item.label}`). Expressions in row bindings (`{item.a + 1}`), references to non-row
  state, template literals, or per-row components silently render empty or drop the
  component export. Precompute derived display values into the row objects instead.
- A component containing a keyed `@for` must not bind non-row state outside the loop either
  (text or attribute) — it silently drops the component export. Use uncontrolled inputs read
  by handlers, or handler-written `dataset` attributes.
- DOM updates commit on a later task than the dispatching event; `graph.flush()` is not a
  commit barrier. In tests, wait for the observable DOM effect (poll or MutationObserver),
  never a fixed flush.

## Debugging playbook (use this before guessing)

**Dev builds expose `window.__MARKLESS_DEBUG__`** — a live diagnostic channel that records
component containers, lifecycles, and event routing. If you can evaluate JavaScript in the
running page (browser console, Chrome DevTools MCP, Playwright, or any browser tool), query
it first:

```js
// Why did clicking this element do nothing? Returns a structured explanation
// (disposed container, no event record, wrong element, pruned subtree…).
window.__MARKLESS_DEBUG__.explainInteraction(document.querySelector('#my-button'), 'click')

// Every live/disposed container with lifecycle state:
window.__MARKLESS_DEBUG__.containers
```

`explainInteraction` answers the single most common bug ("my click does nothing") with the
actual reason. Trust its output over inference from source.

**`pnpm doctor`** runs environment and build sanity checks for this app and prints targeted
guidance — run it when the dev server or build misbehaves.

**Build errors are fail-closed and truthful.** Markless prefers refusing to build over
emitting silently-broken output. When a build error names a construct (unsupported row
binding, unresolved symbol route, duplicate element handle), the fix is to change the
authored shape per the rules above — not to suppress the error.

**@markless/analyzer** (dev dependency) can verify runtime invariants — preload windows,
network policy, resume integrity — producing machine-readable verdicts; use it when
diagnosing loading/resume behavior in tests.

For deeper step-by-step procedures, see `.claude/skills/markless-debugging/SKILL.md`
(loaded automatically by Claude Code; readable by any agent).
