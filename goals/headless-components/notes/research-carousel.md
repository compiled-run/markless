# Carousel — component research for `@markless/ui`

**Research date:** 2026-08-23
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**Branch read for Markless facts:** `feat/headless-ui-pilot` @ `fc66d3f9`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/carousel/` (READ-ONLY)
**Cluster note:** carousel is the second **closure-state pattern family**, and it is the harder of
the two. Read `research-class-state.md` first; §6 here is where its four options meet a real corpus.

---

## 1. Name and alternates

Searched under: carousel, slider, slideshow, gallery, image slider, marquee, scroller, coverflow,
embla, swiper, keen-slider.

- **Carousel** is the name in Ark UI, Shadcn, Mantine, QDS and the ARIA APG. It is what the pattern
  is called.
- **Slider** is a *different* family — a range input (`role="slider"`). QDS ships both and keeps
  them apart. Anything named "slider" that moves slides is using the wrong word; anything named
  "slider" that picks a number is the other family.
- **Alternative-named implementations, and this is the section that matters most for carousel.**
  Unlike every other family in this tranche, the best implementations are *not* in the tier-1
  headless libraries:
  - **Embla Carousel** (`embla-carousel`, framework-agnostic core plus React/Vue/Svelte/Solid
    bindings) is the de-facto engine. Shadcn's `carousel.tsx` is an Embla wrapper, and the grep
    sample shows that exact file copied into `shadcn-ui/ui` three times (its `aria`, `radix` and
    `base` registry bases), `AutoGPT`, `awesome-llm-apps` and `dify` — all with the same
    `role="region" aria-roledescription="carousel"` root and the same `onKeyDownCapture` handler.
    Embla's own model is a scroll container plus a transform engine with its own physics.
  - **Keen Slider** and **Swiper** are the other two engines in wide use; Swiper is not headless.
  - **Base UI ships no carousel.** Radix ships no carousel. React Aria ships no carousel. Kobalte,
    Bits and Melt ship none. **This is the only family in the tranche where the tier-1 set is
    mostly empty**, and that is itself the finding: the pattern is hard enough that the accessible
    headless libraries have declined it, and the market is served by physics engines.

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
carousel-root.tsx           carousel-scroll-area.tsx     carousel-item.tsx
carousel-back-trigger.tsx   carousel-forward-trigger.tsx carousel-nav-list.tsx
carousel-nav-trigger.tsx    carousel-play-trigger.tsx    carousel-player.tsx
carousel-title.tsx          carousel-utils.ts            view-navigation.script.ts
hooks/use-autoplay.tsx
math/{index,waapi-core,transform-manager,infinite-scroll-manager,momentum,velocity-tracker}.ts
index.ts   carousel.css   carousel.browser.tsx
```

`index.ts`:

```ts
export { CarouselItem           as item }           from "./carousel-item";
export { CarouselNavList        as navlist }        from "./carousel-nav-list";
export { CarouselNavTrigger     as navtrigger }     from "./carousel-nav-trigger";
export { CarouselForwardTrigger as forwardtrigger } from "./carousel-forward-trigger";
export { CarouselPlayTrigger    as playtrigger }    from "./carousel-play-trigger";
export { CarouselBackTrigger    as backtrigger }    from "./carousel-back-trigger";
export { CarouselRoot           as root }           from "./carousel-root";
export { CarouselScrollArea     as scrollarea }     from "./carousel-scroll-area";
export { CarouselTitle          as title }          from "./carousel-title";
```

**Nine parts.** Note `carousel-player.tsx` exists on disk and is **not exported** — it is a
near-duplicate of `carousel-play-trigger.tsx` (both write `ui-qds-carousel-play-trigger`). Dead
file; the folder listing is the part inventory *as filtered by `index.ts`*, and this is the one
place in the tranche where the two disagree. Nine parts, not ten.

`math/` and `hooks/` are implementation, not parts.

### What QDS actually implements

