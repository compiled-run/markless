# carousel — implementation notes

Research: `goals/headless-components/notes/research-carousel.md`.
QDS source read as structural truth: `~/dev/open-source/qwik-design-system/libs/components/src/carousel/`.

**Status: green.** All 30 browser rows pass, and the virtual screen-reader lane
(`carousel.sr.ts`, registered in `.github/workflows/screen-reader.yml`) passes with its
own pins.

## Shape

Nine parts, the QDS `index.ts` exactly: `carousel.root`, `.title`, `.scrollarea`,
`.item`, `.backtrigger`, `.forwardtrigger`, `.navlist`, `.navtrigger`, `.playtrigger`.
QDS's `carousel-player.tsx` is on disk but unexported, so it is not a part.

Three modules behind them:

- `carousel-engine.ts` — the slide math. A `SlideEngine` per scroll area in a
  module-level `WeakMap`, exactly QDS's `getCachedTransformManager` shape. This is the
  owner's route for closure state: an imported module resolves to one instance every
  handler shares, so nothing about drag physics is a graph cell and nothing is
  described in the payload. It folds QDS's `WaapiAnimationCore`, `TransformManager`,
  `VelocityTracker` and `momentum` into one class, because the four only ever existed
  apart to satisfy Qwik's serializer.
- `carousel-navigation.ts` — pure value math: which slides are reachable, and which
  value a step, a key, or an autoplay tick lands on.
- `carousel.tsrx` — the parts. All behaviour is **methods on the shared instance**;
  see "What the compiler refused" below.

Slides are collected with `element<HTMLElement[]>()` (the C-prime plural handle) on the
root's shared instance, and each slide carries its own value in `ui-value`. There is no
DOM traversal anywhere in the family: no `querySelector*`, no `closest()`.

## What the compiler refused, and the shape that replaced it

1. **A module-scope helper taking the shared instance** — `show(carousel, next)` —
   is `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`. A handler is compiled into
   its own module and a shared method call is compiled by copying the method body in,
   so only a *call on the instance* has a body to copy. Every rule therefore lives as a
   method on `carouselState`: `show`, `step`, `walk`, `startAutoplay`, `stopAutoplay`,
   `beginDrag`, `dragTo`, `endDrag`.
2. **A same-module helper returning an object built from graph reads** is
   `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED`. The navigation helpers were rewritten to
   take plain values and return plain values.
3. **A widget-scoped `shared()` rooted by a part inside a keyed `@for`** is
   `MARKLESS_CAPTURE_OPAQUE_PROP`: the part's seed cannot reach the handler module from
   a loop row. `carousel.item` and `carousel.navtrigger` therefore hold their own value
   in a component-local `state({ value })`, which is the shape `checklist.item` already
   ships and the shape that survives a keyed row.
4. **`@for` directly inside a component element** does not parse; it needs a native
   element parent (`<div>` here). Same as every other family's scenarios.

## Deviations from QDS, and the constraint that forced each

1. **`value` is required on `carousel.item`, and `carousel.navtrigger` takes a `value`
   at all.** QDS derives both from a construction-order counter
   (`context.currItemIndex++`). Positional identity is never a consumer prop and
   markless has no render-time counter, so a slide is named by its value. Same
   deviation tabs made, same reason.
2. **No `aria-label="{n} of {total}"` on a slide, and no `aria-label="Slide N"` on a
   picker.** Both need a per-part ordinal and a sibling count at render; neither
   capability has landed. A slide is a named group only if the consumer names it
   through `{...rest}`. This is the family's biggest accessibility debt.
3. **No `aria-controls` from picker to slide.** Pairing two part families by value is
   not expressible; tabs has the same unwired gap.
4. **No `aria-labelledby` from the root to `carousel.title`.** The root cannot read a
   handle from the factory it roots in an IDREF position
   (`MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`), and a carousel has no non-root part
   to hang the name on. `carousel.title` still mints its element handle so this becomes
   one line the day the restriction lifts.
5. **No `aria-label="content slideshow"` fallback.** The APG says a carousel's name must
   not contain the word carousel, and `aria-roledescription` already says it. An
   unnamed carousel gets no name rather than a bad one, per research §2.2.
6. **`aria-atomic="false"` added.** The APG asks for it; QDS omits it.
7. **Pointer events with `setPointerCapture` instead of mouse + touch + window
   listeners.** Authored `window:onX` markup events are deferred, and pointer capture is
   the platform answer: the gesture keeps arriving after the pointer leaves the
   carousel. It also collapses QDS's parallel mouse and touch handlers into one path;
   `sensitivity.mouse` / `sensitivity.touch` still pick per `event.pointerType`.
