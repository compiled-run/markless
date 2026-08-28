# U672 — the source-closure wall repaid, and the chunk cost that blocks it

## What was owed

U664 moved the element-handle qualifier slot (~330 chars: an install function, a
read function, and the module-level binding between them) out of
`resume-locators.ts` and into `resume-arm-records.ts`, because that 13,633-char
module was the only file in U664's contract that `fns/instance-scope.ts` already
imported. `resume.ts`'s static source closure gained the whole of arm-records for
a 330-char slot, and `event-only-resume-closure.test.ts`'s wall was raised
**20,983 → 33,510** to fit it. U664 named that as debt: the wall moved without
real code behind it.

## What was done

`packages/web/src/resume-handle-qualifier.ts` — a new module holding exactly the
slot, importing nothing. `resume-locators.ts` and `fns/instance-scope.ts` both
import it; `resume-arm-records.ts` no longer carries it and no longer appears in
`resume.ts`'s closure at all.

A test pins the arrangement so it cannot silently fold back: `the element-handle
qualifier slot stands in its own module` asserts the closure contains
`resume-handle-qualifier.ts`, does not contain `resume-arm-records.ts`, and that
the qualifier module has no runtime imports of its own.

### The wall, measured

Every entry the wall governs was re-measured with the test's own closure walk,
before and after, on one tree (the change stashed and restored):

| entry | before | after |
|---|---|---|
| `resume.ts` | **33,510** | **20,728** |
| `resume-runtime.ts` | 20,970 | 20,970 |
| `resume-keyed-repeats.ts` | 20,960 | 20,960 |
| `resume-branches.ts` | 20,935 | 20,935 |
| `payload.ts` | 18,071 | 18,071 |
| `resume-behaviors.ts` | 11,494 | 11,494 |
| `resume-async-boundaries.ts` | 8,374 | 8,374 |
| `fns/row-mint.ts` | 7,167 | 7,167 |
| `event-only-resume.ts` | 2,961 | 2,961 |
| `resume-sync-computed.ts` | 2,290 | 2,290 |

`resume.ts` drops 12,782 chars: arm-records leaves (13,645 chars as the file
stands, counted the way the test counts — string length, not bytes) and the
846-char qualifier module takes its place, plus 5 chars on the changed import
specifier. The governing entry is once more `resume-runtime.ts`, a single-file
closure this unit does not touch, so the wall is set to its measured value:

**33,510 → 20,970.** Not a round number and not an estimate.

## Why this is not `completed`: the always-loaded chunk grew

Rebuilding `@fixtures/vite-csr` on the same tree, with only the three web source
files stashed and restored, prices the change on the shipped side:

| | before | after | delta |
|---|---|---|---|
| largest runtime chunk, raw | 13,933 | 14,016 | +83 |
| largest runtime chunk, gzip | 5,149 | 5,178 | +29 |

The vite-plus fixture shares that chunk and reports the same 14,016 / 5,178
(U664 measured 5,147 there, so +31).

The cause is visible in the emitted chunk and it is not new code. The chunk
carries one more module wrapper than before — four before, five after — and the
added text is exactly the qualifier module and its wrapper:

```
function h(e,t,n){return t&&g?g(e,t,n):e}var g,_=e((()=>{}));
```

Its initializer body is empty. The slot's own statements were already in this
chunk when they lived inside arm-records; what is new is that they now stand as a
separate module, and a module costs a wrapper plus its export-map entries. Under
U664's arrangement the read half was tree-shaken out of this chunk entirely — the
string `return t&&` does not appear in the before chunk — because arm-records was
reduced to the install half here and the read half was resolved on the demand
side.

The standing anchors are `maxRuntimeChunkGzipBytes` 5,160 (vite-csr) and 5,159
(vite-plus). 5,178 exceeds both, so `packages/bundler/test/fixture-builds.test.ts`
is red. The packet forbids raising any budget and requires these anchors not to
grow, so the unit stops here rather than moving them.

Nothing else moved: `pnpm typecheck` is clean, all 93 files / 638 tests under
`packages/web/test` pass, and the music-player CSR and SSR budgets pass unchanged.

## The decision this needs

Two ways forward, and the measurement for each:

**Pay the 29/31 gzip.** Raise the two largest-runtime-chunk anchors to cover
5,178 and record the attribution as one module wrapper on the always-loaded
chunk, bought with 12,540 chars off the source-closure wall. The wrapper is
inherent to the slot standing alone; no arrangement of a dedicated module avoids
it.

**Host the slot in a module that is already on both sides.** A module already
inside the always-loaded chunk *and* already inside `resume.ts`'s closure costs
no new wrapper and roughly +330 on the wall. `resume.ts`'s closure after this
change is `resume.ts`, `resume-locators.ts`, `resume-census.ts`,
`resume-anchor-census.ts`, `inline/resume-errors.ts`, `resume-handle-qualifier.ts`
— of those, `inline/resume-errors.ts` is also reached from the eager side today.
None of them is in this unit's contract, and the zero-cost placement is exactly
the kind of file the blocked permission reserves for the cockpit, so it was not
attempted. Whether an errors module should host a qualifier slot is a naming call
this unit cannot make.

## Behaviour

Unchanged by construction — the slot's code is byte-for-byte what it was, only
its home moved, and proven: `handle-in-arm` (including `two-widgets`),
`enclosing-family-read`, `own-instance-handle`, `idref-per-instance` and the four
progressive-execution gates are green, 12 files and 56 tests.
`packages/web/test/arm-registration-qualified` passes untouched, as does the rest
of the web suite.
