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

Results: section 7.

## 6. What Dragon could not express

Filled in from the runs; see section 7.

## 7. Receipts

Filled in from the runs.
