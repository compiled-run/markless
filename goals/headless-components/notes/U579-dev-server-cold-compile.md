# U579 — the dev server's dropped socket, and the duplicate per-module compile

Tip: `e39cf086`. Host: darwin 25.5.0, node v24.15.0, vite 8.0.16 via vite-plus 0.1.20.
Gallery on this tip: 30 families in the `@markless/ui` barrel, 20 named by `Gallery.tsrx`.

## Headline

Both facts in the packet had the same cause, and it was neither a Vite timeout nor a
proxy. A cold entry-graph compile ran to completion on **microtasks alone**, so the dev
server's single thread never reached its poll phase for **178.7 seconds**. Two things
followed from that one block:

1. Node never read the request already queued on a keep-alive socket. When the loop
   finally turned, that socket's **5 s** keep-alive timer was 173 s overdue, fired
   immediately, found no request in flight, and destroyed the connection. That is the
   `ECONNRESET` the boot check retries around.
2. Nothing was memoized across the duplicate compiles the graph asks for, so the same
   modules were compiled again and again inside that window.

Fixing (2) and making the per-module compile cooperative fixed (1) as a consequence:
**the cold pre-warm went from 184.5 s to 4.8 s, and the socket no longer drops.**

## Measured, before and after

One cold `vp dev` per row on a private port, driven by the real
`apps/sr-gallery/scripts/boot-check.ts`, with the server process instrumented for
event-loop lag and socket lifecycle.

| | before | after |
| --- | --- | --- |
| `/@vite/client` | 301 ms | 1,859 ms |
| `/src/main.ts` | **connection lost after 178,807 ms**, retried, answered in 179,303 ms | **47 ms** |
| `/src/Gallery.tsrx?import` | 4,810 ms (server-side, after the warm-up compile had already landed) | 2,670 ms |
| Pre-warm total, 33 requests | **184.5 s** | **4.8 s** |
| Longest single event-loop block | **178,747 ms** | **1,534 ms** |
| Dropped connections during pre-warm | 1 | 0 |

`/@vite/client` is Vite's own client bundle and has nothing to do with this change; it
is slower in the second row only because it is now the first request that pays for
Vite's own module loading instead of being served behind our block.

## Part (a) — why the socket dropped

The instrumented run pins it exactly. Server-side, in order:

```
0.810s req finish /@vite/client 200 in 299 ms      <- response done; node arms keepAliveTimeout
        (GET /src/main.ts arrives ~10 ms later and is never read)
179.610s loop-lag 178747 ms blocked                <- the loop turns for the first time
179.612s conn timeout 127.0.0.1:51588              <- the 5 s keep-alive timer, 173 s overdue
179.634s conn close 127.0.0.1:51588 hadError=false <- node destroyed the socket
179.6xx req finish /src/main.ts 200 in 2 ms        <- the retry, off the landed compile
```

Client-side, the same moment: `Pre-warm: /src/main.ts lost its connection after 178807 ms`.

The server's own settings, read off the live `http.Server`, were node's defaults and
Vite changes none of them: `requestTimeout=300000 headersTimeout=60000
keepAliveTimeout=5000 timeout=0`. So:

- **Not a Vite request timeout.** Vite has none, and 300 s was never reached.
- **Not `headersTimeout`.** The request headers were complete before the block began.
- **It is `keepAliveTimeout`, misfiring.** Node arms a 5 s idle timer when a response
  finishes. The next request on that pooled connection cancels it — but only if node
  gets to *read* it. A blocked loop means the bytes sit in the kernel buffer, the timer
  stays armed, and on the first turn of the loop `socketOnTimeout` sees no request and
  no response in flight and calls `socket.destroy()`.

That makes the cause ours, not Vite's: node's idle reaper cannot tell "idle for 5 s"
from "we blocked the thread for 178 s". Configuration would only paper over it.

### The fix at the mechanism