| Concern | QDS behaviour (from the code) |
| --- | --- |
| Root | `role="group"`, `aria-roledescription="carousel"`, `aria-labelledby={titleId}` when a title is mounted else `aria-label="content slideshow"`, `aria-live={autoplay ? "off" : "polite"}`; `ui-horizontal`/`ui-vertical`/`ui-loop`/`ui-move-view` |
| Root props | `draggable` (`true`), `align` (`"start"`), `rewind` (`false`), `loop` (`false`), `autoplayInterval` (`3000`), `sensitivity` (`{mouse, touch}`), `move` (`number \| "view"`), `orientation` (`"horizontal"`), `mousewheel`, `onChange$`, plus `bind:value` and `bind:autoplay` |
| Item | `role="tabpanel"` **only when nav triggers exist**, else no role; `aria-roledescription="slide"`, `aria-label="{n} of {total}"`, `inert` when out of view, `hidden` when inactive and not a scroller, `ui-active`, `ui-qds-index` |
| Item identity | `value ?? String(index)` from a construction-order counter, then written into `itemValues[index]` in a task |
| Scroll area | a viewport wrapper plus an inner `Render`; carries `onWheel$`, mouse/touch drag handlers; **no role, no ARIA, no tabindex** |
| Nav list / nav trigger | `role="tablist"` / `role="tab"` with `aria-selected`, `aria-controls={itemId}`, `aria-label="Slide {n}"` |
| Back / forward triggers | plain buttons, `aria-label` defaulting to `"Previous slide"` / `"Next slide"` |
| Play trigger | a button whose `aria-label` flips between play and pause wording |
| Autoplay stop | `carousel-item` sets `autoplayValue = false` on `focusin` |
| Closure state | five classes in `math/`, plus module-level `WeakMap` caches keyed by the scroll-area element (`getCachedTransformManager`, `getCachedInfiniteScrollManager`) |

`carousel.browser.tsx` carries **71 tests** — the largest suite in the QDS repo. That is the
behaviour contract, and its size is the honest measure of this family's cost.

### Things to fix rather than copy

1. **`role="group"` where the APG says `region` or `group`.** The APG's rule is that the choice
   depends on information architecture: `region` gets a landmark, `group` does not. QDS hard-codes
   `group` and offers no way to ask for `region`. A carousel that *is* a page section wants
   `region`. Our root should take the choice as a prop or default to `region` (§9 question 2).
2. **`aria-label="content slideshow"` as the fallback name.** The APG says explicitly the label
   should **not** include the word "carousel"; "slideshow" is the same mistake in a synonym, and
   the reader already announces the role description. A carousel with no title should have **no**
   `aria-label`, and a dev diagnostic, rather than a bad one.
3. **`aria-live="polite"` on the root when not autoplaying.** The APG says `aria-live="off"` when
   auto-rotating and `polite` when not — QDS matches that. But it does **not** set
   `aria-atomic="false"`, which the APG also asks for, and the live region is the whole root rather
   than the slide container, so a polite announcement re-reads the triggers too.
4. **The rotation control is not first in the tab sequence.** The APG is unusually blunt about
   this: the play/pause control "is the first element in the Tab sequence inside the carousel" and
   that placement "is essential". QDS's `playtrigger` is wherever the consumer puts it. We cannot
   force DOM order either — but we can say it in the docs and assert it in the realistic scenario.
5. **Autoplay stops on focus but not on hover.** `carousel-item`'s `onFocusIn$` sets
   `autoplay = false`. The APG requires *both*: "stops rotating whenever the mouse is hovering over
   the carousel". Missing.
6. **Autoplay, once stopped by focus, never resumes.** The APG says it should only resume when the
   person explicitly activates the rotation control — so QDS is right here, and it is worth writing
   down so nobody "fixes" it.
7. **`role="tabpanel"` appears conditionally on the item.** An item is a tabpanel when nav triggers
   are present and a bare div otherwise. The APG does describe both a basic and a tabbed variant,
   so the *intent* is right, but deciding it from `navTriggerRefsArray.length > 0` means the role
   can change after mount as triggers register. A role that flips is worse than either role.
