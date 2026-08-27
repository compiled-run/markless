# Same-module identity: the test's literal was stale, the served payload was not

Status: **completed**. The regression was case (a) — a stale literal in the
browser test. No mechanism was touched. `packages/compiler` is unmodified; the
whole change is one test file.

## The measurement

Dumping the served `script[type="markless/state"]` for
`browser/fixtures/same-module-same-name-page.tsrx` (two components in one module,
each declaring `let report = state(...)`, seeded 0 and 10):

```json
{"version":1,"cells":[
  {"graphNodeId":"c0:state:SameNameLeft.report","name":"report","valueKind":"scalar",
   "value":{"version":1,"root":0,"records":[]}},
  {"graphNodeId":"c1:state:SameNameRight.report","name":"report","valueKind":"scalar",
   "value":{"version":1,"root":10,"records":[]}}],
 "computed":[],"sharedDefinitions":[]}
```

Two cells, two distinct ids, the two distinct seeds. Nothing collapsed. The
assertion read `id.endsWith('state:report')`, and since U597/U601/U602 a
component-local name a sibling also declares is minted `state:Component.name`
(`collect-state.ts:796-798`), so the filter matched nothing and the set counted 0.

## What a served id actually is

`c0:state:SameNameLeft.report` is a per-instance prefix (`c0:`) over a wire key
(`state:SameNameLeft.report`). The two halves fail independently, and the old
assertion conflated them:

- The **instance prefix** is what makes two renders of one component distinct.
  It is already distinct with no qualification at all.
- The **wire key** is what makes two *different* components' same-named cells
  distinct. Only this half is what U597/U601/U602 changed.

That distinction is why the sibling (`state:steps`, two instances of one
component) and collision-page (`state:count`, four instances) rows kept passing
on the tip: neither name collides with a sibling declarer, so both keep the bare
key and `endsWith` still matched. Only the same-name page qualifies.

## The restatement

`packages/vitest-browser/browser/same-module-instance-identity.test.ts`, one new
matcher and one new key-stripper, used by the three payload rows.

`servedStateIds(container, name)` matches `state:name` or `state:Component.name`
under any instance prefix, so a served id is never again silently filtered down
to none — and every row now asserts `toHaveLength(n)` before the set count, so a
filter that matches nothing reads as "found 0, expected 2" rather than as a
collapse.

The same-name SSR row then pins both halves explicitly:

- two ids, distinct (the instance half),
- their wire keys are exactly `state:SameNameLeft.report` and
  `state:SameNameRight.report` (the qualification half),
- the served markup carries `0` and `10` before any click (the two ids really do
  carry distinct values, read out of the DOM rather than out of serializer
  internals).

## Checked against the defect

Reverting the qualification in `collect-state.ts` to the bare `${kind}:${name}`
and re-running the browser row:

| assertion | on the revert |
| --- | --- |
| `reportIds` has length 2 | passes — served ids are `c0:state:report`, `c1:state:report` |
| the 2 ids are distinct | passes — the instance prefix already separates them |
| wire keys are the two qualified keys | **fails**: `[ 'state:report', 'state:report' ]` |
| served text is `0` / `10` | passes |

So the old assertion was never the pin it looked like: counting distinct served
ids cannot catch a lost qualification, because the instance prefix disambiguates
them either way. The new wire-key row is the pin, and it is the one that goes
red. The revert was undone; `collect-state.ts` is byte-identical to the tip.

## Where each half is pinned

The mint itself was already covered — `packages/compiler/test/sibling-computed-cells/`
goes red on the same revert with 10 failures, including a row that already spells
`state:SameNameLeft.report` from `binding.id`. What that suite cannot see is
whether the qualified key survives into the *served* payload script; that is what
the browser row now adds. No compiler test was added or changed.

## CSR

There are no CSR served ids to assert. Measured: `render(SameNamePage)` emits no
`script[type="markless/state"]` at all — the container is exactly

```html
<section data-same-module-same-name=""><button type="button" data-left="">0</button><button type="button" data-right="">10</button></section>
```

CSR mints into the runtime graph and serves no payload, so the CSR half stays
proved the way it already was: `same-module components with one state name keep
separate CSR state` clicks each button and watches the other hold still.

## Landmine for whoever is next here

The browser lane compiles fixtures through the workspace-linked compiler source,
but a run does **not** pick up an in-flight edit to `packages/compiler/src` from
its own transform cache. Clearing `node_modules/.vite` and
`packages/vitest-browser/node_modules/.vite` was not enough either — the first
two counter-check runs came back green on a compiler that was demonstrably
reverted, and only the third, after a full re-run, showed
`["c0:state:report","c1:state:report"]`. Do not read one green browser run as
evidence that a compiler change had no effect; dump the payload.

## Lanes

- `pnpm typecheck` — clean.
- `pnpm exec vp test --project browser same-module-instance-identity.test.ts sibling-computed-cells` — 2 files, 10 tests, green.
- `pnpm exec vp test packages/compiler/test` — 224 files, 1749 passed, 1 expected fail, green.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.

`git status` shows one modified file plus this memo.
