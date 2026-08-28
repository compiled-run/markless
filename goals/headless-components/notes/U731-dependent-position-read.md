# A place a second expression can spend, and otp stops being told its index

U726's wall was real and its diagnosis was one step short. The position was not
failing to re-derive — it was never deriving on the client at all after paint.
It painted at render, its graph cell stayed empty, and the first expression to
USE it read `undefined`. `otp.item` now derives both its place and the family's
length from the roster, and no `index` prop is left in the family.

`packages/vitest-browser/browser/item-collections/` is **58 green, 0
`test.fails`**, up from 48. `packages/headless/components/src/otp` is **47
passed, 1 skipped**, up from 43 passed / 5 skipped — four rows pinned on the
construct-arm gap are green and un-skipped, and the one that stays is the caret
row, on the framework's dispatch deferral.

## The witness, and what it isolated

`ic-widget.tsrx` gained the derivation every real family actually writes: beside
`ui-pos={pos}` the item now derives `char = computed(() => w.code.slice(pos, pos + 1))`
and writes it as `ui-mine`, and `IcRoot` gained a button that upper-cases
`w.code` so the dependent has to answer again after a write.

Red before the fix, exactly 4 of the 8 new rows:

```
CSR/SSR: a dependent derivation re-reads the position after a write   ['','',''] expected ['A','B','C']
CSR/SSR: a flat instance spends its own places and leaves its sibling alone
```

The other four were green **before** the fix, and that is the whole diagnosis:
the rows that mutate the collection (`add`, `drop first`) passed, because a
keyed repeat's write bumps the roster revision, which re-derives the position
through `refreshSyncComputed` and writes its cell — after which a dependent
reads a number. The rows that only change the family's own state failed, because
nothing had ever written that cell.

## The cause: a rendered position is painted, never banked

At render a position is emission order and the number goes straight into the
markup. Nothing puts it in the derivation's graph cell — a computed's value is
served in the payload only where a handler reads it, and no handler reads a
position. On the client the cell is therefore empty until something re-derives
it, and the only thing that ever did was a keyed repeat's write.

That is why U726 measured `at` as `undefined` while `plain = computed(() => otp.value.length)`
answered `6` in the same string: `plain` depends on `otp.value`, which the
keystroke wrote, so `plain` had re-derived and banked its own value; `at`
depends only on the roster's element-binding node, which on a page with no keyed
repeat is never written at all. `ui-pos` reading `0|1|2|3|4|5` after the paste
was the render's markup sitting untouched, not a re-derivation.

No id mismatch is involved. U719's host-space respelling resolves correctly; the
value simply was not there to read.

## The fix: resume is the roster's first revision

Two changes, both in `packages/web`:

- **`fns/roster-resume.ts`** — `wireRosterRevisions` bumps once at wire time,
  through the same closure the repeat subscription runs. The bump writes the
  element-binding node, the existing `sync-computed-demand:` subscription fires,
  `refreshSyncComputed` derives the position against the live roster and writes
  its cell, and the dependent re-derives off that write. Nothing new was added
  to the refresh path.
- **`resume-runtime-start.ts`** — the roster call is no longer gated on the page
  having a keyed repeat. A family whose parts are written flat (which is how a
  consumer writes `otp`, and `tour`) has a roster too, and it is resume itself
  that first makes that roster live. The gate is now the fact that actually
  decides it: a computed whose dependencies name an element binding. Pages with
  none never load the roster chunk, exactly as before.

Honest framing of the ordering: the derivation is banked at resume, not at
paint. The rendered markup is already correct, so nothing flashes; what changes
is that the number exists in the graph before the first dependent asks.

## otp: the index prop is gone

`otpState` drops the `length` cell and gains `itemEls`. `OtpField` derives
`boxes = computed(() => otp.itemEls.length)` for `maxlength` and passes it to
`commit(boxes)`, which coerces with `Number()` — a count rendered before its
boxes existed is patched into the payload as text, and a strict compare against
`code.length` would never fire `onComplete`. `OtpItem` binds
`el={[otp.itemEls, mine]}`, derives `at = otp.itemEls.indexOf(mine)` and slices
the character out of the code with it. `OtpItemProps` is now plain
`PropsOf<'div'>`.

Thirteen scenarios lost `index={n}`. **No row's assertion changed.** What
changed is which rows run: `CSR: a box written by a loop follows the code like
any other`, `CSR/SSR: boxes delivered by an @if arm make up the length of the
code` and `CSR: an arm-delivered box follows the code like any other` were
`test.skip` on the construct-arm registration gap — a box out of an arm could
not WRITE the family's shared length cell. There is no shared write any more, so
all four are green as written.

`packages/headless/components/SPEC.md` (Recursive composition) now states the
rule: an item's position is derived from render order and a family never takes
an index prop for it; the count follows from the same roster. `tour.item` is
named as the one part still taking `index`, migrating behind T042.

## Bytes

**The resume closure wall holds** — `packages/web/test/event-only-resume-closure.test.ts`
green in the node lane. `fns/roster-resume.ts` is reached only through
`__marklessRosterResume` and `resume-runtime-start.ts` by no governed closure,
so `resume.ts`'s ~39 bytes of headroom are untouched.

**`music-player-csr-budget` is red, and was red before this card.** Measured by
stashing the whole tree on this base:

```
pilot tip (6f0726a2), no changes   page-load download 137,558 gzip / 108 chunks
this card                          page-load download 137,599 gzip / 108 chunks
anchor 137,243 + 128 = 137,371
```

So the tip is over by 187 and this card adds 41, all of it the new gate in
`resume-runtime-start.ts`. No anchor was raised. `music-player-ssr-budget`,
including the `first-navigation marginal` stage U722 recorded as red, is green
on this tree.

## Open, and mechanical

`packages/headless/components/api/manifest.json` still lists `index` on
`otp.item` and is outside this card's file contract. `pnpm --dir
packages/headless/components api:check` is red until
`pnpm --dir packages/headless/components api:extract` regenerates it. That gate
is a standalone config, not one of the root vitest projects, so no lane in this
card's verification reaches it.

## Carried forward

`wireRosterRevisions` still subscribes keyed repeats and nothing else for
SUBSEQUENT revisions, so a flat page whose parts are gated by a flipping `@if`
arm would move without any repeat writing and nothing would tell the parts
behind the arm to count again. Resume now covers the first derivation, which is
what every flat family needed; an arm-application revision bump is still its own
card. otp cannot reach it — a flipping arm around `<otp.item>` is refused at
compile time (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`).