8. **The scroll area has no keyboard model at all.** No tabindex, no arrow keys. Keyboard users
   reach slides only through the triggers. Several production carousels in the grep sample
   (`stisla`, `supabase`'s `Row`, `facebook/astryx`) put `tabIndex={0}` on the scroller so it is
   focusable and arrow-scrollable. The APG does not require it, but it is the difference between a
   scrollable region a keyboard can drive and one it cannot.

---

## 3. Headless library survey

| Library | Has a carousel? | Notes |
| --- | --- | --- |
| **Base UI** | **No** | |
| **Radix** | **No** | Shadcn's Radix-base registry wraps Embla instead |
| **React Aria** | **No** | |
| **Ariakit** | **No** | |
| **Kobalte / Bits / Melt / Corvu / Headless UI** | **No** | |
| **Ark UI** | **Yes** | `Root, Control, PrevTrigger, NextTrigger, ItemGroup, Item, IndicatorGroup, Indicator, AutoplayTrigger, AutoplayIndicator, ProgressText`. Root props: `slideCount`, `allowMouseDrag`, `autoplay`, `autoSize`, `defaultPage`, `loop`, `orientation`, `page`, `slidesPerPage`, `slidesPerMove`, `spacing`, `snapType`. Data attributes `data-index`, `data-inview`, `data-dragging`, `data-current`. States it complies with the APG carousel pattern |
| **Dice UI** | Yes | Embla-backed |
| **QDS** | Yes | 9 parts, own physics (§2) |
| **Embla** (alternative-named) | engine, not a part set | scroll container + transform engine; the thing everyone else wraps |

Cross-library agreement, such as it is:

| Decision | Agreement | Detail |
| --- | --- | --- |
| Root / viewport / item-group / item decomposition | Ark, Embla, QDS, Shadcn all have it | names differ hard: `ItemGroup` (Ark) vs `scrollarea` (QDS) vs `CarouselContent` (Shadcn) |
| Prev / next triggers as separate parts | universal | |
| Slide indicators as a tablist | Ark (`IndicatorGroup`/`Indicator`), QDS (`navlist`/`navtrigger`), APG tabbed variant | Shadcn ships none |
| Autoplay as a part with its own trigger | Ark, QDS | Embla puts it in a plugin |
| `slidesPerPage` / `itemsPerView` | Ark, Embla, QDS | QDS derives it from measurement rather than a prop |
| `loop` | Ark, Embla, QDS | QDS additionally has `rewind` (jump back to the start rather than wrap) |
| Drag by pointer | Ark (`allowMouseDrag`), Embla, QDS | Shadcn inherits Embla's |

**Naming ruling for us:** QDS's folder is the truth, so `scrollarea`, `navlist`, `navtrigger`,
`backtrigger`, `forwardtrigger`, `playtrigger`, `title`, `item`, `root`. Note `scrollarea` collides
by *word* with our already-landed `scrollarea` **family**
(`packages/headless/components/src/scroll-area/`). That is a namespace-level collision — `scrollarea.root`
is the landed family, `carousel.scrollarea` is this part — and it is legal, since parts are scoped
to their namespace. It is still a documentation hazard worth one sentence, and §9 question 3 asks
whether `carousel.viewport` would be clearer.

---

## 4. WAI-ARIA, aria-at, and expected screen-reader behaviour

### 4a. The APG carousel pattern

Read `w3.org/WAI/ARIA/apg/patterns/carousel/`, 2026-08-23.

**Container:** `role="region"` *or* `role="group"` — the choice is an information-architecture
decision; `aria-roledescription="carousel"`; `aria-label` or `aria-labelledby`, and **the label must
not contain the word "carousel"**.

**Slides:** `role="group"` with `aria-roledescription="slide"` in the basic variant, or
`role="tabpanel"` (with **no** `aria-roledescription`) in the tabbed variant. Each slide needs a
name; the APG explicitly blesses a position-and-size name like `"3 of 10"` as "a meaningful
alternative".

**Rotation control:** a native `<button>`; its label changes between "Stop slide rotation" and
"Start slide rotation"; **no `aria-pressed`** — the APG is explicit that state properties are wrong
here because the label already carries the state; and it **must be first in the Tab sequence inside
the carousel**.

**Live region:** `aria-atomic="false"`; `aria-live="off"` while auto-rotating, `aria-live="polite"`
when not.

Keyboard:

| Action | Required behaviour |
| --- | --- |
| `Tab` / `Shift+Tab` | ordinary page tab sequence through the carousel's interactive elements |
| any carousel element receiving keyboard focus | **auto-rotation stops** |
| mouse hovering anywhere over the carousel | **auto-rotation stops** |
| rotation control activation | does not move focus, so it can be hit repeatedly |
| prev / next buttons | standard button behaviour |
| slide-picker tabs, if present | the Tabs pattern's keyboard model applies |

The APG names two screen-reader failure modes to design against: slides that are off-screen being
*incorrectly* hidden from the reader, and auto-rotation causing "an element just announced is from
an entirely new context" without the person knowing.

### 4b. aria-at coverage — **absent**

`w3c/aria-at`, `tests/apg/` directory listing read 2026-08-23. The 40 plans are: accordion, alert,
banner, breadcrumb, checkbox-tri-state, checkbox, combobox-autocomplete-both-updated,
combobox-select-only, command-button, complementary, contentinfo, disclosure-faq,
disclosure-navigation, form, horizontal-slider, link-css, link-img-alt, link-span-text, main,
menu-button-actions-active-descendant, menu-button-actions, menu-button-navigation, menubar-editor,
meter, minimal-data-grid, modal-dialog, quantity-spin-button, radiogroup-aria-activedescendant,
radiogroup-roving-tabindex, rating-radio-group, rating-slider, seek-slider, slider-multithumb,
switch-button, switch-checkbox, switch, tabs-automatic-activation, tabs-manual-activation,
toggle-button, vertical-temperature-slider.

**There is no carousel plan.** There is no community-vetted assertion set for this family, at any
priority. Everything in §4c is derived from the ARIA semantics per the SKILL's rule ("derive
announcements from the ARIA semantics — do not run screen readers"), and must be labelled as ours
rather than borrowed.

The two nearest plans are `tabs-automatic-activation` and `tabs-manual-activation`, which do cover
the **tabbed variant's picker** exactly — a `tablist` of `tab`s controlling `tabpanel`s. So the
navlist/navtrigger half of this family *does* have an aria-at reference, inherited from tabs; the
slide half does not.

### 4c. Expected announcements — derived, not borrowed

Reference shape: a carousel titled "Featured destinations" with three slides and a nav list.

**Sequence A — Tab into the carousel with a title mounted**

1. keypress `Tab`
2. → "Featured destinations"
3. → "carousel" — from `aria-roledescription`, replacing the role word
4. → the first focusable element inside. **If the APG's ordering rule is honoured this is the
   rotation control**, and the reader says "Start slide rotation, button".

**Sequence B — Tab into the carousel with no title**

Identical, except step 2 is silent and step 3 announces only "carousel". This is the row that
catches QDS's `aria-label="content slideshow"` fallback: with it, the reader says "content
slideshow, carousel", which is the doubled-role wording the APG warns against.

**Sequence C — arriving on a slide (basic variant)**

1. → "1 of 3" — the slide's name
2. → "slide" — from `aria-roledescription`, replacing "group"

**Sequence D — arriving on a slide (tabbed variant)**

1. → the slide's name
2. → "tab panel" — and **no** "slide", because the APG says the tabbed variant carries no
   `aria-roledescription`. Getting both is the most likely mistake, and it is exactly what QDS's
   conditional role produces if `aria-roledescription="slide"` is left on.

**Sequence E — pressing the next button**

1. → nothing from the button itself beyond its own name and role
2. → **if not auto-rotating**, the newly shown slide is announced by the polite live region
3. → **if auto-rotating**, silence, because `aria-live="off"`. That asymmetry is the pattern's
   whole point and is the row a live-region regression shows up in.

**Sequence F — activating the rotation control**

1. → "Stop slide rotation, button" becomes "Start slide rotation, button" on the next read
2. → **no** "pressed" / "not pressed". A reader saying either means someone added `aria-pressed`.

**Not derivable and therefore not asserted:** how any specific reader handles `inert` slides
mid-transition. The APG names off-screen-slide hiding as a known confusion source but prescribes
nothing, so our rows assert the attribute state, not the announcement.

---

## 5. GitHub patterns (grep MCP)

- `aria-roledescription="carousel"` (TSX) — the dominant real-world shape is
  `role="region" aria-roledescription="carousel"` with a `tabIndex={0}` scroller and an
  `onKeyDownCapture` arrow handler. Seen in `shadcn-ui/ui` (three registry bases, identical file),
  `AutoGPT`, `dify` (twice), `awesome-llm-apps`, `supabase`'s `ui-patterns/Row`, `stisla`,
  `facebook/astryx`. **`region`, not `group`, is what production code writes** — direct evidence for
  §2.1.
- `stisla`'s vanilla example is the closest to the APG letter:
  `role="region" aria-roledescription="carousel" aria-label="Travel destinations"` with each slide
  `role="group" aria-roledescription="slide" aria-label="1 of 3"`. That is the exact shape §4c
  Sequence C describes.
- `facebook/astryx`'s `Carousel.tsx` header comment is worth quoting because it names the whole
  design in one line: *"Horizontal scroll container with fade-edge overflow indication, optional
  prev/next buttons on the top layer, scroll-snap, ... and Shift + wheel mapping so mouse users can
  scroll horizontally. Exposes APG carousel semantics: the root is a labelled region with
  `aria-roledescription="carousel"` and each item wrapper is a group with
  `aria-roledescription="slide"` named 'Slide N of M'."* Note: **scroll-snap, not a transform
  engine.**
- **Anti-pattern in the sample:** several of the Embla wrappers (`AutoGPT`, `dify`,
  `awesome-llm-apps`) carry `role="region" aria-roledescription="carousel"` with **no
  `aria-label`**, which is an unnamed region — worse than QDS's bad label, because a region with no
  name is announced as an anonymous landmark.
- `dify`'s `base/carousel/index.tsx` has `// onKeyDownCapture={handleKeyDown}` commented out —
  keyboard support deliberately disabled in shipped code. The pattern is hard enough that people
  turn it off.

---

## 6. Closure state — carousel is where the class-state question is actually decided

Select turned out to need no closure state at all (`research-select.md` §6d). Carousel does not get
off that lightly, and this section is the reason the class-state memo was commissioned.

### 6a. What QDS holds in classes, and why (from `research-class-state.md` §1.2, re-checked)

| Class | Fields | Why it is not a signal |
| --- | --- | --- |
| `VelocityTracker` | two pre-sized `Float64Array`s, `head`, `count` — a ring buffer | `addSample` writes two slots per `pointermove` and **allocates nothing**. A graph cell per sample is an allocation per pointer event |
| `TransformManager extends WaapiAnimationCore` | `lastAppliedPosition`, `cachedBoundaries` + `boundariesInvalidated`, `cachedItemPositions: Float64Array` + `itemPositionsInvalidated` | its own header comment: *"Performance: Tracks last known position to avoid expensive `getComputedStyle()` calls during touch interactions on mobile"* |
| `InfiniteScrollManager extends WaapiAnimationCore` | wrap bookkeeping | inheritance |
| `MomentumAnimator` | fling integration state | per-frame |
| `WaapiAnimationCore` | the Web Animations handle | a browser object, unserializable by construction |

And the caching layer: `getCachedTransformManager` / `getCachedInfiniteScrollManager` are
**module-level functions over module-level `WeakMap<HTMLElement, T>`**, keyed by the scroll-area
element, reused across `update` re-runs unless the orientation changed.

The four properties the memo distilled (§1.4) all bite here and only here: zero cost until first
interaction, zero allocation per event, no re-derivation per event, and monomorphic non-reactive
field access on the hot path.

### 6b. What landed since the memo, and what it means for carousel

**`MARKLESS_SHARED_FACTORY_CLASS_INSTANCE` and `MARKLESS_STATE_PROPERTY_CLASS_INSTANCE`
(`7df9f103`).** The two obvious translations of the QDS code — `shared(() => new TransformManager())`
and `state({ tm: new TransformManager() })` — are now **refused at compile time** with a message
naming the rewrite. That is strictly better than the `ReferenceError`/`TypeError` the memo measured
(§2.2, §2.5 there), and it means a consumer porting QDS's carousel is stopped rather than shipped
broken. It also means **option (b), transparent class support, is not what landed** — the compiler
refuses classes in graph positions, it does not lower them.

**Module-scope declaration carry (`f18b6c23`).** Handler symbol modules now carry same-file
module-scope declarations, transitively, in authored order, with their imports. The named tests
include *"a module-scope class and its instance reach the handler symbol module"* and *"carried
declarations keep authored order, so a class precedes its instance"*. **This is option (d1) from the
memo, landed** — the exact shape `getCachedTransformManager` needs.

**`MARKLESS_MODULE_INSTANCE_DIVERGENT_HANDLERS` (`7df9f103`, in `symbol-modules.ts`).** And here is
the catch, and it is carousel-shaped. The carry copies the declaration into **every handler module
that names it**. A module-scope `const tracker = new VelocityTracker()` named by
`onPointerdown`, `onPointermove` and `onPointerup` would become **three separate trackers**, so the
compiler refuses it. Verbatim from the diagnostic:

> Module-scope instance "…" is carried into N handler modules (…). Each of those modules runs its
> own constructor, so they hold N separate instances and anything one of them records is invisible
> to the others.

Its two suggestions are exactly the two routes out:

1. *"Move it and its class into their own module and import it. An import resolves to one module
   instance that every handler module shares, so the handlers agree."*
2. *"Or hold the data in `shared()` or `state()` instead, so the graph owns it and the payload
   carries it. Use this when the value has to survive resume or be read during the server render;
   the imported-module route keeps it browser-only."*

**Route 1 is carousel's answer, and it is not a workaround — it is what QDS does.** QDS's classes
already live in their own modules (`math/velocity-tracker.ts`, `math/transform-manager.ts`) and are
reached through module-level *functions*. A `.ts` sibling exporting
`getTracker(el): VelocityTracker` over a module-level `WeakMap` is:

- one module instance shared by every handler that imports it (the carry is not involved — imports
  were always carried, `packages/compiler/test/imported-helper-event-symbols.test.ts`);
- keyed by the scroll-area element, so it is per-widget without any graph plumbing;
- **not** a class instance in any graph position, so none of the three diagnostics apply;
- zero payload bytes, because nothing about it is described anywhere;
- built lazily on first interaction, because the handler symbol module loads on first fire.

That is the memo's §5 recommendation ("pursue (d) before (b) or (c)") reaching its conclusion with
no new authoring API, and carousel is the family that proves it.

### 6c. What stays in the graph

The split is the same one QDS makes, and it is the right one for us for a different reason (payload
rather than serialization):

| Fact | Where |
| --- | --- |
| `value` (which slide is current), `autoplay`, `orientation`, `loop`, `rewind`, `align`, `move` | **graph cells** on the shared instance. These render on the server, resume, and are read by parts |
| `itemsPerView`, `totalItems` | graph cells, but **derived from measurement** — see §7's warning |
| velocity samples, last applied transform, cached boundaries, cached item positions, the WAAPI handle, momentum integration state | **the imported module's `WeakMap`**, browser-only, never described |

### 6d. Parameterised methods (`2e11a8fe`) are what makes the triggers expressible

`carousel.navtrigger` needs `carousel.show(value)`; `backtrigger`/`forwardtrigger` need
`carousel.step(-1)` / `carousel.step(1)`. Per `packages/headless/components/src/otp/note.md`,
re-measured on this tip, a shared method taking a parameter compiles clean and the suite passes on
the parameterised shape — **provided the argument is read off `event.target`, not
`event.currentTarget`** (a handler body is dispatched asynchronously and `currentTarget` is null by
the time the argument expression evaluates). The landed tabs handler shows the idiom
(`tabs.tsrx:132`).

### 6e. Per-item identity

`carousel.item` roots a second `shared({ scope: 'widget' })` family, same as tabs' `tabsPartState`
and the design radio group and select settled on. `value` is **required** on the item — QDS's
`value ?? String(index)` counter is order-dependent and Markless seeds are order-independent by
design.

The two unproven rows carry over: a widget-root part inside a keyed `@for` (unproven for any
family; a carousel authored over a slide array is the normal case), and a widget-root part inside a
**flipping** `@if` arm (refused today with `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`, per the otp
note's "Boxes from an arm").

---

## 7. Markless API design

### Parts

`carousel.root`, `.title`, `.scrollarea`, `.item`, `.backtrigger`, `.forwardtrigger`, `.navlist`,
`.navtrigger`, `.playtrigger` — the QDS `index.ts` exactly, minus the unexported `carousel-player`
duplicate.

### The design decision this family turns on

QDS's carousel is a **transform engine**: a WAAPI-driven `translate` with hand-written momentum,
rubber-banding, velocity tracking and infinite-scroll wrapping, ~1,000 lines across
`carousel-scroll-area.tsx` and `math/`. The alternative, visible in the grep sample
(`facebook/astryx`, `supabase`, `stisla`) and in Embla's newer modes, is **CSS scroll-snap**: an
overflow container with `scroll-snap-type`, `scroll-behavior: smooth`, and `scrollIntoView()` for
programmatic moves. The browser then owns momentum, rubber-banding, touch, and the trackpad.

Under the platform-first convention this repo already applies to overlays
(`research-popover.md` §7 — native `popover` over portals, CSS anchor positioning over JS), the
same argument points the same way here:

| | transform engine (QDS) | scroll-snap (platform) |
| --- | --- | --- |
| momentum, rubber-band, touch physics | hand-written, five classes | free, and correct per-platform |
| the closure-state problem | the whole of §6 | **does not arise** |
| programmatic move | `TransformManager.applyTransform` | `el.scrollTo({ behavior: 'smooth' })` |
| "which slide is current" | computed from transform | `IntersectionObserver`, or `scrollend` + geometry |
| infinite loop | `InfiniteScrollManager` | not expressible without duplication tricks |
| `move: "view"` (page by viewport) | supported | `scroll-snap-align` + `scrollBy(clientWidth)` |
| slide count / items-per-view | measured | measured either way |

**Recommendation: scroll-snap for v1, and `loop` deferred.** It removes this family's entire reason
to exist in the class-state memo, it matches what production React carousels actually ship, and it
is the same platform-first bet the overlay families already took. The cost is real and must be
stated: **infinite looping is not deliverable this way**, and QDS ships it. That is §9 question 1
and it is the biggest owner call in this document.

The rest of §7 assumes that recommendation; if the owner rules the other way, §6b's imported-module
route is the mechanism and the family gets materially larger.

### Types (`carousel-types.ts`)

```ts
import type { ElementHandle, Handler, PropsOf, Seeded } from '@markless/core';

export type CarouselOrientation = 'horizontal' | 'vertical';
export type CarouselAlign = 'start' | 'center' | 'end';

export type CarouselRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The value of the slide showing now. Omit it and the first slide shows. */
	readonly value?: string;
	/** Which axis the slides run along. Omit it and they run left to right. */
	readonly orientation?: CarouselOrientation;
	/** Where a slide comes to rest in the viewport. */
	readonly align?: CarouselAlign;
	/** Slides advance on their own. Omit it and they do not. */
	readonly autoplay?: boolean;
	/** How long each slide is shown, in milliseconds, while autoplay is on. */
	readonly autoplayInterval?: number;
	/** Make the carousel a page landmark rather than an unnamed grouping. */
	readonly landmark?: boolean;
	/** Called with the new value when the showing slide changes. */
	readonly onChange?: (value: string) => void;
};

export type CarouselItemProps = PropsOf<'div'> & {
	/** Identifies this slide; `carousel.navtrigger` points at it by the same value. */
	readonly value: string;
};

export type CarouselNavTriggerProps = Omit<PropsOf<'button'>, 'onClick'> & {
	/** Which slide this picker shows. */
	readonly value: string;
	readonly onClick?: Handler<PropsOf<'button'>['onClick']>;
};

export type CarouselTitleProps        = PropsOf<'h2'>;
export type CarouselScrollAreaProps   = PropsOf<'div'>;
export type CarouselNavListProps      = PropsOf<'div'>;
export type CarouselBackTriggerProps  = PropsOf<'button'>;
export type CarouselForwardTriggerProps = PropsOf<'button'>;
export type CarouselPlayTriggerProps  = PropsOf<'button'>;

export type CarouselInstanceState = Seeded<
	CarouselRootProps,
	'value' | 'orientation' | 'align' | 'autoplay' | 'autoplayInterval' | 'landmark'
> & {
	/** A `carousel.title` mounted itself; the root names itself from it. */
	titled: boolean;
	/** A `carousel.navtrigger` mounted; the items become tab panels. */
	tabbed: boolean;
	titleEl: ElementHandle<HTMLElement>;
	scrollEl: ElementHandle<HTMLElement>;
	onChange?: CarouselRootProps['onChange'];
};

export type CarouselItemState = { value: string };
```

`loop`, `rewind`, `draggable`, `sensitivity`, `move`, `mousewheel` are **absent from v1** and their
absence is argued: drag, momentum and wheel come from the scroll container; `loop` is the deferred
capability in §9 question 1; `move: "view"` becomes `scrollBy(clientWidth)` and needs no prop.

### Sketch

```tsx
export const carouselState = shared(() => {
	const carousel: CarouselInstanceState = state({
		value: '', orientation: 'horizontal' as CarouselOrientation,
		align: 'start' as CarouselAlign, autoplay: false, autoplayInterval: 3000,
		landmark: false, titled: false, tabbed: false,
	});
	const titleEl = element<HTMLElement>();
	const scrollEl = element<HTMLElement>();

	return {
		...carousel, titleEl, scrollEl,
		onChange: undefined as ((value: string) => void) | undefined,
		show(next: string) {
			if (carousel.value === next) return;
			carousel.value = next;
			carousel.onChange?.(next);
		},
		// The APG's rule, in one place: any focus inside stops rotation, and only
		// the rotation control starts it again.
		halt() { carousel.autoplay = false; },
	};
}, { scope: 'widget' });

export function CarouselRoot({
	value = '', orientation = 'horizontal', align = 'start',
	autoplay = false, autoplayInterval = 3000, landmark = false,
	onChange, children, ...rest
}: CarouselRootProps) @{
	const carousel = carouselState();
	carousel.onChange = onChange;
	carousel.value = value; carousel.orientation = orientation; carousel.align = align;
	carousel.autoplay = autoplay; carousel.autoplayInterval = autoplayInterval;
	carousel.landmark = landmark;

	<div
		{...rest}
		role={carousel.landmark ? 'region' : 'group'}
		aria-roledescription="carousel"
		aria-live={carousel.autoplay ? 'off' : 'polite'}
		aria-atomic="false"
		ui-vertical={carousel.orientation === 'vertical'}
		ui-autoplay={carousel.autoplay}
		onFocusin={() => carousel.halt()}
		onPointerenter={() => carousel.halt()}
	>{children}</div>
}

export function CarouselItem({ value, children, ...rest }: CarouselItemProps) @{
	const carousel = carouselState();
	const item = carouselItemState();
	item.value = value;
	const current = computed(() => carousel.value === item.value);

	<div
		{...rest}
		role={carousel.tabbed ? 'tabpanel' : 'group'}
		aria-roledescription={carousel.tabbed ? undefined : 'slide'}
		ui-current={current}
	>{children}</div>
}
```

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `aria-labelledby={carousel.titleEl}` on the **root** | `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` — the root cannot read a handle from the factory it roots in an IDREF position. **This is the carousel's accessible name.** Unlike select (where the trigger is a part and can carry it) the carousel has no non-root element to hang the name on. The platform-first dodge radio group used — `fieldset`/`legend` — has no carousel equivalent. **This is the family's hardest blocker** and is §9 question 4 |
| `aria-label="{n} of {total}"` on each slide | needs `totalItems`, which is a count of siblings. A DOM walk in a `computed` is not a thing; a seed from each item into a root cell is, and `8f7e5f00` ("the widget-root edge receives its parts' seeds") is the landed capability that makes it possible. Unproven for a *count* rather than a flag |
| `carousel.item` inside a **flipping** `@if` arm | `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` |
| `loop` / infinite scroll | not a framework gap — a design consequence of the scroll-snap recommendation (§7) |

### A named risk: measurement-derived state

`itemsPerView` and `totalItems` are read off the DOM. On the server there is no layout, so both are
unknown at SSR time and only become right after resume. The APG's off-screen-slide warning (§4a)
means the *served* HTML must not mark slides `inert`/`hidden` on a guess — a slide wrongly hidden on
the server is content the reader never gets. **Recommendation: the server renders every slide
visible and un-inert; visibility bookkeeping starts after resume.** That is the opposite of QDS,
whose `isVisible` computed runs `setAttribute('inert')` inside a `useComputed$` guarded by
`isBrowser` — same conclusion, reached less explicitly.

---

## 8. Test plan

`packages/headless/components/src/carousel/carousel.browser.ts`, scenarios under
`src/carousel/scenarios/`. Part-role testids: `root`, `title`, `scrollarea`, `item`, `backtrigger`,
`forwardtrigger`, `navlist`, `navtrigger`, `playtrigger`, prefixed per slide in multi-slide
scenarios (`paris-item`, `paris-navtrigger`).

Scenarios, starter first, special cases last:

1. `basic.tsrx` — a title, three slides, back and forward triggers. No nav list, so slides are
   `role="group"` + `aria-roledescription="slide"`.
2. `tabbed.tsrx` — the same with a nav list. Slides become `role="tabpanel"` with **no**
   `aria-roledescription` (§4c Sequence D). Asserts the role does not flip after mount.
3. `untitled.tsrx` — no `carousel.title`. Asserts the root carries **no** `aria-label` and no
   dangling `aria-labelledby` (§2.2, §4c Sequence B).
4. `landmark.tsrx` — `landmark` on, asserting `role="region"`.
5. `gallery-autoplay.tsrx` — realistic: autoplay on, a play trigger placed first in the DOM,
   asserting (a) `aria-live="off"` while rotating, (b) focus anywhere inside stops rotation,
   (c) pointer entering stops rotation, (d) it does **not** restart on blur or pointer-leave,
   (e) the play trigger carries no `aria-pressed` and its label flips.
6. `vertical.tsrx` — `orientation="vertical"`.
7. `two-carousels.tsrx` — two on one page; a trigger in one must not move the other.
8. `slides-from-data.tsrx` — slides authored with a keyed `@for`. **Expected to be the row that
   fails first**; keep it and let it name the gap (§6e).
9. `optional-slide.tsrx` — one slide inside a flippable `@if` arm (§6e).

Mode loop CSR/SSR for the shared rows, with literal `render`/`renderSSR` call sites. Explicit
SSR+resume rows for:

- the served HTML shows **every** slide, none `inert`, none `hidden` (§7's measurement risk);
- after resume the current slide is marked and the rest are not;
- the first forward-trigger click after resume scrolls, and `onChange` fires once;
- autoplay that was declared on in the server render has not advanced anything before resume.

Scroll-position assertions need care in browser mode: assert `scrollLeft`/`scrollTop` crossing a
threshold with `expect.poll`, never an exact pixel, because smooth scrolling is time-based. The
otp note's landmine applies in spirit — *"polling the field value returned immediately and the hard
assertion raced the refresh"* — so poll the thing the gesture changes, then assert the rest.

A screen-reader lane (`carousel.sr.ts`) should carry Sequences A–F from §4c, **labelled as
derived**, since no aria-at plan backs them (§4b).

---

## 9. Open questions

1. **Scroll-snap, or a transform engine?** This is the family's defining call. **Recommended:
   scroll-snap**, because the browser then owns momentum, touch and rubber-banding; because it is
   what production React carousels ship (§5); because it matches the platform-first stance the
   overlay families already took; and because it makes §6's closure-state problem disappear. **The
   cost is that infinite `loop` is not deliverable** — QDS has it, Ark has it, Embla has it. If the
   owner wants `loop` in v1, the answer flips and the family grows by roughly the size of QDS's
   `math/` folder.
2. **`role="region"` by default, or `role="group"`?** The APG allows either; QDS hard-codes `group`;
   production code writes `region`. **Recommended: a `landmark` prop defaulting to `group`**, so a
   page with six carousels does not get six landmarks, while a page with one hero carousel can ask
   for the landmark. Named `landmark` rather than `region` because it says what it does.
3. **Keep the part name `scrollarea`, or rename to `viewport`?** `carousel.scrollarea` is QDS's
   name, but `scrollarea` is also a landed **family** in our barrel
   (`packages/headless/components/src/scroll-area/`). Legal, potentially confusing.
   **Recommended: keep `scrollarea`** — QDS-is-the-API is the standing order and namespacing makes
   it unambiguous — with one docs sentence naming the collision.
4. **How does the carousel get its accessible name?** `aria-labelledby={carousel.titleEl}` on the
   root is blocked by `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`, and unlike radio group there is
   no `fieldset`/`legend` equivalent and unlike select there is no non-root part to carry it. The
   options are: lift the root-IDREF restriction; or have `carousel.root` accept a plain
   `aria-label` string through `{...rest}` and document that a title part cannot name the root
   until the restriction lifts. **Neither is good.** This wants an owner ruling and it is a
   framework question, not a family one.
5. **Does the slide count reach the root?** `aria-label="{n} of {total}"` needs a count of sibling
   items at the root. Part-to-root seeds landed (`8f7e5f00`), but for flags, not counts. Wants a
   fixture before the API commits to the APG's position-based slide names.
