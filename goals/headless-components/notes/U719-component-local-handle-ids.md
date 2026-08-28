# A component-local handle now says which rendered component bound it

The carried-forward limit U694 recorded and U710 measured on `otp` is closed:
two parts of one family standing in the same row — or, as tour and otp are
written, in no row at all — no longer share one registry key. The witness that
reaches it is green in both regimes, and the resume closure wall holds.

`packages/vitest-browser/browser/item-collections/` is **28 green, 0
`test.fails`**, up from 20. `own-instance-handle`, `single-component-family` and
`keyed-bare-host-handle` are green alongside it: 4 files, 56 passed, 2 expected
fail, exit 0.

## The witness: flat siblings, which is how a consumer writes tour and otp

`ic-flat-page.tsrx` writes its items as plain siblings — no keyed repeat — in two
`IcRoot` instances. A repeat sits BETWEEN two of the first instance's flat items
purely to move the collection after resume, because a roster revision is bumped
by a keyed repeat's collection write and by nothing else (`wireRosterRevisions`);
without one, a flat page never re-derives and the bug is unreachable. So the page
holds `alpha` (flat), a one-row repeat, `omega` (flat), and a second instance of
two flat items.

Before the fix, on the tip, the eight new rows failed four:

```
CSR/SSR: a flat item behind an arrival   ['-1','1','2','-1']  expected ['0','1','2','3']
CSR/SSR: a flat item behind a removal    ['-1','-1']          expected ['0','1']
```

`bravo` at 1 is the row item: it stands in `r:bravo:` and U694's row key already
told it apart. `alpha` and `omega` are the flat pair, and both answered -1 — the
exact shape of the otp keystroke failure U710 measured.

## Measured, not assumed: the two id spaces and how they differ

Instrumenting the registration and the re-derive on this page printed:

| rendered part | host id (registration) | symbol id (re-derive) |
| --- | --- | --- |
| alpha | `c1:h1` | `c0:p1:computed:pos` |
| bravo (in row) | `r:bravo:c2:h1` | `r:bravo:c0:p2:computed:pos` |
| omega | `c3:h1` | `c0:p3:computed:pos` |
| charlie | `c5:h1` | `c4:p5:computed:pos` |
| delta | `c6:h1` | `c4:p6:computed:pos` |

Both spaces carry the component instance. They just spell it differently, and the
compiler says exactly how: `hostPrefix` is `c${index}:` for a component edge
(`passes/public-render/component-wiring.ts`, `ssr-module.ts`,
`passes/spread-forwarding.ts`), while `symbolPrefix` is
`componentEdgeInstanceSegment`, which is the same `c${index}:` for an ordinary
edge and `<projection parent's path>p${index}:` for a component PROJECTED into
another (`packages/compiler/src/component-edge-instance.ts`).

So the two spaces differ in exactly one way: symbol space additionally names the
edge a projected component was projected into. `c0:p1:` and host `c1:` are one
rendered component. That is the divergence U691 named and U694 routed around by
using row segments alone.

## The fix: one key, spelled in host space on both sides

**Registration** (`resume-locators.ts`) files the handle under the host's whole
scope rather than its rows only. One regex widened:

```js
const HOST_SCOPE = /r:[^:]*:|c\d+:/g;
…
const scope = hostNodeId.match(HOST_SCOPE)?.join('') ?? '';
const keys = [...new Set([handleId, bare, handle.name, scope + handleId])];
```

`r:bravo:c2:h1` files `r:bravo:c2:element:mine`; `c1:h1` files
`c1:element:mine`. The other three keys are untouched, so every existing read
resolves exactly as before — including the designed ambiguity refusal, which
still fires on the bare compiled id when two rendered widgets file it.

**The re-derive** (`fns/roster-resume.ts`) respells its own instance path into
host space before asking:

```js
function hostScopePath(instancePath) — drop a segment the NEXT segment projects
out of, respell a surviving `p<n>:` as `c<n>:`, leave `r:<key>:` alone.
```

`c0:p1:` → `c1:`. `r:bravo:c0:p2:` → `r:bravo:c2:`. `c4:p6:` → `c6:`. The reader
asks `scope + handleId` and falls back to the bare id, which is the same lookup
when the scope is empty.

Dropping "a segment whose successor is a `p`" is sound rather than a heuristic: a
module's contribution to an instance path always BEGINS with a `c` segment
(`componentEdgeInstanceSegment` returns either `c<idx>:` or `parentPath + p<idx>:`,
and `parentPath` is itself resolved the same way), so a `p` segment is always
immediately preceded by its own projection parent in the same module. Nothing can
sit between them.

The row key U694 minted is gone, not kept beside the new one, and its reader
moved with it. The key is a runtime string rather than an exported symbol, so
this is a text search and not a priced receipt: `grep` over `packages/web/src`
for `ROW_SEGMENT` and `rows +` finds the mint in `resume-locators.ts`, the read
in `roster-resume.ts`, and `fns/instance-scope.ts`, which owns a `ROW_SEGMENT` of
its own for stripping rows out of a path and never builds a handle key with it.

## Rows minted after resume line up too

The mutating page's client-minted row registers on `r:delta-3:c1:h1` and
re-derives from `r:delta-3:c0:p1:computed:pos` — measured on a deliberately-failed
scratch row so the browser console was captured. The composed page, whose items
reach their root through a consumer's own `Panel`, registers on `c1:h1`, `c2:h1`,
`c3:h1` against symbol paths `c0:p1:`, `c0:p2:`, `c0:p3:`. Both fold to the same
string.

## Bytes

**The `event-only-resume-closure.test.ts` wall holds, at 20,970.** The only
governed module that grew is `resume-locators.ts`, 10,200 → 10,206 (+6): the
regex gained five characters and one identifier gained one. `resume.ts`'s closure
measures **20,931**, so 39 bytes of headroom remain, down from 45.
`resume-runtime.ts` (20,970, on the wall) and `resume-keyed-repeats.ts` (20,960)
are byte-identical — neither reaches `resume-locators.ts`.

The whole fold lives in `fns/roster-resume.ts`, which grew ~700 bytes inside its
own headroom: it is demand-loaded through `__marklessRosterResume` and reached by
no governed closure.

## Carried forward

`wireRosterRevisions` still subscribes keyed repeats and nothing else, so a page
with NO repeat anywhere never re-derives a position after paint. That is why this
witness needs a repeat to move the collection at all. It is not a wrong answer —
a flat page whose parts never arrive or leave has nothing to renumber — but a
flat page whose parts are gated by an `@if` arm would move without any repeat
writing, and no channel tells the parts behind the arm to count again. Reaching
that needs an arm-application revision bump, which is its own card.

The bundler chunk anchors U694 left red are untouched here and stay U694's open
item: nothing in this card moves a module between chunks.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/web` — 94 files, 640 rows, exit
  0. The closure wall is inside that lane.
- `pnpm exec vitest run --project browser` over `item-collections`,
  `own-instance-handle`, `single-component-family`, `keyed-bare-host-handle` —
  4 files, 56 passed, 2 expected fail, exit 0.
- `pnpm exec vitest run --project browser` (whole lane, not asked for and run as
  a check that a registry key change reaches further than it looks) — 196 files,
  1,005 passed, 25 expected fail, 3 skipped, exit 0.
