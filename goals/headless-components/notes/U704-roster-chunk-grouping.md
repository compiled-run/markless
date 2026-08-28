# The demand-load seam that cost 1.4 kB to save nothing

U694 landed render-order ordinals and left both bundler anchors red on
`music-player-ssr`: `page-load download` over by 1,423 and `first-navigation`
over by 301, for a source delta of +197 raw bytes plus one demand-loaded module.
U694 called it "a chunk-GROUPING move, not code volume" and asked for the
chunk-by-chunk diff. That reading was right, and this is the diff.

Both anchors are green again. The whole feature now costs **+134 gzip** on the
served page's fetch set, revert-measured, with the chunk count unmoved.

## What the diff showed

Chunk file names are content hashes, so the two builds cannot be matched by
name. `packages/bundler/test/helpers/chunk-diff.mjs` matches them by NORMALIZED
content instead (every `chunk-<hash>.js` reference rewritten to a placeholder,
then hashed) and reports which chunks are new, which are gone, and which are in
the served page's eager fetch set:

```
node packages/bundler/test/helpers/chunk-diff.mjs snapshot demos/music-player-ssr /tmp/before
node packages/bundler/test/helpers/chunk-diff.mjs diff /tmp/before /tmp/after
```

Baseline is the pilot tip (`e2d71fe5`) on this worktree; U694 touched only
`packages/web`, so reverting that one directory is a true revert-measurement.

```
before (pilot tip):  110 chunks / 97 eager  / 69,632 eager gzip
after  (U694):       114 chunks / 100 eager / 71,112 eager gzip
```

Four chunks appeared. Two of them are the answer:

```
EAGER  370 gzip  exports[... marklessInstancePath marklessInstanceScopedElementHandle ... x21]
EAGER   94 gzip  exports[wireRosterRevisions]
EAGER  355 gzip  the wireRosterRevisions body, split into a chunk of its own
       355 gzip  the roster-position seed counter, split out of shared-seed-slot
```

The 370-byte one is not code. It is this, in full:

```js
import{C as e,D as t,/* ...21 bindings... */}from"./CHUNK";m();export{g as installMarklessComposedArmRecords,/* ...21 names... */};
```

A pure re-export shim for `fns/instance-scope.ts`, whose implementation stayed
where it already was — inside the eagerly loaded dispatch-core chunk. The
served page downloaded 370 gzip bytes to re-export a module it already had.

## Why

`fns/instance-scope.ts` was reachable only STATICALLY, from the dispatch core.
U694's `resume-sync-computed.ts` added `await import('./fns/instance-scope.ts')`,
which makes it a dynamic ENTRY as well. Rolldown answers that correctly and
cheaply in the abstract — it does not duplicate the implementation — but it has
to materialise a chunk for the entry, and that chunk is a facade. The facade
also forces 8 bindings that were private to the dispatch-core chunk to become
exports, which cost another 293 gzip there.

The same shape a second time for `resume-runtime-start.ts`'s
`await import('./fns/roster-position.ts')`: a 94-byte facade, plus the body
split into its own 355-byte chunk, plus the seed counter split out of
`prerender/shared-seed-slot.ts` into another 355. Small chunks gzip badly —
each one is its own stream with no shared dictionary — so splitting ~500 raw
characters off into a chunk of its own costs several hundred gzip bytes rather
than saving them.