A whole-module compile awaits only promises that are already settled, so a graph of
compiles is one unbroken run of microtasks — `await` never reaches the poll phase and
no socket is ever read. The fix is to spend one macrotask at each per-module compile
boundary:

- `packages/bundler/src/event-loop.ts` — `yieldToEventLoop()`, a `setImmediate`. The
  next check phase comes after the poll phase, so a queued request is read there.
- `packages/bundler/src/link-driver.ts` — one yield before each `barrelModuleInterface`
  compile, which is the barrel walk's per-family compile.
- `packages/bundler/src/hooks/transform-hook.ts` — one yield before the first-pass
  `transformTsrxModule`. It sits *after* `beginSourceSymbolClaims`, so a sibling
  transform that starts in the gap waits on the publication barrier rather than racing
  the claims this compile is about to publish.

Measured effect: the longest block fell from 178,747 ms to 1,534 ms, and no connection
was dropped. No configuration change was needed and none was made — with the loop
turning, node's 5 s reaper behaves correctly.

## Part (b) — one compile per `(input)`, not per request

`packages/compiler/src/compile-cache.ts` (new) memoizes `compileTsrxModule` on its whole
input, and `compile-module.ts` routes every call through it. Three separate duplications
collapse onto one compile:

- the plain import and the `?markless-symbols` request for the same `.tsrx`;
- `barrelModuleInterface` → `compileTsrxModuleLinkArtifact`, which runs a **full**
  `compileTsrxModule` on every family just to read its interface, once per barrel walk —
  and the walk runs again for the transform hook's recovery pass and again for each
  importing module;
- any later request for a module whose source has not changed.

Design notes worth keeping:

- **The key is the input, so nothing needs invalidating by hand.** It covers `filename`,
  `source`, `buildId`, `resolverId`, `omitAuthoredSource`,
  `additionalFrameworkApiSources`, `symbols`, and the two interface records (their keys
  sorted, because the two requests build them in whatever order their imports resolved).
  An edited file is a different key, so no `handleHotUpdate` hook is involved and there
  is no window where a stale compile can be served.
- **The promise is cached, not the result**, so two requests that race collapse onto one
  compile instead of two.
- **A throwing compile is not remembered.** The transform hook answers one by recompiling
  against a wider link input, and a stored rejection nobody awaits again would surface as
  an unhandled rejection.
- **Bounded at 128 entries, least-recently-used first.** Eviction only costs a recompile.
- The result object is now shared between the requests that asked for it, so every
  artifact it carries is read-only from here on. Nothing in `packages/bundler` or
  `packages/compiler` assigns into a returned artifact (a text search over both trees for
  assignment into `compiled.*` and `moduleGraphInterface.*` found none — that is a search,
  not a receipt), and the byte-identity check below is the standing guard.

### How much of the 180 s this was

U507 could not separate the barrel walk's duplicate compiles from the consumer module's
own compile, because both were paid inside the same opaque window. This unit separates
them, and the answer is that the duplicates were nearly all of it: with the memo in
place the whole entry graph pre-warms in **4.8 s**. U507's estimate for the
plain-vs-`?markless-symbols` duplicate alone was ~2.7 s; the far larger share was
`barrelModuleInterface` recompiling every family from source on every walk.

That also revises U507's recommended cut. `parseModule` is still uncached and still
quadratic in the call sites U507 named, and U-b…U-d are still worth doing — but the cold
gallery load is no longer the evidence for them, because it no longer performs the
repeated compiles that made that cost visible.

## Emission is byte-identical

The pre-warm fetches all 33 entry-graph modules and prints each response's byte count.
Comparing the before and after runs, **32 of 33 are byte-for-byte identical**, including
`Gallery.tsrx?import` (2,403,098 bytes), its render-data (1,845,660), payload (226,620)
and resume (274,160) virtual modules, and all 19 family `.tsrx` modules.

The one difference is `/@vite/client`, 207,385 → 207,397 bytes: Vite's own client, which
embeds server-run detail. No markless-emitted module changed.

