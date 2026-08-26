# A composed `@if` arm inside an async boundary follows the parent's write

U588 routed composed arm-branch records through `composedBranchGraph` for
branches that travel the page-branch road. It left the other road open: a
composed part mounted inside an `@await` boundary arm, whose branch registers as
one of `servedArmRecords[].branches`. This is that road.

## What the witness measured on the untouched tip

`packages/vitest-browser/browser/composed-arm-boundary/` — a `Caption` part that
renders `{children}` from inside an `@if` arm, plus a bare `Note` projection as
the in-boundary control. Two pages: `boundary-page.tsrx` puts both inside a
`@try` arm whose async computed resolves after 40 ms; `control-page.tsrx` is the
same shape with no boundary. Six rows, CSR and SSR, parent writes after
resolution.

Red on the tip, but **not** the staleness U588 predicted:

- **SSR rows were already green.** The server resolves the boundary and serves
  the `@try` arm, so the composed branch travels as a page branch and U588's
  route table already answers it. Both SSR boundary rows and the SSR control
  passed untouched.
- **CSR rows died loudly**, before any staleness could be observed:

  ```
  RuntimeResumeError: Arm-scoped branch c0:branch-site:0 expected an
  arm-branch comment anchor at arm-local index 0.
  ```

  Thrown from `materializeArmBranchRecords`, inside `registerArmRecordSet`,
  during `settleAsyncBoundaryRange`. Registration is all-or-nothing on purpose,
  so the throw took the whole settled arm's records down with it — which is why
  the bare `Note` projection went stale too. That row is the control, and it was
  red for a reason that had nothing to do with projections.

## The real defect: two anchor coordinate systems, one census

`materializeArmBranchRecords` resolved every arm-branch record's anchors by
index into the arm's own `markless:arm-branch:` census. That is correct for a
branch the boundary's own module compiled: `protocol-view.ts` mints it
`strategy: 'arm-branch-comment'` with `index: rank * 2`, and the renderer emits
`markless:arm-branch:` anchors for it.

A composed child's branch is a different animal. `Caption` has no boundary of
its own, so its module emits plain `markless:branch:c0:branch-site:0` anchors and
a record spelling `strategy: 'dom-order-comment'` with the index it counted in
**its own module's** census. Composition (`marklessSsrAppendChildView`) moves
that record into the boundary's arm records unchanged. The index then names
nothing in this arm — and the strategy tag saying so was being ignored.

Instrumenting the census made the failure mode plain. On a page with one
page-owned `@if` and two `<Caption>`s inside the same `@try` arm:

```
records: [ {id: "branch-site:0",    s: {strategy: "arm-branch-comment", index: 0}},
           {id: "c0:branch-site:0", s: {strategy: "dom-order-comment",  index: 0}},
           {id: "c1:branch-site:0", s: {strategy: "dom-order-comment",  index: 0}} ]
census:  ["markless:arm-branch:branch-site:0", "/markless:arm-branch:branch-site:0"]
```

Both composed children spell index 0/1, and so does the page-owned branch. With
no page-owned branch in the arm the census is empty and it throws; **with** one,
it does not throw at all — both composed children silently claim the page-owned
branch's anchor pair, and a flip on either would replace the wrong DOM range.
The loud throw was the lucky case.

## The fix

`packages/web/src/resume-arm-records.ts` — `materializeArmBranchRecords` now
splits on the strategy the record already carried. `arm-branch-comment` resolves
by index in the arm's arm-branch census, exactly as before. `dom-order-comment`
means a composed child's own branch, and its anchors carry its instance-prefixed
id (`markless:branch:c0:branch-site:0`), so the **anchor text is the address**.
Those ids are page-unique — two instances of one part are `c0:` and `c1:` — so
the lookup is exact, not positional.

`packages/web/src/resume-types.ts` and `packages/serializer/src/protocol.ts` —
the arm-branch record shape now admits the `dom-order-comment` anchor strategy
and the `composedInstancePath` / `composedGraphProps` pair it was already
carrying off-type. Types only; no serialized bytes move.

No change was needed in `resume-branches.ts` or `ssr.ts`. Composition was
already attaching U588's route table to these records, and `registerArmBranches`
already runs them through `wireBranchRecord`, which already wraps the graph in
`composedBranchGraph`. The anchor resolution was the entire gap.

## Both halves are load-bearing — measured, not assumed

Neutering `composedBranchGraph` (making its `routes` always `undefined`) with the
anchor fix in place turns **4 of 6** rows red — the two arm-projection rows in
both modes, plus both controls. So the boundary's arm records genuinely do
travel U588's route table; they simply never survived long enough to use it.

Restoring it: 6/6 green.

## The doctrine guard shaped the implementation

The first cut collected the arm range's comments into a text map in one walk,
which rewrote the line

```
if (within && node.nodeType === 8 && isArmBranchAnchorComment(node as ResumeDomComment)) {
```

`packages/web/test/doctrine-guard.test.ts` keys `RUNTIME_MOUNT_SCAN_ALLOWLIST` on
exact source text, so that read as one stale entry plus one unreviewed scan
site. Rather than add an allowlist entry (out of contract, and a new sanctioned
scan deserves its own review), the lookup reuses `pageCommentCensus` — an
existing, already-allowlisted census in the same file whose stated purpose is
mapping to compiler-emitted comment anchors — and filters it by anchor text. It
is page-wide rather than arm-scoped, which costs one walk per settle that
carries composed arm branches and is exact anyway, since the ids are page-unique.
`armBranchCommentCensus` is byte-identical to what it was.

## Receipts

- `pnpm typecheck` — clean.
- `pnpm exec vp test --project browser packages/vitest-browser/browser/composed-arm-boundary packages/vitest-browser/browser/seeded-write` — 14/14.
- `pnpm exec vp test packages/web/test packages/serializer/test packages/compiler/test/emit-byte-equality.test.ts` — 603/603, `emit-byte-equality` and the serializer suite included.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- Regression sweep, 35/35: `arm-branch-flip`, `arm-commit`, `arm-component-flip`,
  `branch-escalation`, `composed-boundary-csr`, `composed-boundary-ssr`,
  `composed-arm-graph-ids`, `component-row-branch-mint`.

## What this did not touch

- `composedBranchGraph` still routes reads only. A composed arm rebuilds from
  what it reads and writes nothing.
- The silent-misclaim case above (a page-owned arm branch beside composed ones)
  is fixed by the same split but has no witness row of its own; the probe that
  found it was temporary. Worth a pin if that shape ever ships.
- No compiler emission change. As with U588, the emitted symbol and anchors were
  correct; routing and anchor resolution were the whole defect.
