# One calm playground sheet

The marker designs from attempt 4 were rejected on September 5 ("the side by side is
just too cluttered"); the light-mode switches and the Source/CSS folder tabs survived.
The owner pointed at the qwik-design-system and React Aria playgrounds for space and for
how they use icons and selects. This pass rebuilds the playground as one sheet in that
spirit and removes the design picker. It runs locally on `design/image-led-playgrounds`
at http://localhost:4310/markless/ui/accordion.

## The sheet

- One white sheet with the site's ink edge, a 14px radius and a quiet purple offset
  shadow, the same recipe as the sidebar select.
- A paper controls band across the top: label, switch and an info icon per prop, two rems
  apart, `Show all ›` at the end. The switches are the ones the owner liked.
- A white preview, 40px of padding, at least 300px tall, the demo centred. The light
  palette is re-declared on it so demos stay ink-on-white when the page is dark, and the
  demo text is a plain system sans, as a consumer's page would draw it.
- Folder tabs (Source, CSS) standing on a bordered code surface, the open tab filled purple,
  the Scenario select beside them wearing the sidebar select's surface. Each code pane has a
  copy icon button in its corner that puts that pane's text on the clipboard, blank lines
  included. `Expand code` is a pill sitting on the fade, as React Aria draws it.
- The tooltip is a dark speech slab with a tail.

No marker frame, no doodles, no hand-drawn strokes. The page headings are untouched.

## What was removed

`public/variant.js`, the header picker, `scripts/variant.test.mjs` and every
`data-variant` rule. The stylesheet stays at `styles/brand.css`.

## Markup changes

`tooling/ui-playground.ts` emits `lucide.info` for the control hint, a `pg-copy` button in
every code pane and a small `copyPane` helper into each generated module (`ui-code-panel.ts`
emits the same helper for standalone example cards). The handler reads `event.target`:
Markless's resumed dispatch hands the handler a null `currentTarget`.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json`
- `pnpm exec tsrx-tsc --noEmit -p tsconfig.json`
- `pnpm exec vp check --no-fmt`
- `npm run build`, served with `PORT=4310 node .output/server/index.mjs`
- `node --experimental-strip-types scripts/brand-review.ts` — both themes, desktop and
  phone; the picker gone; sidebar tab order; keyboard code tabs; the copy button's clipboard
  write (captured, since headless Chrome will not read the clipboard back); matching selects;
  the white preview; the tooltip; restored headings; example code below its demo; accordion
  single-open behaviour. Screenshots land in `/private/tmp/brand-makeover-4/shots/`.
- `node --experimental-strip-types scripts/witness.ts`

The generated playground CSS is scoped with a hash class, so the sheet's rules carry
`html .prose` to outrank it. The dev server ships that CSS only with an island's JS, so an
untouched dev page shows the playground unstyled until the first interaction; the review
script targets the production serve.