**And the demand-load seam bought nothing here.** `page-load download` is the
served page's `modulepreload` set, and the preload planner is exhaustive over
dynamic edges by design (`packages/bundler/src/build/preload-plan.ts`:
"every chunk reachable from an interaction's symbol roots can execute
post-click, so it preloads by default"). A runtime gate does not remove a
preload. Only build-time ABSENCE of the `import()` specifier does. Writing
`await import()` inside a module every resumed page runs is therefore the
opposite of pay-per-use: it adds a chunk, adds a facade, and preloads both.

## The fix

The row-mint precedent, applied to the roster: the app's own emitted module
writes the specifier, and only when the app can need it.

- `packages/web/src/fns/roster-resume.ts` (new) holds the whole resume-side
  roster half — `wireRosterRevisions`, moved out of `fns/roster-position.ts`,
  and `createRosterPositionReader`, moved out of `resume-sync-computed.ts`. It
  imports `fns/instance-scope.ts` **statically**, so it links the chunk the
  dispatch core already carries instead of turning it into a dynamic entry.
- `fns/roster-position.ts` keeps only the render half, so the server render
  path is unchanged and the seed counter stays where it was.
- `resume-runtime-start.ts` and `resume-sync-computed.ts` read
  `globalThis.__marklessRosterResume` instead of naming a specifier.
- `packages/bundler/src/source-module.ts` writes that loader, gated on
  `payloadHasComputed(payloadState)` — the predicate the reconcile plane
  already uses. A payload with no computed nodes can hold no roster
  derivation, so the implication is sound and no new protocol literal enters
  the bundler. The CSR mount gets the same line on the client source module,
  because it reaches the runtime start without ever evaluating a resume module.

`music-player-ssr` has `computed: []`, so it now emits none of the roster
chunks at all.

## What it costs now

```
                     pilot tip   U694      U694 + this
page-load download   69,632      71,112    69,766   (97 / 100 / 97 chunks)
```

+134 gzip, in three chunks, nothing regrouped:

- **+35** `resume-locators.ts` — the extra element-handle key per registration
  (the row segments of the host), which is what lets a component-local handle
  name one rendered part. This is U694's capability.
- **+43** `resume-runtime-start.ts` — reading the loader off the global and
  calling it.
- **+54** `resume-sync-computed.ts` — the same read for the position reader.
  78 raw characters; it prices high because that chunk is only ~700 bytes and
  gzip has little to work with.

`first-navigation marginal` is green with no anchor move at all: 23,443 against
23,333 + 128. `page-load execute` 4,232 against 4,214 + 32, also green.

The CSR lane (`music-player`) was red too, which U694 had not measured:
138,289 / 110 chunks before, **137,053 / 108 chunks** after — 1,236 recovered
and both extra chunks gone, and its `page-load execute` stage back inside its
anchor. Its baseline is 136,700 / 108 chunks, so the residue there is +353 with
the chunk graph unchanged. Same three sites; this lane prices them higher
because it modulepreloads nearly every chunk it emits.

Anchors moved by exactly those revert-measured deltas, each with its
attribution line at the anchor: `page-load download` 69,588 -> 69,722 (SSR) and
136,775 -> 137,128 (CSR). Nothing else moved.

`packages/vitest-browser/browser/item-collections` is 20 green, both regimes —
the capability crosses the loader seam unchanged.

## One thing found on the way

`build-determinism.test.ts` and `music-player-csr-budget.test.ts` both build
`demos/music-player` into the same `dist/`, and vitest runs files in parallel
workers. Whichever clears `dist/` second deletes the other's `index.html`
mid-build, which surfaces as `MARKLESS_PRERENDER_CONTAINER_MISSING`. It is
pre-existing — reproduced on the untouched tree by running those two files
together — and it made the node lane red at random. Both now take a lock
(`packages/bundler/test/helpers/demo-build-lock.ts`, an atomic `mkdir` in the
OS temp dir).

## Left for later

The gate is `payloadHasComputed`, which is coarser than the runtime predicate
(`a computed whose dependencies name /element:`). An app that has computeds but
no roster derivation still emits the roster chunk and preloads it. Making the
gate exact needs the element-binding segment as a fact the bundler can import
rather than restate — it is currently a private array member in the
serializer's `protocol-constants.ts` (`PROTOCOL_INSTANCE_QUALIFIABLE`) and
`packages/web` restates it locally in two places. Exporting it is a
serializer-side change, so it did not happen here.
