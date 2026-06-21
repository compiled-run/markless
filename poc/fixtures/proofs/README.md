# Proof Fixtures

These fixtures are executable specs for the first `@arcade/core`
implementation. They are not a throwaway POC implementation.

Each proof directory should contain authored `.tsrx` source and a README that
states which pass-boundary tests consume it. Do not hand-write large final
artifact JSON before the relevant pass exists. Add expected artifacts one pass at
a time through failing tests.

## Initial Proof Set

- `resume-basic`: canonical vertical slice covering scalar `state()` counter,
  object path write, lazy event symbol, sync `preventDefault()` policy, async
  `computed()` with `@try`/`@pending`/`@catch`, one `attach={...}` behavior, and
  one `element()` / `el={...}` locator.
- [`state-lvalues`](./state-lvalues/): plain JavaScript mutation lowering,
  including `count++`, assignment, object paths, nested paths, array mutation
  expectations, aliases, and invalid writes. Source fixture added; expected
  artifacts should be introduced by future pass-boundary tests.
- [`sync-event-policy`](./sync-event-policy/): isolated extraction of synchronous
  `preventDefault()` / `stopPropagation()` policy from graph state and event
  fields, leaving writes in lazy symbols. Source fixture added; expected
  artifacts should be introduced by future pass-boundary tests.
- [`payload-locators`](./payload-locators/): DOM-order locators, branch
  anchors, keyed list item locators, text binding locators, behavior host
  locators, and element handle locators without per-node attributes or VDOM
  semantics. Source fixture added; expected artifacts should be introduced by
  future pass-boundary tests.
- [`symbol-resolver`](./symbol-resolver/): handler, binding, behavior, and async
  runner symbols whose dynamic imports are owned by the generated resolver, plus
  unknown-symbol fail-closed behavior and inline sync policy separation. Source
  fixture added; expected artifacts should be introduced by future
  pass-boundary tests.
- [`serializer-values`](./serializer-values/): serialization tiers, object
  identity/cycles, built-ins, app value class restore, unsupported DOM/runtime
  diagnostics, and secret-leak warning shape when applicable. Source fixture
  added; expected artifacts should be introduced by future pass-boundary tests.
- [`scheduler-journal`](./scheduler-journal/): batched writes, microtask flush,
  computed invalidation, async completion versioning, stale async completion
  handling, concrete DOM mutation journal entries, no VDOM semantics, handler
  ordering, behavior cleanup ordering, and no rollback after committed writes.
  Source fixture added; expected artifacts should be introduced by future
  pass-boundary tests.
- [`bundler-pipeline`](./bundler-pipeline/): Vite/Rolldown/Witness proof for
  TSRX transforms, virtual modules, emitted chunks, manifest output, HMR
  artifact updates, and no Node-only assumptions in shared packages. Source
  fixture added; focused POC tests prove the minimal compiler/plugin pipeline
  behavior.
- [`resumer-script`](./resumer-script/): isolated event-only SSR inline resumer
  proof. It checks that static SSR emits no resumer, event metadata lives in
  `arcade/view`, startup imports no app or symbol code, the first click imports
  the matching symbol, and the inline bootstrap reports a reproducible
  minified+gzip size against the 700 B target.
- [`symbol-stress-runtime`](./symbol-stress-runtime/): POC runtime stress proof
  for many distinct symbols on one page. It measures compact resolver-table
  loading and event-only resumer dispatch for multiple symbol-count
  cardinalities without relying on the current POC TSRX dependency path.

## Pass-Boundary Order

1. TSRX semantic graph
2. State lowering
3. Payload arena planning
4. Symbol resolver planning
5. Runtime graph
6. Browser resume

## Running Proof Goals

Start each proof through GoalBuddy prompt/prep first, then run the generated
`/goal` command. Do not write raw `/goal` prompts from memory.

Each proof goal owns exactly one `poc/fixtures/proofs/<name>/` directory. It may
update this shared index only when adding a link, status line, or clarified
instruction. It must not edit framework internals unless the generated goal
explicitly changes from fixture design to implementation work.

Single-threaded recommended order:

1. `resume-basic`
2. `state-lvalues`
3. `sync-event-policy`
4. `payload-locators`
5. `symbol-resolver`
6. `serializer-values`
7. `scheduler-journal`
8. `bundler-pipeline`

Parallel-safe starting set:

- `state-lvalues`
- `sync-event-policy`
- `serializer-values`
- `bundler-pipeline`
