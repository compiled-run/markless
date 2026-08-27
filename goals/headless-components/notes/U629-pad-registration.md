# Registering the `pad` family

The `pad` family shipped complete in `src/pad/**` but was reachable only from
inside its own folder. This wires it into every place a shipped family is
announced, mirroring `ink` site for site.

## The sites, and what each one now says

**Barrel** — `src/index.ts` gains `export * as pad from './pad/index.ts';`, so
`import { pad } from '@markless/ui'` works the way the gallery and the docs use
every other family.

**Package export** — `package.json` gains `"./pad": "./src/pad/index.ts"`, the
deep path a consumer takes when they want one family and not the barrel. The
gallery uses it for `import type { PadPoint } from '@markless/ui/pad'`.

**Conformance descriptor** — `test-support/conformance.browser.ts` gains a `pad`
entry mounting `scenarios/basic.tsrx` in CSR and SSR. Its parts are `root`,
`label`, `description`, `area`, `indicator`, `thumb`, `valuelabel`, `field`;
`rootAria: { role: null }` because one plane is the whole control and the root
takes no wrapper role; `supportsDisabled: true`; `valuedAttributes: ['ui-value']`
for the readout's text, every other `ui-*` mark this family writes being a
presence attribute.

There is no `openCycle`, and the reason is the same shape as ink's: the field is
a `role="group"` that is always on the page, so the battery's click-a-trigger
cycle has nothing of the family's own to click. Every handle is still its own
tab stop and nothing roves — that is how the curve's second control point is
reached — so `tab-walk` is a real check here rather than a formality.

The battery went from 450 rows to 499 with pad in it, all green, no exemption
and no axe rule disabled.

**API manifest** — `api:extract` then `api:check`. The manifest gains 140 lines
covering all nine parts and their props.

**Gallery** — `apps/sr-gallery` gains a `#pad` section with the two shapes the
reader lanes need:

The one-handle starter, named "Shadow offset", seeded at `x: 0.25, y: 0.75`,
with the indicator grid, the readout and a field named `offset`.

The two-point easing curve, named "Easing curve", whose handles are minted by a
keyed repeat inside a `CurveHandles` component. That component reads
`pad.state()`, so it sits inside the root — a component that reads the pad's
state is part of that pad's widget, and one placed outside would start a second
pad of its own. The curve is drawn by an `aria-hidden` SVG rather than a second
`pad.indicator`, which keeps exactly one `[ui-grid]` in the section for the
transcript to assert against.

`FAMILY_ANCHORS.pad` is added to `preview-server.ts`, which is what makes the
boot-check walk the section and what `PAD_ANCHOR` now reads.

**Boot-check** — `RENDERED_ROLE.pad = 'slider'` and `RENDERED_COUNT.pad = 3`
(one starter handle plus the curve's two). Two rows the role count cannot see
were added: every `#pad` handle must carry `aria-roledescription="2D slider"`
and a non-null `aria-valuetext`, and the section must mount exactly one field
named `offset`. Measured on `SR_GALLERY_PORT=4401`:

```
#pad serves the pad family: 3 role="slider" element(s)
#pad serves handles announced as "2D slider": X 0.25, Y 0.75 / X 0.25, Y 0.1 / X 0.75, Y 0.9
#pad mounts the field that submits the handle's two numbers.
```

The first announcement is exactly the resting text `pad-transcript.ts` expects,
so the virtual side of the reader claim is already settled against the real
gallery page rather than against a fixture.

**Reader matrices** — `pad` joins all three lists in
`.github/workflows/screen-reader.yml`: the virtual lane, NVDA and VoiceOver.
It qualifies for all three because `pad.sr.ts`, `pad.nvda.ts` and
`pad.voiceover.ts` all exist; a name with no spec file would make the run find
no tests. The workflow file was edited and never run here — real readers take
over a desktop, so those lanes are CI's.

**Transcript anchor** — `src/pad/pad-transcript.ts` now imports `FAMILY_ANCHORS`
from the gallery's `preview-server.ts` and sets `PAD_ANCHOR = FAMILY_ANCHORS.pad`,
the same idiom `ink-transcript.ts` and `tabs-transcript.ts` use. The section a
reader walks to and the section the gallery serves can no longer drift apart.
`src/pad/note.md` lost the paragraph saying the lanes were not runnable yet.

## What was measured

All six verification commands green in the worktree: `pnpm typecheck`; the pad
and conformance test lane at 499 passing rows across 2 files; `api:check` at 3
passing rows; the gallery build; the boot-check on port 4401 reporting every
family including pad; `vp lint --deny-warnings` at 0 warnings and 0 errors.

## One scar worth recording

The first pass of these edits landed in the shared checkout instead of this
worktree — the edit scripts were handed the repo root as an absolute path, and
`/Users/.../markless` and `/Users/.../markless/.claude/worktrees/<id>` are
different trees that look identical from a relative path. The three files were
reverted there by removing exactly the inserted text, and each was then diffed
against the worktree copy to prove the shared checkout was byte-for-byte
pristine again before the work was redone in the right place. In a worktree,
prefer relative paths from the working directory, or bind the worktree root to a
variable once and never spell the repo root at all.
