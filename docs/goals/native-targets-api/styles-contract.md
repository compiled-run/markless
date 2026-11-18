# Native styles for an app of several pages (the contract)

Owner: native-app-styles (branch `cw/native-app-styles`, base `cw/native-nav`; Dragon branch `cw/native-app-styles`, base
`cw/native-dragon-styles`). Read `contract.md` (styles, rung 2) and `nav-contract.md` first; this file adds styles to an app
of several pages and changes nothing for a styled payload of one page. Status 2026-11-17.

## The rule in one paragraph

Dragon handles the CSS. A page's styles are what the web ships for it: the stylesheets the app's document and the page
import, then the scoped CSS of every component the page shows (the components it imports first, then its own). Markless
hands Dragon one style input per styled page; Dragon compiles each page in its own document and returns per-device,
per-state node data, as for one-screen rungs. Markless joins the per-page exports into one style file for the app, in
which every distinct list of style writes is stored once and nodes name it by index, so a component styled alike on
several pages carries its look once. Frames stay per page: Dragon lays a component out where it sits.

## 1. What a page's styles are (compiler facts only)

- **Scoped CSS of every shown component.** `compileNativeComponent` already inlines an imported component's nodes into the
  page payload, and those nodes already carry the component's own scope class (`tag mk-…`). It now also compiles each
  imported module and takes its `publicRenderPlan.styleScopes`, so the CSS that matches those classes reaches Dragon.
  Before this, an imported component's CSS was dropped while its scope class was stamped: its look silently vanished.
- **Stylesheets imported for their effect** (`import './styles/app.css'`), from the compiler's
  `publicRenderPlan.stylesheetImports` of the page, of each module it imports, and of the app's `document.tsrx`
  (`compileNativeApp({ document })`). The caller reads the file (`readStylesheet`); the text goes to Dragon unscoped, as
  the web ships it. Order in the input: stylesheets, then imported components' scoped CSS, then the page's.
- **`:root` custom properties** in a stylesheet reach every page through Dragon's own cascade (`var(--ink)` resolves at
  build time). A scoped `<style>` cannot hold `:root` or `:global` (the compiler scopes them to `.mk-…:root`), so tokens
  live in a stylesheet, as they do on the web.
- **State hooks.** A cell read by a `class` binding or by a `ui-*` attribute binding is `styled`
  (`nativeStyleAttribute`, `@markless/serializer/native-view`). The style input gives such an attribute's value in every
  combination of the styled cells (`attributesByState`), computed with the web's own attribute rule
  (`marklessAttributeValue`), so `[ui-active]` selects on the phone exactly when it does in the browser.
- **Links.** A `<Link>` lowers to an `a` with the attributes the router renders: `href`, and `class` when fixed. With
  `href`, Dragon sees a hyperlink as Chrome does (`:any-link`, the user-agent underline). Before this the anchor had no
  `href`, so Dragon styled it as plain text while the web showed a blue underlined link.

## 2. The handoff per page

Unchanged in shape: `markless.native-style-input/0` per styled page, Dragon's `markless:style-export` per input,
`dragon.native-style-export/1` back. Additions, all on the Dragon branch `cw/native-app-styles`:

- **`attributesByState`** on an element: `{ "<name>": [{ when, value | null }] }`, one entry per combination of the
  states, as `classByState` is. Dragon turns each value into a `Choice` over the states.
- **Ids.** Markless names a component's nodes by their path (`component-edge:0/h0`); Dragon's tree accepts no `/` or `:`.
  Dragon's reader gives such an element its own id inside the compile and renames every export node back to the input's
  ids (text nodes as `<element>:text<k>`), so the export still uses Markless's ids unchanged.
- **`@media` bands.** Dragon's compiler already split a sheet with `@media` into bands and lowered every band; its
  entry point refused to emit them. It now emits the band program: one more state, `@env#band` (domain `0..n-1`), whose
  assignments hold each band's styles, and per target a `bands` table: `atoms` (each media feature the host evaluates:
  `{ feature, comparisons, keyword }`), `bands` (per band, the truth value of every atom) and `conditions` (the media
  text, for people). A band change is a step in `next` like a cell change.

