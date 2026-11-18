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
- A node's `writes` is an index into its target's `writes`. Expanding every index gives back Dragon's per-page export
  exactly; a host may decode a route into the per-page `StyleExport` it already applies.

## 4. What the host does

- Decode the app style beside the app payload; give each screen its route's styles (none when the route has none).
- **Cells:** as for one page, a `state` journal entry for a styled cell moves to `next[a][s][v]`.
- **Bands:** evaluate every atom on the device and pick the band whose truth vector matches. `prefers-color-scheme` reads
  the system appearance (iOS `traitCollection.userInterfaceStyle`, Android `Configuration.uiMode` night bits); the keyword
  `any` holds always. An atom of any other feature is a host error (not built; see section 6). The starting assignment
  matches the cells' values at mount and the band of the appearance at mount.
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

How each column is judged. The texts and titles of every step are checked by Maestro on the phones and by Playwright on
the web (numbers decide pass or fail). Dragon's frames are compared with Chrome's boxes by Dragon's
`markless:style-compare` per assignment, with the `ui-*` attributes and the band's colour scheme applied; reports in
`proofs/s<n>-*/native-style-compare/<page>.json`. The phone screenshots
(`screenshots/{ios,android}/`) and the web screenshots at each phone's CSS size and ratio (`screenshots/web-{ios,android}/`,
written by the web column with `MARKLESS_LADDER_SCREENSHOTS=1`) were read side by side. That reading is evidence, not a
gate. It shows the same colours, borders, radii and layout. The one visible difference is the typeface: Dragon draws
`sans-serif` as its pinned Inter, while the browser uses the system face (an open owner decision since rung 2). The
system bars are the platform's: iOS's navigation bar follows dark mode, Android's action bar stays light (its theme is
fixed light).

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
- **`html`/`body` backgrounds.** Dragon lays out its own `html` and `body`; the hosts paint only payload nodes, so a
  background set on `body` would not reach the phone. Not used by the rungs; a styled iOS page sits on a white canvas, as
  the web document does in either colour scheme.

Host gaps found and closed on the way (both platforms): solid border sides that differ (`border-left: 6px solid`) were
refused ("only four solid sides"); now drawn as one rectangle per side on square boxes (rounded boxes with differing
sides stay refused). On iOS 26 and later a styled page's root reaches the screen edge, and its keyboard-dismiss pan took
the content swipe-back from UIKit; it now waits for both back gestures to fail.

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