The gallery renders the same families as before, with the same element counts. The check
still exits 1 on `#select rendered no role="combobox"` — that failure is present on the
unchanged tip too and is not this unit's.

## Part (c) — could the barrel hand the graph only the families the page imports?

**Report only; not implemented, and it needs a compiler pass this unit may not edit.**

The mechanism today: `@markless/ui`'s `src/index.ts` is 30 lines of
`export * as <family> from './<family>/index.ts'`. `linkBarrelComponents`
(`packages/compiler/src/passes/link/`) walks that file and reports every re-exported file
it needs an interface for as `pendingInterfaces`; `barrelModuleInterface`
(`packages/bundler/src/link-driver.ts:347`) compiles each one. The pass is given the
importing module's `moduleImports` — that is, the *specifier* `@markless/ui` — and nothing
about which of its 30 names the importer actually binds.

`Gallery.tsrx` names 20 of the 30 in a single named-import clause, so the information the
narrowing needs is already in the module: the local names bound from the barrel
specifier. Narrowing therefore means widening the pass's input from "which specifiers does
this module import" to "which names does it bind from each specifier", and having the walk
follow only the `export * as <name>` rows that bind one of them. `export *` (unnamespaced)
rows would have to stay fully walked, because a bare re-export cannot be attributed to a
name without reading the re-exported module.

Cost, measured on this tip rather than estimated: the 10 unused families are 10 of 30
interface compiles per walk. With the memo in place each family is compiled once per
server process, and the whole entry graph now pre-warms in 4.8 s — so the ceiling on this
optimization is now roughly a third of a few seconds, not a third of three minutes. It
grows linearly with the barrel, so it will matter again at a much larger family count,
but on today's numbers it is not worth a pass change.

Where it would still pay is the production build, which compiles the barrel's families
into the graph whether or not the page names them. That was not measured here.

## Verification, and the one test this change contradicts

- `pnpm typecheck` — clean.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors over 1,520 files.
- `pnpm --dir apps/sr-gallery build` — exit 0. It now builds in **7.6 s**; U507 measured
  the same build at 3 m 25 s on its tip, for the same reason the dev server sped up.
- `pnpm exec vp test packages/bundler/test packages/compiler/test` — 9 failing files.
  Seven are the reds this packet named as pre-existing: `doctrine-guard`,
  `dense-async-symbol-table`, `fixture-builds`, `inline-resumer`,
  `music-player-ssr-budget`, `music-player-csr-budget`, `self-route-recursion`.
  The eighth was this unit's own new test and is fixed. The ninth is below.

**`packages/compiler/test/parse-cache/parse-count.test.ts:41` — `compiling the same
source again parses nothing`.** The assertion is
`expect(second.hits).toBeGreaterThan(first.hits)`; it now reads `expected 7 to be greater
than 7`. The test compiles one fixture twice and requires the second compile to register
additional *parse-cache* hits. With the compile memo the second compile does not run at
all, so the parser is never reached and the hit counter does not move — which is a
stronger form of what the test's own name asserts ("parses nothing"), not a weaker one.
The other four tests in that file still pass, including the two that exercise
`parseModule` directly.

The fix is a one-line change to that assertion (`toBe(first.hits)`), plus a
`expect(second.misses).toBe(first.misses)` that already passes. This unit's file contract
does not include `packages/compiler/test/**`, so the change was not made here.

## Files changed

- `packages/compiler/src/compile-cache.ts` (new) — the memo.
- `packages/compiler/src/compile-module.ts` — routes `compileTsrxModule` through it.
- `packages/bundler/src/event-loop.ts` (new) — `yieldToEventLoop`.
- `packages/bundler/src/link-driver.ts` — yield before each barrel-walk family compile.
- `packages/bundler/src/hooks/transform-hook.ts` — yield before the first-pass compile.
- `packages/bundler/test/compile-memo.test.ts` (new) — pins that one compile serves
  repeat requests, that each keyed field still forces its own compile, and that a
  throwing compile is not remembered.
