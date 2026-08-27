# The IDREF-in-arm mechanism under the closure wall: paid, and measured

Status: **partial**. The closure debt is paid — every governed entry is at or
BELOW its clean-tip size, and `event-only-resume-closure` is 8/8. The three
`handle-in-arm` rows that are still red are red identically on the pure held
branch measured on this same tip, so the restructuring is behaviour-neutral. The
served-open cause is NOT the one the previous memo named; it is measured below.

## The budget, per governed entry

Measured on the clean pilot tip (`c4718711` + merge) with the same static-import
walk the test uses, then re-measured with this unit's tree. Wall: 20,983.

| governed entry | clean tip | now | delta |
| --- | --- | --- | --- |
| `event-only-resume.ts` | 2,961 | 2,961 | 0 |
| `payload.ts` | 18,071 | 18,071 | 0 |
| `resume.ts` | 19,277 | 19,277 | 0 |
| `resume-runtime.ts` | 20,970 | 20,970 | 0 |
| `resume-async-boundaries.ts` | 8,374 | 8,374 | 0 |
| `resume-behaviors.ts` | 11,494 | 11,494 | 0 |
| `resume-branches.ts` | 20,909 | **20,847** | **-62** |
| `resume-keyed-repeats.ts` | 20,960 | 20,960 | 0 |
| `fns/row-mint.ts` | 7,167 | 7,167 | 0 |
| `resume-sync-computed.ts` | 2,290 | 2,290 | 0 |

No entry grew. The one that moved shrank. No interim was taken and the wall was
not touched.

## What the held branch actually cost, and where

The held branch put `resume-branches.ts` at **49,589** against 20,983 — 2.36x.
One import edge did nearly all of it:

    import { PROTOCOL_ELEMENT_HANDLE_ID_READ_PREFIX } from '@markless/serializer/protocol';

`resume-branches.ts`'s clean-tip closure is two files (itself, 20,423, and
`resume-anchor-census.ts`, 486). That one line added `protocol.ts` (22,469),
`protocol-constants.ts` (3,288) and `async-boundary-arm.ts` (271) — 26,028 bytes
for one string constant, the same cost class the T075g interim recorded and U106
repaid. The remaining +1,830 was the mechanism's own source in the file, against
74 bytes of headroom.

## The three moves that paid it

1. **The record's key carries the namespace, so resume needs no constant.**
   `elementHandleIds` is now keyed by the WHOLE graph read id an arm symbol asks
   under, built by the new `protocolElementHandleReadId(handleGraphNodeId)` in
   the serializer's protocol (it replaces the bare prefix constant; the compiler's
   two producers and web's CSR twin all call it, so the id keeps one spelling).
   `ProtocolBranchIdrefSite.handleGraphNodeId` became `handleReadId`, the same key.
   Resume matches it as a SUFFIX — a composed symbol's reads arrive with the
   instance path prepended — which is exact because the key includes the
   `markless:element-handle-id|` namespace, so no shorter handle id can collide.
   No literal is restated: the resume side never spells the namespace at all.

2. **Both readers moved to `resume-arm-records.ts` behind a dynamic import.**
   `armElementHandleIdGraph` and `syncBranchIdrefSites` live there now, loaded
   pay-per-use from `resume-branches.ts` — the same `await import()` idiom the
   file already uses for `dom-journal.ts`. A page whose arms bind no such handle
   loads neither. `composedBranchGraph` is byte-identical to the clean tip again,
   so `composed-arm-projection.test.ts` still pins what it pinned.

3. **One paint step instead of three call sites.** `paintArm(arm)` sets the
   current arm and answers the IDREF in one place, used at wire time and after
   each flip. The branch's third call — re-asserting on range removal — is gone:
   the removal handler no longer clears anything, so re-asserting after it was
   redundant. All 8 rows behave identically with it removed.

The rest came from `resume-branches.ts`'s comment block, which carried 56 comment
lines against the repo's "a handful, not dozens" rule. Paragraphs were compacted
to their load-bearing constraint and two purely narrating lines were deleted.
Every architectural constraint in that file is still stated.

`ResumeDomElement` gained optional `setAttribute`/`removeAttribute`, which is
free for the closure (a type-only import) and removed the local narrowing type
the branch had declared.

## The served-open case: the previous memo's cause is wrong

The `fns/ssr.ts:1418` fix the previous memo asked for IS in (`namesIdrefs` keeps a
branch record that carries `idrefSites` even when a compiler-known constant
decided the arm, short-circuiting before `marklessSsrDecidedArmIsLive` can throw).
It does not turn the rows green, and the reason is measured, not guessed:

**The two SSR rows now fail during SERVER RENDER, before resume exists.** Both
throw `MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING` out of the compiled SSR
module's mint. `SSR resume served CLOSED` — which the previous memo recorded as
green end to end — throws it too.

**That is a tip regression, not this unit's doing.** Proof by measurement: the
held branch's own file versions were checked out over this tree
(`git checkout 19e1bb44 -- <the 8 files>`) and `handle-in-arm` run — the SAME 3
rows fail with the SAME two errors, 5 of 8 green. The pilot tip moved twice since
the branch was written (`6fc7852b` overlay dismissals, `c4718711` fileupload) and
one of those broke the childless-widget-root seed path the branch depended on.

The likely mechanism, stated as a hypothesis to be measured first and not acted
on here: `ssr-module.ts` gates the childless root's instance registration on
`mintsElementHandleId`, which scans **this module's own** chunks for an
`element-handle-id` residue. The page module composing `<Disclosure/>` has no such
slot of its own — the handles live in `Disclosure`'s module — so the gate is false
in the module that has to pass `sharedSeeds` down, and the child renders with no
instance token. Widening that gate at compile time would change emitted bytes for
every composing page, so `emit-byte-equality` has to be part of whatever fixes it.

`CSR served open` fails differently — `aria-controls` stays null with no throw.
Two candidates, neither confirmed: the branch record is still being dropped
somewhere after `fns/ssr.ts:1418`, or `idrefSites[].hostNodeId` is not carrying
the composing parent's host prefix the way `marklessSsrPrefixArmRecord` carries it
for arm records, so `elementsByHostId.get(...)` misses and the writer skips. The
first thing worth doing is printing the composed branch record for that page.

A hole was also closed on the way past: `compiler/test/handle-in-arm` asserted
`toContain(PROTOCOL_ELEMENT_HANDLE_ID_READ_PREFIX)` against a symbol that no
longer existed, so it was passing on `undefined`. It now asserts the real read id
for the witness's handle.

## Verification as it stands

- `pnpm typecheck` — green.
- `pnpm exec vp test packages/web/test packages/compiler/test packages/serializer/test`
  — 325 files, 2451 pass, 1 expected fail. Includes `event-only-resume-closure`
  8/8 and `emit-byte-equality`.
- `pnpm docs:errors:check` — 200 codes, in sync.
- ui menu/tour/popover/tabs/accordion — 254 pass, 2 expected fail.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- Browser: 65 of 68 rows green across the ten pinned lanes. `idref-per-instance`,
  `root-idref`, `live-region-branch`, `composed-arm-boundary`, `seeded-write`,
  `demand-load-replay`, `seed-module-const`, `progressive-counter` and
  `crazy-impl-b909-parity` all green. `handle-in-arm` is 5 of 8, the same 5 the
  pure held branch reaches on this tip.