## 3. The app style file: `markless.native-app-style/0`

Written by `nativeAppStyle()` (`packages/mobile/src/app-style.ts`) from the per-page exports; shipped beside the app
payload (`markless/style.json` in the proof shells).

```json
{
	"version": "markless.native-app-style/0",
	"units": "<as Dragon's export>",
	"warnings": [{ "pattern": "/", "code": "…", "message": "…" }],
	"fonts": [{ "id": "sha256:…", "file": "vendor/fonts/…" }],
	"targets": {
		"ios": {
			"backend": "uikit",
			"viewport": { "width": 402, "height": 778 },
			"dpr": 3,
			"writes": [
				[{ "kind": "background-color", "key": "backgroundColor", "color": { "…": 0 } }],
				["…"]
			],
			"routes": [
				{
					"pattern": "/settings",
					"component": "Settings",
					"compiler": "<digest>",
					"readiness": { "kind": "analysis-only", "reason": "…" },
					"states": [
						{ "key": "state:on", "domain": [false, true] },
						{ "key": "@env#band", "domain": [0, 1] }
					],
					"initial": 0,
					"next": [
						[
							[0, 1],
							[0, 2]
						],
						"…"
					],
					"bands": {
						"atoms": [
							{
								"feature": "prefers-color-scheme",
								"comparisons": [],
								"keyword": "dark"
							}
						],
						"bands": [[false], [true]],
						"conditions": ["…"]
					},
					"assignments": [
						{
							"values": { "state:on": false, "@env#band": 0 },
							"canvas": { "r": 255, "g": 255, "b": 255, "alpha": 255 },
							"nodes": [
								{
									"id": "h0",
									"parent": "body",
									"kind": "element",
									"native": "DragonBoxView",
									"text": null,
									"frame": { "…": 0 },
									"borderWidths": { "…": 0 },
									"writes": 3
								}
							]
						}
					]
				}
			]
		},
		"android": { "…": "the same, in the android-views vocabulary" }
	}
}
```

- Every page's export must agree on schema, units, targets and, per target, backend, viewport and dpr; otherwise the build
  fails naming the page.
- A route absent from `routes` has no styles (its screen is laid out as an unstyled page is).
- Every assignment has `canvas`: the colour Chrome paints behind the page (css-backgrounds-3 §2.11.2: `html`'s
  background, else `body`'s, else white), from Dragon's export of that assignment, so a dark band has its own. A page
  export without it is refused by name; a `body` background under an `html` background, and a translucent canvas, are
  refused by Dragon (the hosts draw no `html` or `body` box).
- A node's `writes` is an index into its target's `writes`. Expanding every index gives back Dragon's per-page export
  exactly; a host may decode a route into the per-page `StyleExport` it already applies.

## 4. What the host does

- Decode the app style beside the app payload; give each screen its route's styles (none when the route has none).
- **Cells:** as for one page, a `state` journal entry for a styled cell moves to `next[a][s][v]`.
- **Bands:** evaluate every atom on the device and pick the band whose truth vector matches. `prefers-color-scheme` reads
  the system appearance (iOS `traitCollection.userInterfaceStyle`, Android `Configuration.uiMode` night bits); the keyword
  `any` holds always. An atom of any other feature is a host error (not built; see section 6). The starting assignment
  matches the cells' values at mount and the band of the appearance at mount.
- **Canvas:** the screen behind the page is the current assignment's `canvas`, repainted when the assignment changes; it
  reaches under the status bar and the navigation or action bar, as the page background does in a browser. iOS: the
  controller's view. Android: the full-screen container the page sits in (its padding keeps the page clear of the bars).
  An unstyled screen keeps the system background.
- **System bars:** iOS's navigation bar follows the appearance. Android's activity uses the system's own day-night theme
  (`Theme.DeviceDefault.DayNight`); because it handles `uiMode` itself, it reads the bar's colours from the new
  configuration's theme and sets them by hand (bar background, title, Up arrow, light or dark status and navigation bar
  icons).
