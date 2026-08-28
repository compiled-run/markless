# toolbar registration

`toolbar` is now registered everywhere `crop` is registered outside its own
folder. Nothing in `src/toolbar/**` changed except the two files named below.

## Sites

| Site | Change |
| --- | --- |
| `src/index.ts` | `export * as toolbar from './toolbar/index.ts'` |
| `package.json` | `"./toolbar": "./src/toolbar/index.ts"` |
| `test-support/conformance.browser.ts` | descriptor, CSR + SSR, over `scenarios/basic.tsrx` |
| `api/manifest.json` | re-extracted; `api:check` 3/3 |
| `apps/sr-gallery/preview-server.ts` | `FAMILY_ANCHORS.toolbar = '/#toolbar'` |
| `apps/sr-gallery/src/Gallery.tsrx` | `#toolbar` section, the `mixed` shape |
| `apps/sr-gallery/scripts/boot-check.ts` | `RENDERED_ROLE.toolbar = 'toolbar'` plus three rows |
| `src/toolbar/toolbar-transcript.ts` | `TOOLBAR_ANCHOR` reads `FAMILY_ANCHORS.toolbar` |
| `.github/workflows/screen-reader.yml` | `toolbar` added to the virtual, NVDA and VoiceOver matrices |
| `src/toolbar/note.md` | the "not exported, spells its own anchor" follow-up is closed |

## The conformance descriptor

`rootAria: { role: 'toolbar', 'aria-orientation': 'horizontal' }`. The root's
`...rest` passes straight through to the private bar part, so a `data-testid` on
`toolbar.root` lands on the element carrying `role="toolbar"` and the battery's
`root` part and its aria contract are the same element.

No `openCycle`, and this is the family's whole point rather than a gap: a toolbar
opens nothing of its own. It groups controls that keep their own roles and
collapses their tab stops into one, so the battery's click-a-trigger cycle has no
part of this family's to click. `supportsDisabled: true`, `valuedAttributes: []`.

Battery green: 474 rows, 0 red, toolbar's among them.

## What the gallery rows measure

The section is the `mixed` shape — togglegroup (Left, Center), toggle
(Wrap lines), select (Font), and one `toolbar.item` (Print) — because the claim
worth a reader lane is not that a bar rendered but that foreign controls keep
their roles inside it. The generic `RENDERED_ROLE` sweep only counts one
`role="toolbar"`, so three rows were added beside it:

- the bar is named "Document" by its label part, which is the `aria-labelledby`
  wiring failing loudly if it breaks;
- each registered control is still announced as what it is — `button` Left,
  `button` Center, `switch` Wrap lines, `button` Font, `button` Print;
- exactly one tab stop at rest.

The tab-stop row counts `[tabindex]:not([tabindex="-1"])` plus untabindexed
`button`/`a[href]` inside `#toolbar`. At rest that is 1: the bar div carries
`tabindex=0` cold and every control resolves to `-1` through `toolbar.mounted`.

Measured on `SR_GALLERY_PORT=4421`:

```
#toolbar serves the toolbar family: 1 role="toolbar" element(s)
#toolbar serves the bar named by its label part.
#toolbar's controls keep their own roles: Left (button) / Center (button) / Wrap lines (switch) / Font (button) / Print (button)
#toolbar rests with exactly one tab stop.
The gallery boots and renders every family at http://127.0.0.1:4421.
```

## Landmine for the next gallery unit

The first `boot-check` on a cold worktree failed in the pre-warm, not in the
browser: `the dev server was still compiling /src/Gallery.tsrx?import after 10
minutes`. That is the check's own pre-warm ceiling against a first transform of
the whole entry graph with no vite cache. The identical command on the same tree
seconds later pre-warmed 40 requests in 7.7s and passed end to end. A red
boot-check whose only error is that line is a cold cache — re-run before treating
it as a defect.

A second flake in the same tree, worth the same treatment: one run of
`vp test --project ui .../src/toolbar .../test-support` came back 9 red, every
one a `navbar` SSR row failing with `transport invoke timed out after 60000ms`
while fetching `navbar.tsrx`. No toolbar row was among them. The identical
command re-run was 514/514 green in 621s against 1858s for the red one, so the
timeout was the vite transport under load, not navbar and not this change.

## Untouched on purpose

The api manifest diff is 38 added lines and no moved ones, so no other family's
docs shifted. `menu.trigger` still does not register into a bar, and
`test-support/driver.ts` still has no `toolbar` slot in its `Vocabulary`; both
stay open in `src/toolbar/note.md`. The NVDA and VoiceOver lanes are wired into
CI and were not run here — real readers are CI-only.
