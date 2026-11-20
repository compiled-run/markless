# Styled pages at any screen size, then width `@media`

Status 2026-11-18. Branches: Markless `cw/any-width` (base `cw/dragon-bugs`), Dragon `cw/any-width` (base `cw/dragon-bugs`).
Owner position: a styled page on a phone must look as it does in that phone's browser (Safari on iOS, Chrome on Android),
at any screen size and after a rotation; decide at build time where possible.

## 1. How wrong it is today (measured)

Method. For every styled page (rung 02 and S1 to S12: 20 pages, 247 boxes) and a new fluid rung S13 (25 boxes: a centred
column with `max-width`, a flex row of two halves, a 60% bar, wrapping chips, `vw` and `vh`, a wrapping paragraph), Dragon's
export as the hosts draw it on that device (each frame is export px / export ratio, in points or dp; the hosts never read
the screen size: `ResolvedStyle.swift:278`, `StyleExport.kt`) is compared with the boxes the phone's own browser lays the
same page out at, on that device, in that device's pixels. Tool: Dragon `pnpm run markless:any-size` (new on Dragon
`cw/any-width`); per-page counts in `receipts/2026-11-18-any-width-measure/summary.json`. A box is off when any edge or size differs by more
than 1 device px (the ladder's gate). The second number per row is Dragon's own engine laid out at that device's size and
ratio at build time, against the same browser: what the phone would show if it laid the page out at its own size.

| Device (CSS px wide x browser `100vh`, ratio) | What a styled page does today | Pages | Boxes off if drawn | Worst (device px) | Dragon laid out at this size: boxes off, worst |
| --- | --- | --- | --- | --- | --- |
| iPhone 17, portrait: proof device (402 x 754, 3x) | draws the frames laid out for the proof device | 21 | 0 of 272 | 0.1 | 0 of 272, worst 0.13 |
| iPhone SE 3rd gen (375 x 589, 2x) | stops: the host refuses a screen whose ratio is not the export's | 21 | 194 of 272 | 72.9 | 0 of 272, worst 0.80 |
| iPhone 17 Pro Max (440 x 836, 3x) | draws the frames laid out for the proof device | 21 | 190 of 272 | 147.4 | 0 of 272, worst 0.13 |
| iPad (A16), portrait (820 x 1123, 2x) | stops: the host refuses a screen whose ratio is not the export's | 21 | 195 of 272 | 900.0 | 0 of 272, worst 0.80 |
| iPad (A16), landscape (1180 x 763, 2x) | stops: the host refuses a screen whose ratio is not the export's | 21 | 195 of 272 | 1556.0 | 0 of 272, worst 0.77 |
| iPhone 17 rotated to landscape (750 x 402, 3x; Safari keeps clear of the sensor housing) | draws the frames laid out for the proof device | 21 | 195 of 272 | 1245.0 | 0 of 272, worst 0.20 |
| iPhone 17 rotated back to portrait | draws the frames laid out for the proof device | 21 | 0 of 272 | 0.1 | 0 of 272, worst 0.13 |
| Pixel 7, portrait: proof device (412 x 839, 2.625x) | draws the frames laid out for the proof device | 21 | 176 of 272 | 3.0 | 0 of 272, worst 0.50 |
| Small phone, AVD `small_phone` (360 x 592, 2x) | stops: the host refuses a screen whose ratio is not the export's | 21 | 213 of 272 | 148.7 | 0 of 272, worst 0.06 |
| Pixel 9 Pro XL (448 x 921, 3x) | stops: the host refuses a screen whose ratio is not the export's | 21 | 206 of 272 | 120.4 | 0 of 272, worst 0.08 |
| Pixel Tablet, portrait (800 x 1224, 2x) | stops: the host refuses a screen whose ratio is not the export's | 21 | 213 of 272 | 880.0 | 0 of 272, worst 0.06 |
| Pixel Tablet, landscape (1280 x 744, 2x) | stops: the host refuses a screen whose ratio is not the export's | 21 | 213 of 272 | 1737.9 | 0 of 272, worst 0.06 |
| Pixel 7 rotated to landscape (863 x 360, 2.625x; Chrome keeps clear of the camera cutout) | draws the frames laid out for the proof device | 21 | 195 of 272 | 1238.0 | 0 of 272, worst 0.63 |
| Pixel 7 rotated back to portrait | draws the frames laid out for the proof device | 21 | 176 of 272 | 3.0 | 0 of 272, worst 0.50 |

On a device whose pixel ratio is not the export's (3x on iOS, 2.625x on Android), both hosts refuse the styled page today
(iOS `MarklessViewController.viewIsAppearing`, Android `MarklessHost`: "style export is for pixel ratio ..."), so the app stops
there: the iPhone SE, both iPads and four of the five Android sizes. The "boxes off if drawn" columns are what the host would
draw if it drew the proof device's frames, which it does on the iPhone 17 Pro Max and in landscape.

What is wrong, by kind of layout (S13 is 25 of the 272 boxes; the other 247 are the 20 existing pages):

- **Boxes that fill their container's width** (every block without a `width`: headings, paragraphs, buttons, panels). This is
  every page: on the 20 existing pages 165 to 188 of 247 boxes are off on every size other than the proof device, nearly all
  by width, and the error is the width difference times the ratio (iPhone SE: (402 - 375) x 2 = 54 px). Narrower screens cut
  the right edge off; wider ones leave a band. The existing rungs have no flex, no percentages, no viewport units and no
  text long enough to wrap, so S13 was added to cover them.
- **Percent widths and flex** (S13's 60% bar and its two `flex: 1` halves): off by the same proportion.
- **Wrapping text** (S13's paragraph, and five fixed-width chips with `flex-wrap`): the number of lines changes with the
  width (iPad, landscape), so heights and everything below move.
- **Viewport units:** `vw` is a width like any other. `vh` cannot match a browser: S13 was first measured with an `18vh` hero,
  and on the proof iPhone 17 itself 23 of its 25 boxes were off by up to 13 device px, because the export lays `vh` out against
  the app's page area (778 points) while Safari's `100vh` is its own large viewport (754 points, toolbars hidden). Dragon at
  the browser's `100vh` matched it (worst 0.13). S13 now pads with `vw` and has no `vh`; the table is that version. See
  section 3.
- **Text at another pixel density** (Android): on the 2x and 3x Android devices 50 to 61 of the 247 existing boxes are also
  off in height, because Chrome rounds text metrics in device pixels and the export was measured at 2.625x.
- **Android, the proof device too:** Chrome on a Pixel 7 lays pages out 412 CSS px wide, though 1080 px / 2.625 is 411.43;
  the export uses 411, so on the proof device itself 164 of the 247 existing boxes are off, by up to 3 device px (S13: 12 of
  25).
  The earlier web column forced the browser's page to 411 px, which hid this.

## 2. Why: what is decided at build time against one size

Dragon decides everything about a page at build time: the cascade, selectors, state and dark-mode variants, and how each
text is shaped in the platform's font. It then lays every assignment out once, at a fixed viewport
(`EXPORT_DEVICES`, Dragon `packages/parity/src/native-style-export.ts`: iOS 402 x 778 at 3x, Android 411 x 818 at 2.625x),
and the export carries the result: every box's frame, every text line's breaks and glyph positions, every scroll range, the
drawing operations of dashed borders. Everything that depends on the screen size is resolved there: block widths, `%`,
`vw`/`vh`, flex sizes, where lines break.

The hosts apply that geometry as given. At run time they choose the assignment (state cells, and the dark-mode band from the
system appearance), scroll, and draw; they never read the screen size, and they refuse a `width` or `orientation` media atom
by name. So a page is right only on a screen exactly 402 points or 411 dp wide.

Dragon's own native output does not work this way. Its generated apps run Dragon's layout engine (TypeScript translated to
Swift and Kotlin, `packages/layout/generated`) on the device: the compiler resolves everything it can, leaves `%`, `vw`,
`em` and the like as engine values (ruling "Native viewports", V2a), and the device lays out again whenever its root view
changes size, after choosing the width band (`rt-band`, MQ-R rulings R5 and R6, built). The Markless export path stops
before that step and ships the frames instead.

## 3. Design

Three ways to make the phone match at any size:

| | A. Lay out on the device from a build-time plan | B. Many build-time layouts, chosen by width | C. The platforms' own layout (Auto Layout, ConstraintLayout) |
| --- | --- | --- | --- |
| What is shipped | Per page: the engine input of each layout variant (resolved styles, `%`/`vw` left as engine values) and the text measurements Dragon made at build time; Dragon's engine (Swift / Kotlin) in the host | A layout per width (and height, for `vh`) | Constraints translated from CSS |
| Matches the browser | At every size (Dragon's engine at the device's size matched both browsers on every page and size in section 1) | Only at the listed sizes: a box that fills the width changes at every point, so between two listed widths it is wrong | No: CSS block, inline, flex and text rules are not what those solvers do, and Dragon would no longer place the glyphs |
| Text | Shaped at build time in the platform's font (as today) and recorded; the device breaks lines from the recording. Details below | Breaks precomputed per listed width | The platform breaks lines its own way |
| Rotation | One layout of the screen at the new size (TypeScript engine: 0.1 to 1.9 ms per page on the Mac; on the phones: measured in step 4), then the views move as for a state change | A table lookup | The platform's pass |
| App size | Engine code: iOS 2.9 MB of code and 0.4 MB of data for the whole engine before dead-stripping; Android 1.8 MB of dex before shrinking. Data per page: the plan is 14 to 66 KB of plain JSON (2 ratios recorded on iOS, 5 on Android); today's export is 10 to 57 KB per page | About a thousand layouts per page for phone and tablet widths | Small |
| Closest to "decided at build time" | Everything but geometry is decided at build time | Most, but wrong between the listed widths | Least |
| Dragon's rules | Its own ruling ("Native viewports"; MQ-R R5: a size change re-runs layout, a band change is a precompiled restyle, the device never cascades or matches) | Breaks "numbers decide" between sizes | Breaks "Dragon positions every glyph" and the Chrome proof |

**Text, in detail.** Where a line breaks depends on the width, so it is decided on the device. Everything else about text is
measured at build time, as now: the build shapes each text once in the platform's font (Core Text for iOS, HarfBuzz on the
Android system image's files) and records every answer the engine reads, and the device replays them through Dragon's
existing shape-transcript replay (`replayShaper`, translated). Two things make the recording depend on more than the text:

- **Pixel density.** Glyph positions are rounded to device pixels before lines are broken (Chrome and Safari do the same), so
  each ratio needs its own recording; across ratios a text's width moved by up to 0.045 CSS px on the pages measured. iOS
  has two ratios (2x and 3x), both recorded. Android has many (2, 2.625, 2.75, 3 and 3.5 are recorded) and its Display size
  setting makes others. **Open: a phone at an unrecorded ratio has no measurement.** Options: record more ratios (a few KB
  each per page), lay text out with the nearest recorded ratio (measured error so far up to 0.045 CSS px per text, but a line
  break can flip), or ship Dragon's HarfBuzz build (`libdragon_hb.so`) and shape on the phone with its own font, which is
  exact at any ratio and also covers text not known at build time. Until decided, the host reports such a phone by name.
- **Line edges.** Chrome shapes the first or last letters of a line again when kerning crosses the break (HarfBuzz's
  "unsafe to break"; measured with Lato on Android). Which letters depends on where lines break, so the build lays every
  variant out at every root width a phone can have from 320 to 1400 CSS px (each whole device px, and each whole CSS px)
  and records every shaping call that happens. A root outside that range can ask for one the build did not record; the
  replay then stops with a named error.

**Chosen: A.** It is the only one that matches the browser at sizes nobody listed, it is what Dragon already does for its own
native output, and the device does only arithmetic: no CSS, no selectors, no shaping.

What must happen on the device when the width changes (rotation, split view, an iPad window, a foldable): the host reads its
root view's new size (iOS `viewDidLayoutSubviews` / bounds; Android `onSizeChanged`, with the activity handling
`orientation|screenSize|smallestScreenSize|screenLayout` itself so its state survives), picks the width band (step 5),
runs the engine once for the current assignment at the new size, and applies frames, text lines, scroll ranges and border
drawing to the existing views. Screens lower in the stack lay out again before they reappear. Nothing is recompiled and no
text is reshaped.

The build-time side stays the reference. The device runs one function, `runMarklessLayout` in Dragon's translated harness
(beside its JSON reader and shape replay), which takes the plan and a size and returns every box's frame and border widths,
every text line's glyphs, dashed-border drawing and scroll ranges, in the shape the export already has. In TypeScript it
returns exactly the export's own geometry: 21 pages, both platforms, at 402 x 778 @3, 375 x 589 @2, 820 x 1123 @2,
412 x 818 @2.625, 448 x 921 @3 and 1280 x 744 @2, 0 differences in any frame, border, line, glyph, scroll range or dashed
border.

**`vh` (a decision Dragon has already made):** `vh`, `vw` and the `sv*`/`lv*`/`dv*` units equal the app's root view
(Dragon ruling "Native viewports", 2026-09-28). A browser's `100vh` is its own large viewport, which an app does not have
(Safari on an iPhone 17: 754 points; the app's page area: 778). So a page using `vh` matches the browser's layout at the
browser's `100vh`, which is what the comparison checks (it lays Dragon out at the height the browser reports for `100vh`),
and on the phone fills the app's own screen area, as the ruling says.

Costs, roughly (S a day, M a few days, L a week): the plan in the export and one translated entry point that turns a plan
and a size into the geometry the hosts already apply (M, Dragon); iOS host lays out on size change (M); Android host the
same (M); re-proving every styled rung at the sizes above and after a rotation (M). Width `@media` after that: the hosts
evaluate `width`, `height`, `orientation` and `aspect-ratio` atoms with Dragon's `rt-band` on the root view's size (S to M).

## 4. Built: the phone lays the page out at its own size

- **Dragon** (`cw/any-width`, draft compiled-run/dragoncss#597): `markless:style-export --plan` adds the plan to each target;
  `runMarklessLayout` in the translated harness lays it out (section 3). A node a style state hides (a band's
  `display: none`) is exported with no frame there instead of refusing the page.
- **Markless harness:** page exports ask for the plan; the iOS shell compiles Dragon's translated engine (`DragonLayout`) and
  harness with a one-function glue (`DragonPlan`, `src/adapters/ios/DragonPlan/`) from the Dragon checkout; the shell
  supports iPad and landscape. `--layout-check portrait,landscape,portrait` opens each styled page with the host's layout
  dump on, compares every box the phone drew with the phone's own browser at the same width (Dragon
  `markless:native-check`), then rotates the running app (same process, checked) and compares again.
  `--host-tests-simulator` keeps the host's own tests, whose style fixtures are laid out at 3x, on an iPhone 17.
- **iOS host:** with a plan, `MarklessViewController` lays the page out for its safe area at the screen's scale on first
  layout and on every size change (rotation, window resize), re-lays every assignment through `StyleExport.laidOut`, and
  moves the existing views (`ViewTree.relayout`). Without a plan nothing changes, including the refusal of a screen whose
  scale is not the export's (today a styled page stops on a 2x iPhone or iPad with that refusal).
- **Android host:** the same. `MarklessHost.layOutAt` lays the page out at `ceil(width px / density)` CSS px wide (Chrome's
  layout width: 412 on a 1080 px Pixel 7) when its container's size changes; the activity keeps handling rotation itself, so
  state survives. Dragon's translated engine and harness are compiled into the proof APK and reached by name
  (`dev.dragon.layout.HarnessKt`), so the host and its JVM tests still build without Dragon. The layout dump goes to the
  app's external files folder.

Results, every styled page's starting assignment, phone against its own browser (boxes off by more than 1 device px / boxes
compared, worst device px), after the flow passed on that device:

| Device | Rungs (flows passed) | Page checks: portrait, rotated to landscape, rotated back | Boxes off | Worst (device px) |
| --- | --- | --- | --- | --- |
| iPhone SE (2x) | 15 of 15 | 66 | 0 | 0.80 |
| iPhone 17 Pro Max (3x) | 15 of 15 | 66 | 0 | 0.16 |
| iPad (A16) (2x) | 15 of 15 | 66 | 0 | 0.80 |
| iPhone 17 (3x) | 15 of 15 | 66 | 0 | 0.20 |
| Small Android phone (2x) | 15 of 15 | 66 | 0 | 0.81 |
| Pixel 7 (2.625x) | 15 of 15 | 66 | 0 | 0.91 |
| Pixel 9 Pro XL (3x) | 15 of 15 | 66 | 0 | 0.91 |
| Pixel Tablet (2x; "portrait" is 800 wide) | 15 of 15 | 66 | 0 | 0.48 |

Rungs: 02, S1 to S14; 22 styled pages. Each check compares one page's starting assignment; the other assignments (taps, dark
mode) are covered by the flows and by Dragon's test that the device function equals the export's geometry for every
assignment. Not measured yet: layout time on rotation on the phones (the dump now records it), and a real device.

## 5. Width `@media`

The hosts look a band up with Dragon's own translated lookup (`rt-band`, Chrome's media evaluation: `>=` and `<=` with 1/64 px
of slack, orientation from the truncated size) on the page area in device px, with a phone's readings (coarse pointer, no
hover). On a size change the host lays every assignment out at the new size, then moves to the new band's assignment, as a
state change, so no frame shows the old band at the new size. Rung S14 (`proofs/s14-width-media/`): cards in a column that
become a row from `min-width: 600px`, a `max-width: 399px` padding, a `(400px <= width < 700px)` note and a paragraph shown
only in `(orientation: landscape)`; ten bands.

S14's band, picked by the phone, in portrait then landscape (and back to the portrait band after the second rotation), every
box matching the phone's browser (worst 0.67 device px):

| Device | Portrait: width, band | Landscape: width, band |
| --- | --- | --- |
| iPhone SE | 375, 1 (max-width 399) | 667, 6 (min-width 600, 400 to 699, landscape) |
| iPhone 17 / Pro Max | 402 / 440, 5 (400 to 699) | 750 / 832, 8 (min-width 600, landscape) |
| iPad | 820, 9 (min-width 600) | 1180, 8 |
| Small Android | 360, 1 | 640, 6 |
| Pixel 7 / Pixel 9 Pro XL | 412 / 448, 5 | 863 / 945, 8 |
| Pixel Tablet | 800, 9 | 1280, 8 |

Known gap: a `height` or `aspect-ratio` query reads the app's page area, which is not the browser's (small Android phone: 536
against Chrome's 592), so such a page can pick a different band than the browser near a threshold; S14 queries width and
orientation only.