- **Appearance changes:** every screen on the stack follows the appearance, including screens below the top. iOS: each
  `MarklessViewController` registers for `UITraitUserInterfaceStyle` changes and re-evaluates the band whenever its
  traits change (UIKit updates a covered controller's traits before it appears again). Android: the activity declares
  `uiMode` among the configuration changes it handles itself, so a theme change does not rebuild it (which would lose its
  state), and re-evaluates the band in `onConfigurationChanged`, which a stopped activity receives before it resumes.

## 5. Ladder (style rungs)

Folders `packages/mobile/proofs/s<n>-<name>/`, each an app (`document.tsrx`, `styles/`, `pages/`, optional `lib/`),
`expected.json`, `flow.yaml`, screenshots. Columns as in `contract.md` section 5; the web column also saves a screenshot
per step at each phone's CSS size and ratio (`screenshots/web-{ios,android}/`), the reference for the phone screenshots.
New ladder action: `{ "appearance": "dark" | "light" }` (Maestro `setDarkMode`; the web emulates `prefers-color-scheme`).
It changes only how the screen looks, so no text witnesses it; the screenshots do.

| #   | Rung                                                                                                                                                  | Web                                                                              | Native reference | iOS         | Android     | Dragon frames vs Chrome                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------- | ----------- | ----------- | -------------------------------------------------------------------------------------- |
| S1  | Two pages, each with its own scoped styles                                                                                                            | passing                                                                          | passing          | **passing** | **passing** | 32 boxes, none outside 1 device px                                                     |
| S2  | A component with scoped styles (`lib/Tag.tsrx`) used on both pages, three times                                                                       | passing                                                                          | passing          | **passing** | **passing** | 36 boxes, none outside 1 device px                                                     |
| S3  | A class and a `ui-*` attribute that follow a cell; a dark-mode variant on a pushed screen, switched while it is in the back stack, then back to light | passing, with Back measured as different (the page's state starts over, `onWeb`) | passing          | **passing** | **passing** | 122 boxes over every assignment (light and dark, on and off), none outside 1 device px |
| S4  | A stylesheet imported by the document: `:root` tokens, element and class rules shared by both pages                                                   | passing                                                                          | passing          | **passing** | **passing** | 36 boxes, none outside 1 device px                                                     |
| S5  | A page background on `body` with a dark-mode variant: it fills the screen under the bars on a pushed screen and on the one below it                   | passing                                                                          | passing          | **passing** | **passing** | 56 boxes over both pages, light and dark, none outside 1 device px                     |

How each column is judged. The texts and titles of every step are checked by Maestro on the phones and by Playwright on
the web (numbers decide pass or fail). Dragon's frames are compared with Chrome's boxes by Dragon's
`markless:style-compare` per assignment, with the `ui-*` attributes and the band's colour scheme applied; reports in
`proofs/s<n>-*/native-style-compare/<page>.json`. The phone screenshots
(`screenshots/{ios,android}/`) and the web screenshots at each phone's CSS size and ratio (`screenshots/web-{ios,android}/`,
written by the web column with `MARKLESS_LADDER_SCREENSHOTS=1`) were read side by side. That reading is evidence, not a
gate. It shows the same colours, borders, radii and layout. The one visible difference is the typeface: Dragon draws
`sans-serif` as its pinned Inter, while the browser uses the system face (an open owner decision since rung 2). The
system bars are the platform's: iOS's navigation bar follows dark mode; since S5 Android's action bar does too (before it, it stayed light, its theme
fixed light). Since S5 the page background reaches the screen: before it a styled iOS page sat on white and an Android
one on the light theme's window grey (#FAFAFA), whatever `body` said.

### Payload (S2: style data carried once)

Bytes of compact JSON. "Per page" is Dragon's export for each page; "app" is the one file the app ships.

