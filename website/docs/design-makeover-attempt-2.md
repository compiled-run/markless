# Site design makeover, attempt 2

The local comparison runs at http://localhost:4310/markless/ui/accordion on
`design/brand-makeover-2`. The header offers three designs. `?variant=a`,
`?variant=b`, or `?variant=c` selects one directly; ordinary navigation retains
the choice in local storage. Blocked storage does not prevent a shared link working.

## Designs

- **Poster:** large uppercase Joy Elia headings, yellow letter edging in light
  mode, a pink marker stroke, and a crown. Dark headings use a pink underline.
  The accordion sits directly on the page, with controls and code separated by rules.
- **Field notes:** regular-weight headings and a drawn yellow underline. On a
  desktop, controls sit in a narrow column beside the accordion; code spans below.
  Answers use dashed separators and a quiet green wash.
- **Cut & paste:** a yellow paper title and a taped demo sheet. On a desktop,
  the live accordion and code sit side by side, with controls above. Examples
  retain a vertical arrangement so the longer FAQ and settings forms remain readable.

The original paper, ink, pink, yellow, purple and green tokens, fonts, grain,
mascots and doodles supply the designs. Existing Lucide icons remain in the site.
The installed icon plugin was also exercised with Phosphor, Tabler and MDI tags,
which each emitted inline SVG, after inspecting the QDS icon loader conventions.

## Shared corrections

The sidebar continues to use the real `@markless/ui` select. Selection is a
quiet wash; hover and keyboard focus retain ink text, with a dashed focus edge.
A hidden fallback link no longer paints a second border behind the live control.

Prose fences, the home-page code sample and generated demo code use the same
monospace stack, 13px-scale size and 1.6 line height. The home-page sample's token
spans are checked separately because its markup does not contain a `code` element.
Joy Elia remains the heading and control face, while
Shantell Sans carries reading text. Dark inline code uses a translucent marker
wash and normal foreground text. Dark headings have no offset shadows.

The playground's nested stage frame and per-answer cards are removed. Shared
styles live in `styles/brand.css`, linked from the document, because this
consumer's component-style emission remains unreliable. Generated wrappers carry
`data-family` so accordion styling does not reach another family's demo.
Desktop grid placement is limited to the playground wrapper; a browser assertion
checks that standalone example code remains below its demo. It caught overlapping
FAQ and settings panels in Cut & paste before the selectors were narrowed.

The production witness scrolls the heart into view before measuring pointer
coordinates. At intermediate desktop widths the outline is hidden and the heart
sits at the end of the article, so its old offscreen mouse coordinates were invalid.

## Type checks

The site now enables TypeScript imports with `.ts` extensions. Dependency
`.d.ts` checking is skipped, matching the framework workspace; authored source
and TSRX templates still receive their full checks. Its config uses the owning
Vite, Nitro and Oxlint types without the incompatible Vite Plus overload.
The lint rule permits the documented `@markless/ui/vite` entry and excludes
precompiled demo bundles. Shiki's grammar uses its exported registration type.

Existing string `tabindex` values became numbers, the disabled search input uses
a boolean, and hero hover events use the native event spelling accepted by
Markless. The code-run generator emits numeric tab indices, including cached
standalone panels regenerated through `uiDemos`.

A companion framework change on `fix/site-html-attribute-types` adds the missing
native script attributes and `meta.property`. Positive and negative CLI fixtures
verify their value types. The site's vendored TypeScript plugin contains this change.

## Evidence and remaining gate

Site verification:

- `npm run build`
- `pnpm exec tsc --noEmit -p tsconfig.json`
- `pnpm exec tsrx-tsc --noEmit -p tsconfig.json`
- `pnpm exec vp check --no-fmt`
- `node --test scripts/variant.test.mjs` — four passing preference/link tests
- `node --experimental-strip-types scripts/brand-review.ts` — designs A/B/C on
  the homepage and accordion, both themes, desktop and phone; native select
  keyboard focus and navigation, accordion single-open behavior, shared code typography,
  standalone example layout; 36 screenshots include the FAQ and settings examples
- `node --experimental-strip-types scripts/witness.ts` — 536 passing assertions

Framework verification:

- `pnpm exec vp test packages/typescript-plugin/test/markless-tsc.test.ts` — six passing tests
- `pnpm --dir packages/typescript-plugin run build:cjs` — passed
- `pnpm typecheck` — passed with the framework's TSRX-aware checker
- `pnpm exec tsc --noEmit -p tsconfig.json` — fails with 807 diagnostics, observed
  before this declaration patch as well. The raw TypeScript executable does not
  resolve the framework's TSRX source imports. This remains an open completion
  gate under the repository's explicit raw-tsc instruction; it is not reported green.

Build logs retain the previously recorded delegate/CSS diagnostic and large-chunk
warnings. Builds and the production interaction checks succeed despite them.
The doctor reports a build failure while capturing these messages; the direct
build, with its log redirected, finishes with exit 0.

Screenshots and command logs are preserved under
`~/dev/open-source/markless/goals/site-brand-makeover/notes/shots/attempt-2/`
and `notes/attempt-2-checks/`. The previous uncommitted site patch is backed up at
`/private/tmp/compiled-website-before-attempt-2.patch`. Unrelated handoff notes,
QA drafts, framework settings and ledger changes remain outside the changeset.

No branch has been pushed or merged. The design is available for local review;
final goal completion remains open on the raw TypeScript gate.
