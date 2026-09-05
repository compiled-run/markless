# Two playground designs from the GPT Image mockups

This pass replaces the four attempt-3 playground styles with the two mockups the
owner picked on September 5: **08 Marker brackets** and **09 Compact sheet**. It runs
locally on `design/image-led-playgrounds` at http://localhost:4310/markless/ui/accordion.
The mockups live in the framework workspace under
`docs/goals/site-image-first-redesign/notes/T014-images/`.

## Designs

- `?variant=a` — **Marker brackets.** One thick, slightly wobbly ink frame holds three
  columns: the prop controls on the left with uppercase labels, green switches and a
  `SHOW ALL ›` row; the pure white component preview in the middle; and the code on the
  right with `SOURCE` / `CSS` tabs (the open one boxed in purple marker) and the scenario
  select in the same row. A pink marker mass sits behind the frame's right and bottom
  edges, a crown perches on the top-right corner and a yellow squiggle at the bottom left.
- `?variant=b` — **Compact sheet.** One bordered sheet: a `CONTROLS` toolbar with inline
  switches and `Show all ›`, the `SCENARIO` select at the end of that row, the white
  preview, then folder tabs standing on a bordered code box with the open tab filled
  purple. A yellow marker underline runs under the sheet and a purple star is doodled over
  the code box's corner.

Both designs share: the white preview canvas in both themes (the light palette is
re-declared on the stage, so demos drawn with the site's tokens stay ink-on-white when the
page is dark), the accordion demos as one white list with hairlines, a bold question and a
plus/minus at the end of each row, the tooltip as a dark speech slab with a tail, and the
scenario select wearing the sidebar select's surface. The code tabs now read `Source` and
`CSS`; the file name stays on each tab's `title`.

Inside the white preview the demo text is a plain system sans, the way a consumer's page
would draw the component; the mockups show the same. The site's hand lettering stays on the
chrome around it.

A Codex review (gpt-6-astra) against the mockups drove a second pass: heavier bracket
weights on A with the yellow squiggle and a green star outside the frame, a one-row toolbar
and a white code sheet on B, a narrower tooltip, larger switch thumbs, a lighter fade over
the code, and the scenario select kept in the toolbar's corner on phones. Two of its flags
are outside this change: the site-wide paper grain paints over the white preview (a
`global.css` matter), and the mockups show far shorter source than the real demo.

The page headings are untouched. The mockups also paint a pink marker scribble behind the
page title; that remains an owner decision and is not implemented here.

## What was removed

The attempt-3 Arcade, Quest log, Notebook and Journal treatments, their `data-variant`
rules and the four-way header picker. `public/variant.js` accepts `a` and `b` only and
falls back to Brackets; a retired `?variant=c` link lands on the saved or default design.

## How the frame is drawn

The frame's own background is transparent and its ink line is a `::before` pseudo-element
painted over the children, so the marker mass and underline (`::after`, `z-index: -1`)
sit under the controls, stage and code yet over the page. An outline could not do this:
Chrome paints an element's outline before its positioned children, and the controls column
is positioned to carry its doodle.

The generated playground CSS follows the document sheet, so every rule here is written
under `html[data-variant] .prose` to outrank it, and the closed states the generated sheet
relies on (`.pg-rest[ui-closed]`) are restated.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json`
- `pnpm exec tsrx-tsc --noEmit -p tsconfig.json`
- `pnpm exec vp check --no-fmt`
- `node --test scripts/variant.test.mjs`
- `npm run build`, served with `PORT=4310 node .output/server/index.mjs`
- `node --experimental-strip-types scripts/brand-review.ts` — both designs, both themes,
  desktop and phone; sidebar tab order; keyboard code tabs; matching selects; the white
  preview and ink-on-white demo text; the tooltip shown and dismissed; restored headings;
  example code below its demo; accordion single-open behaviour. Screenshots land in
  `/private/tmp/brand-makeover-4/shots/`.
- `node --experimental-strip-types scripts/witness.ts`

The dev server only ships the generated playground CSS with an island's JS, so a dev page
that has not been touched shows the playground without its chrome styles until the first
interaction. The review script therefore targets the production serve.