| Rung | Per page                                       | Per-page total | App file | Write lists stored / node references (iOS) |
| ---- | ---------------------------------------------- | -------------- | -------- | ------------------------------------------ |
| S1   | `/` 12,723; `/care` 9,818                      | 22,541         | 19,540   | 13 / 16                                    |
| S2   | `/` 16,406; `/basil` 10,328                    | 26,734         | 19,719   | 11 / 18                                    |
| S3   | `/` 10,390; `/help` 14,042; `/settings` 57,332 | 81,764         | 53,446   | 28 / 61                                    |
| S4   | `/` 12,649; `/team` 13,175                     | 25,824         | 17,815   | 9 / 18                                     |

S2's Tag appears three times (twice on the shelf, once on the basil page), six nodes (its box and its text) in all. All
six name the same two write lists: 1,024 bytes carried for iOS instead of 3,072, and 1,041 for Android instead of 3,123.
The frames of those six nodes are still stored per page, because Dragon lays a component out where it sits; that is
layout, not the component's look. Sizes per run: `proofs/s<n>-*/style-size.json`.

## 6. What Dragon could not express, and what was done

- **Pressed (`:active`).** Dragon refuses it for a Markless page: on a rounded button,
  `DRAGON_UNSUPPORTED_SELECTOR [ios] :active needs Dragon hit testing through border-top-left-radius on h2, which is not
  built yet (package SELD-R2b)`, and in general its native entry point emits no interaction tables yet ("the output has
  interaction states (:hover, :active, :focus), which this entry point does not emit yet"). Not built here; the build
  refuses the page with Dragon's reason, so no pressed style is silently dropped.
- **Disabled (`:disabled`, or the `disabled` attribute on a `<button>`).** Dragon refuses both
  (`DRAGON_UNSUPPORTED_SELECTOR`, `DRAGON_UNSUPPORTED_ATTRIBUTE`: Chrome's user-agent styles for it are not modelled) and
  names its own fix, a state selected by a `ui-*` attribute. That path is what S3 proves (`.status[ui-active]`); a
  disabled look is the same mechanism (`[ui-disabled]`). One-screen rung 4 binds `disabled` on a button; the native style
  input still passes only `ui-*` bound attributes, so that button's disabled look (Chrome's grey text) is not on the
  phone, as before this branch.
- **`@media` bands.** Dragon could compile them but its entry point refused to emit them; changed on the Dragon branch
  (section 2). The hosts read `prefers-color-scheme` only; a `width`, `orientation` or other atom is refused by the
  host by name (a size-class variant would need the on-device layout engine, since the export's frames are laid out for
  one device size).
- **Ids holding `/` or `:`.** Dragon's tree refused every component node of a page; renamed inside the compile on the
  Dragon branch (section 2).
- **A link's default look.** With its `href`, a link is underlined by Chrome's user-agent sheet, and Dragon refuses that
  underline on both targets (`DRAGON_UNSUPPORTED_VALUE ... text-decoration (underline ...) that ios does not draw`).
  The rungs style their links with `text-decoration: none`; an unstyled `<Link>` in a styled page is refused by name.
- **`html`/`body` backgrounds.** Closed by S5 (section 6b): Dragon's export gives each assignment its canvas colour and the
  hosts paint it behind the page and the bars.

Dashed and dotted borders (rung u17, branch `cw/dragon-bugs`): Dragon's export now carries, for each box with a visible dashed or dotted side, the drawing operations its own native paint runs (`borderOps`, its port of Blink 145's side painter, every crisp border pixel equal to Chrome's at both proof devices); both hosts draw those operations as they come (iOS a `CALayer`, Android a `Drawable`) and refuse an unknown one by name. A rounded box with a dashed or dotted side stays refused by Dragon's compile (`rounded dashed borders are PNT1b`).

Host gaps found and closed on the way (both platforms): solid border sides that differ (`border-left: 6px solid`) were
refused ("only four solid sides"); now drawn as one rectangle per side on square boxes (rounded boxes with differing
sides stay refused). On iOS 26 and later a styled page's root reaches the screen edge, and its keyboard-dismiss pan took
the content swipe-back from UIKit; it now waits for both back gestures to fail.

## 6b. The style gaps a styled app still hit (branch `cw/native-style-gaps`)

Status 2026-11-17. Each gap with what Dragon needed, what the hosts needed, and what is still refused, by name. "Refused"
means the build stops naming Dragon's reason; nothing is dropped silently.

| Gap                                                 | Web     | iOS         | Android     | Where it stands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G5 page background on `body` or `html`              | passing | **passing** | **passing** | **Built** (rung S5). Dragon: `canvas` per assignment in the Markless export, from its own `html`/`body` background writes. Hosts: paint it behind the page and under the bars, per assignment, so it follows the dark band on every screen of the stack; Android's action bar and bar icons follow the appearance. Still refused: a `body` background under an `html` one, a translucent canvas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| G1 pressed (`:active`) on a button and a link       | passing | refused     | refused     | **Not built: needs a decision.** Measured through `markless:style-export` on S5's page with one rule added: on a `<button>`, `:active needs Dragon hit testing through the form control h9, which is not built yet (FORM-a)`; with any rounded box on the page, even one the rule does not select, `:active needs Dragon hit testing through border-top-left-radius on …, which is not built yet (package SELD-R2b)`; on a square link, block or inline, the compile passes and the entry point stops with `the output has interaction states (:hover, :active, :focus), which this entry point does not emit yet`. Past those, Dragon's rulings make the hit test and the interaction runtime its own translated code on the device (decisions "Hit testing", R12 to R14); the Markless hosts run no Dragon code, only the JSON export, so there is nothing for a touch to look up. |
| G3 `:focus-visible` on an input                     | passing | refused     | refused     | **Not built.** `<input> h9 of type text is not supported: only type=range is laid out; other inputs wait for the FORM-b package`, and its user-agent `border-style: inset` has no fixture; focus needs the same on-device interaction runtime as G1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| G2 `:disabled` and the `disabled` attribute         | passing | refused     | refused     | **Not built: needs a Dragon ruling.** `:disabled` is refused with no package named ("a later package models as runtime state"); the `disabled` attribute is refused because Chrome's user-agent styles for it are not captured (no `button[disabled]` row in Dragon's UA data). An unstyled `<button>` is refused on its own (`appearance: auto and no author background or border is painted by the platform theme …, which waits for the FORM-b package`), and a styled one needs `font-family: inherit`, since Chrome's control font (Arial) is not pinned. The working path stays Dragon's own fix: a `ui-disabled` attribute bound to a cell, styled by the author (S3's mechanism).                                                                                                                                                                                            |
| G4 system font for `sans-serif`, `system-ui`, unset | passing | not changed | not changed | **Not built: conflicts with Dragon rulings.** Dragon lays out and positions every glyph from the bundled font file's own tables at build time ("Pinned generic fonts", "Native glyph advances", "Dragon positions every glyph"); San Francisco cannot be bundled, and a host drawing the system face inside frames laid out for Inter would clip or misplace text. Today `font-family: system-ui` is refused on both targets (`has no layout mapping`); phones draw `sans-serif` as Inter.                                                                                                                                                                                                                                                                                                                                                                                           |
| G6 an unstyled link reads as a link                 | passing | refused     | refused     | **Partly.** Chrome's link colour (`rgb(0, 0, 238)`) reaches the phone when the author removes the underline (`text-decoration: none`, as S1 to S5 do). The default underline is refused: with a real face Dragon needs skip-ink (TDEC-d covers Ahem only) and draws no decoration inside a state program (TDEC-b). So the unstyled default is refused, not approximated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| G7 a width `@media` variant, portrait and landscape | passing | refused     | refused     | **Not built: needs a decision.** The export's frames are laid out for one device size; Dragon's ruling resolves size-dependent values with its layout engine on the device ("Native viewports"), which the hosts do not run. The hosts refuse a `width` or `orientation` atom by name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

G1, G3 and G7 hinge on one question: whether the Markless hosts carry Dragon's generated on-device code (its layout engine,
hit test and interaction runtime) rather than only the JSON export.