8. **No resize listener.** Same deferred capability. Cached bounds are invalidated at
   the start of every gesture and every programmatic move instead, which costs two
   layout reads per gesture rather than per frame.
9. **No `inert` / `hidden` on out-of-view slides.** The server has no layout, and the
   APG names wrongly-hidden slides as a real reader failure. Every slide is served
   visible; QDS reaches the same place less explicitly by guarding on `isBrowser`.
10. **`{...rest}` lands on the scroll area's outer window element**, not the inner
    track. QDS spreads onto the inner element and styles the outer from its own
    `carousel.css`; this family ships no CSS, so the element a consumer places and
    sizes has to be the one their props reach. The inner track carries `ui-track` for
    styling and is what the engine transforms.
11. **`move: "view"` is measured on demand** rather than through QDS's injected
    `view-navigation.script.ts` and `window.carouselState` global.
12. **The wheel does not `preventDefault`.** A sync policy that has to beat the browser
    must be readable from event fields alone, and `mousewheel` is graph state
    (`MARKLESS_SYNC_POLICY_UNEXTRACTABLE`). Consumers block page scroll with
    `overscroll-behavior`.
13. **Autoplay only ever starts from `carousel.playtrigger`** (owner ruling for v1).
    The `autoplay` prop still declares the state the root renders with — it drives
    `aria-live` — but no timer starts at render.
14. **Infinite `loop` wraps the value, not the slides.** QDS's `InfiniteScrollManager`
    (463 lines of offset bookkeeping) is not ported. `loop` and `rewind` both make the
    ends come round; neither duplicates slides to fake an endless ring.
15. **No focus handler on `carousel.item`.** `focusin` bubbles, so the root's handler
    already stops rotation for anything focused inside.

## Closed reds

1. **`a trigger in one carousel leaves the other alone` (CSR and SSR)** — defect 78,
   fixed compiler-side: a handle read now takes the bound edge's instance path, so the
   two carousels no longer share one registration.
2. **`autoplay advances the slides`** — defect 79, fixed compiler-side: writes inside
   timer callbacks lower through the write-aware band.
3. **`a vertical carousel says so and still steps` (CSR and SSR)** — defect 82, fixed
   here. Diagnosis and fix below; the earlier entry ruled measurement out and was
   wrong about it.

## Defect 82 — the vertical axis, and why measurement was the seat

`step()` reads `slidesPerView` *before* it computes which slides are reachable, so the
measurement was never downstream of the write the way the old note claimed. What it
measured was the viewport's size along the axis, and that is only a window when the
consumer has constrained it. Width usually is — a block-level viewport takes its
containing block's width — so the horizontal rows measured one slide per view and
stepped fine. Height usually is not: the vertical scenario's viewport was auto-height,
so `clientHeight` reported its own content, all three slides read as visible,
`reachableValues` computed `last = 3 - 3 = 0`, and exactly one slide was reachable.
`stepValue` then answered the slide already showing, `carousel.value` never changed,
and no slide activated. The handler ran to completion the whole time.

The fix follows QDS: `itemsPerView` there is a signal fixed at 1, and the visibility
probe that would raise it is mounted only for `move="view"` (`carousel-root.tsx` gates
both the browser effect and `<PostRender />` on `isMoveView`). A carousel that steps by
a fixed count navigates by that count, and a measurement must not override it. Our
`slidesPerView` now takes `move` and answers 1 unless the consumer asked for `view`,
and even then refuses a viewport that does not clip — a viewport with no overflow is
windowing nothing and cannot report a slide count. `reachableValues` also floors the
count at 1, so a bad number can no longer push `last` negative and empty the reachable
set, which is a dead carousel rather than a stopped one.

**What hid it: the scenarios had no CSS at all.** Each scenario carried
`<style>{CAROUSEL_CSS}</style>`, and that element never reached the page — markup
`<style>` is dropped, verified by dumping the rendered document. So every row ran
against an unstyled stack of divs, where a vertical viewport degenerates exactly as
above. The sheet is now installed straight into the document by the suite
(`installCarouselCss`), and the vertical row asserts the layout it depends on: the
viewport clips, the slides run down, and they share a left edge. Markup `<style>` is a
compiler-side gap and is not this family's to fix.

## Not built

`scenarios/slides-from-data.tsrx` was written and removed: it is blocked by (3) under
"What the compiler refused". A carousel authored over a slide array is the normal case,
so this gap is worth a charter of its own.
