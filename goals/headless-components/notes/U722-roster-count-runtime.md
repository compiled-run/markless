# A count is asked before there is anything to count, so the page answers it

U720 gave the count an expression: `computed(() => roster.length)` lowers to
`context.rosterCount(rosterId)` on the client and
`marklessSsrRenderContext.rosterCount(rosterId)` on the server. This card answers
both, closes the shared-seed hole U710 measured, and recounts after resume.
`packages/vitest-browser/browser/item-collections/` is **48 green, 0
`test.fails`**, up from 28, CSR and SSR.

## The decision the card had to make first

U720 left two options for the server: a pre-pass over the instance's children, or
resolve after composition and patch. **Patch after composition**, for two
measured reasons.

A pre-pass is out of reach from this card's files. The only walk that runs before
a widget's parts render is the seed phase, and its two halves are
`fns/element-handle-roster.ts` (CSR) and the compiler's seed pass (server) —
neither in scope, and neither knows a repeat's row count. It is also not
sufficient: a member count is the number of parts that END UP in the roster, and
a `@for` decides that from live state.

And the ask is genuinely early. `renderSsrData` renders a widget root's
projection BEFORE the root, so a root whose items are projected children could be
answered in order — but a PART asking the count (tour's "2 of 5") renders in the
middle of the members it is counting, and no forward pass can answer it. One
mechanism has to serve both.

## How it works

`rosterCount` does not answer. It writes a placeholder — two private-use code
points around the roster's own registration key — and flips `counted` on the
render's roster counter:

```
<widget instance path><module-level handle id>
```

That is exactly the key composition files the roster's element handles under
(`marklessWidgetHandleId`), so after composition the answer is a tally over the
served view: **the roster's members are its element-handle registrations**, one
per part that ended up in it. Both regimes end with an HTML string plus a state
and view payload, so one resolver serves both:

- **Server** — `renderSsrOutput` (`render-to-string.ts`) awaits the render and
  hands the output to `marklessSsrRosterCounted`. That covers `renderToString`
  and `renderToStream`, which both come through here.
- **Client** — `evaluatePrerenderDataSurface` (`prerender/evaluator.ts`) does the
  same to the surface it just built, before `render-canonical.ts` parses the
  html into DOM. So CSR first paint carries the number, not a placeholder.

The **state payload is resolved alongside the html**, and this is not optional:
`ProtocolStatePayload.computed[].value` is served for a computed a handler reads,
so a family whose handler reads its count would ship a placeholder that outlives
paint. The walk rebuilds only where a placeholder was found, so a payload holding
none is the object it arrived as. A permanent row pins the whole channel — no
placeholder code point anywhere in the served page, markup or payload script.

Placeholder-as-value has one honest limit: a count used as a STRING at render
(`{total}`, `ui-max={total}`, `` `${pos + 1} of ${total}` ``) is exact, and a
count used in ARITHMETIC or a comparison at render
(`disabled={step >= count - 1}`) would see a string. tour's forward-trigger gate
is that shape. Nothing refuses it today; a card that needs it has to make the
count knowable earlier, not patch harder.

## Resume, and the shared-seed hole

`createRosterCountReader` (`fns/roster-resume.ts`) is the position reader without
the member half: the roster is read through `marklessInstanceScopedElementHandle`
with the instance path off the computed's own graph node id, and the answer is
`roster.length`. A count does not depend on the asker being in the roster, so no
host proof and no member key. `wireRosterRevisions` already bumps the roster node
on a keyed-repeat write, and the count's dependency IS that node, so the existing
`sync-computed-demand:` subscription re-derives it.

`fns/shared-seed.ts`'s `composedScopeRead` was the fourth derive-symbol
evaluation site, and U710 measured what it cost: `TypeError:
context.rosterPosition is not a function` killed 32 of tour's 38 rows. It now
gets the same context object every other site gets. The three render-side sites
build it through one factory, `marklessRosterRenderContext`, so a compiled call
cannot reach a regime that answers only one of the two questions.

## Bytes

**The resume closure wall holds at 20,970** —
`packages/web/test/event-only-resume-closure.test.ts` green. Nothing this card
touched is in `resume.ts`'s static closure: `resume-sync-computed.ts` is reached
only through `await import()` (from `resume-keyed-repeats.ts` and
`resume-sync-demand.ts`), `fns/roster-resume.ts` only through
`__marklessRosterResume`, and the render-side modules not at all.

**The CSR bundler anchor is the one that had to be earned, and the first shape
did not earn it.** Measured on this tree, `music-player` CSR `page-load download`:

```
pilot tip                                    137,080 gzip / 108 chunks
count resolver in shared-seed-slot.ts        137,371            108      (ceiling 137,256)
resolver moved into fns/roster-resume.ts     137,240            108      green, 16 B spare
```

`prerender/shared-seed-slot.ts` is eagerly loaded and this demo has
`computed: []`, so a resolver living there is pure dead weight for it — the
resolve plus the payload walk priced 131 gzip on a lane that modulepreloads
nearly every chunk it emits. Moving them into `fns/roster-resume.ts` costs this
demo nothing: that module's specifier is written only by the bundler's
`payloadHasComputed` gate, and a payload with no computed node can hold no count.
Both call sites read the loader off `__marklessRosterResume` rather than naming
the module, which is U704's rule and the reason no chunk or facade appeared (108
chunks throughout). Only the placeholder mint and the two delimiters stay eager,
and an unresolvable count throws `MARKLESS_ROSTER_COUNT_UNRESOLVED` rather than
shipping a placeholder.

The server has no emitted source module to install that loader, and
`derivePrerenderResumeRecords` runs the same evaluator in node during
`assembleSsrContainer` — an unresolved count there would be a resume-record
parity mismatch — so `renderSsrOutput` installs it on `globalThis` itself. That
line is server-only and adds nothing to any client chunk.

`music-player-ssr` is unmoved: `page-load download` 69,304 against anchor 69,722,
`page-load execute` 4,232 against 4,214 + 32.

**`first-navigation marginal` is red and was red before this card.** On the
untouched pilot tip it measures 23,465 against 23,333 + 128 = 23,461; on this
tree 23,462, three bytes better. Both fail. It is not this card's overrun and no
anchor was restated.

## One pre-existing row had to stop racing

`SSR: an item added after resume takes the next position by itself` polled the
row COUNT and then read `ui-pos` immediately. A row minted after resume derives
its place twice — once with no page seeds, which answers 0, then again when the
roster's revision renumbers it — so the row was reading a transient and passing
on luck. Adding a second derivation per bump (the root's count) was enough to
lose that luck deterministically: 3/3 green at 28 rows, 0/3 at 46, and a probe
showed the DOM settling to `0,1,2,3` a beat after the assertion read `0,1,2,0`.
The row now polls the derivation instead of the element; every count row that
asserts after a mutation does the same.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/web packages/bundler` — 161
  files, 1,145 passed, 2 failed, both `music-player-ssr-budget.test.ts` on the
  pre-existing `first-navigation marginal` overrun above.
- `pnpm exec vitest run --project browser` over `item-collections`,
  `single-component-family`, `own-instance-handle` — 3 files, 72 passed, exit 0.