## 6c. Dragon fixes for the gaps above (branch `cw/dragon-bugs`, Dragon `cw/dragon-bugs`)

Status 2026-11-18. Owner direction: bugs Dragon has are fixed in Dragon. Base: this branch starts at `cw/native-integration`
(`4af2ffeb8`), the one tree holding both the style rungs and the `@markless/ui` rungs; Dragon's branch merges
`cw/native-style-gaps`, `cw/sheet-styled-content` and `cw/native-ui`. Every row's Dragon check compares with Chrome 145 by
numbers; "iOS" and "Android" are the rung's flow on the simulator and emulator, with screenshots read beside Chrome's
rendering of the same assignment (`screenshots/chrome*/`, from Dragon's `markless:style-compare --screenshots`).

| Item                                                                                                                                                                                                 | Dragon (check against Chrome)                                                                                                                                                                                           | Rung                                                                                                   | iOS     | Android                                                                        | Still refused                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| States that are strings (tabs' selected value)                                                                                                                                                       | `markless-string-states.test.ts`: one assignment per value, every box within 1 device px                                                                                                                                | u15                                                                                                    | passing | passing                                                                        | a string cell whose values are not all known at build time (stays unstyled, as before)                                                                                                                      |
| A text that follows such a state                                                                                                                                                                     | same test: each string laid out where it shows                                                                                                                                                                          | u15, u20                                                                                               | passing | passing                                                                        | text over an unbounded value (`Sent {count}`) keeps its first string's frame                                                                                                                                |
| `body` background under `html`'s; see-through page background                                                                                                                                        | `markless-root-paint.test.ts`: canvas and body box equal Chrome's screenshot pixels                                                                                                                                     | S6                                                                                                     | passing | passing                                                                        | a see-through page background in a dark band (Chrome's dark base, below); a border or other paint on `html`/`body`                                                                                          |
| `:disabled`, the `disabled` attribute                                                                                                                                                                | `markless-disabled.test.ts`: text and border colours equal Chrome's computed values, boxes within 1 device px; Chrome's `button[disabled]` UA row captured                                                              | u20                                                                                                    | passing | passing                                                                        | a button with no author background or border (platform theme, FORM-b), inline-level controls (RF-INL), the UA control font Arial                                                                            |
| Anchor positioning (`anchor-name`, `anchor-scope`, `position-anchor`, `position-area`, `anchor()`, `anchor-size()`, `anchor-center`, `position-try-fallbacks` flips and areas, `position-try-order`) | Engine feature in Dragon's layout engine, translated to Swift and Kotlin (1,240 vectors reproduced); 10 `anchor-*` parity fixtures with 0 boxes off, ltr and rtl; WPT css-anchor-position: 10 of 10 runnable files pass | u19 (an authored page: popover and tooltip are refused by Markless's native compiler for their events) | passing | passing                                                                        | `@position-try` rules, `position-anchor: auto`, `position-visibility`, inline anchors, `anchor-size()` in margins and insets, non-px fallbacks, vertical writing modes, scroll-offset shifts, the top layer |
| Positioned boxes' paint order                                                                                                                                                                        | Both hosts order a positioned or z-index box among its siblings by Dragon's paint-order bucket and rank (iOS layer `zPosition`, Android child drawing order, which touches follow)                                      | u19, u18                                                                                               | passing | passing                                                                        | a box whose stacking context is an ancestor past a box with later siblings or a clip; on iOS touches still follow tree order                                                                                |
| Dashed and dotted borders                                                                                                                                                                            | `markless-dashed-borders.test.ts`: every crisp border-band pixel equals Chrome's at both phones' ratios                                                                                                                 | u17                                                                                                    | passing | passing (the Tap button's label is cut to "Ta", a host text-fit defect, below) | rounded dashed or dotted borders (PNT1b)                                                                                                                                                                    |
| `<dialog>` and `::backdrop`                                                                                                                                                                          | `top-layer-dialog.test.ts`: dialog and contents within 1 device px after `showModal()`, backdrop in Chrome's colour                                                                                                     | none                                                                                                   | not run | not run                                                                        | every Markless dialog: Chrome forces `overflow: auto` on a modal dialog, and the export has no scroll containers until `cw/native-scroll` is integrated; `:modal`, `[popover]`                              |
| The default link underline                                                                                                                                                                           | groundwork only (Dragon `cw/dragon-bugs-underline`, not merged): Skia's glyph intercepts ported, 47 of 55,694 underline pixels still differ from Chrome                                                                 | none                                                                                                   | not run | not run                                                                        | `skip-ink-intercepts` on every real face; and Dragon's state runtime draws no decoration at all (TDEC-b)                                                                                                    |

Receipt: one harness run per platform on this branch at `446b88bfe` (simulator `markless-dragon-bugs`, iPhone 17 on iOS 27.2;
AVD `markless_dragon_bugs`, Pixel 7, API 36; Dragon `cw/dragon-bugs` at `9dbb4b7dc4`): S1 to S6 and every `u` rung (u1 to u6,
u11 to u15, u17, u18, u20), 20 of 20 on each, "proof passed on iOS and Android" (`receipts/2026-11-18-dragon-bugs-*`). The
u18 rung (`base.visuallyhidden`, the inline `style` attribute) shows the text hidden on both phones, as in Chrome.

Found on the way:

- **Android button labels.** The u17 "Tap" button draws "Ta" on Android: Dragon gives the label 82.5 device px, the host's
  `Button` gets 83, and Android measures the word a hair wider and wraps the last letter out of view. Not fixed here.
- **The dark-mode page base.** Chrome 145 under an emulated dark preference paints a page with no background over
  rgb(18, 18, 18), whatever its `color-scheme`; the hosts paint white there (S5's decision). Open for the owner; see
  `deferred-styles.md`.
- Pressed, `:focus-visible`, width `@media` and the system font are not built; what each would take is in
  `deferred-styles.md`.

## 7. Receipts

One harness run per platform on tree `4c090f387` (mini-2; simulator `markless-app-styles`, iPhone 17 on iOS 27.2; AVD
`markless_app_styles`, Pixel 7, API 36), Dragon from `~/wt/dragon/native-app-styles` at `b4828af7fa`: the four style rungs
plus the eighteen earlier rungs (1, 2, 3, 4, 5, 5b, 6, 7, 7b, 7c, 7d, 8, 9, 10, N1 to N4), 22 of 22 on each, verdict
"proof passed on iOS and Android". Reports: `receipts/2026-11-17-app-styles-*.json` and `-verdict.txt`. Before that run,
two Android attempts lost the emulator (`device offline` at launch, machine load near 20); those are device failures,
re-run, not retried inside the harness. Devices were shut down after the run.

What is real and what is a stand-in: the compiler, Dragon, the web build in Chromium, the simulator and emulator with the
real hosts are real; the appearance switch is the system's own (Maestro `setDarkMode`). The reference column is the
TypeScript runtime with a mirror host; it checks texts and the stack, not styles.

### `cw/native-style-gaps` (2026-11-17)

One harness run per platform on tree `cfa1720fe` (mini-2; simulator `markless-style-gaps`, iPhone 17 on iOS 27.2; AVD
`markless_style_gaps`, Pixel 7, API 36), Dragon from `~/wt/dragon/native-style-gaps` at `bf6efc34ca`: S1 to S5 and the
eighteen earlier rungs, 23 of 23 on each, verdict "proof passed on iOS and Android" (`receipts/2026-11-17-style-gaps-*`).
Read side by side, that run's iOS screenshots after `appearance` steps were light: the reused simulator ignored the
switch (even Settings stayed light while `simctl ui appearance` read dark), and no check in the flow witnesses an
appearance. After a reboot of that simulator the switch took, and S3 and S5 were run again, 2 of 2 on each
(`receipts/2026-11-17-style-gaps-appearance-*`); their screenshots show the dark canvas under the bars on Notes and, after
Back, on the Garden screen it covered, and Android's dark action bar with light icons. The screenshot taken right after a
switch on iOS catches the system's cross-fade (as in the earlier S3 receipt). Dragon's frames for S5 against Chrome: 56
boxes, none outside 1 device px. Devices were shut down after the runs.
