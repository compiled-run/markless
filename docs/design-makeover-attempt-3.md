# Four connected playground styles

This pass follows the owner's September 5 feedback and replaces the three whole-site
looks from attempt 2. It runs locally on `design/component-preview-4` at
http://localhost:4310/markless/ui/accordion.

## Scope

The headings, prose code surfaces, page width, sidebar width, active sidebar labels and
other surrounding design treatments return to the styles in `global.css`.
Variant C's sidebar select treatment is shared by the four choices, and the same
fine dashed hover/focus edge is used on sidebar links. The simple prop controls stay.

The controls, live component and code share one adjoining frame. The code tabs attach
to the code pane and show a marker accent on the selected file, with dashed hover
and focus states. Arrow keys change the selected tab. The scenario select uses the
same surface, border, radius, shadow and hover styling as the sidebar select.

The four treatments include the FAQ and settings examples:

- `?variant=a` — **Arcade:** a paper game panel with a crown, a pink active row and
  yellow button details.
- `?variant=b` — **Quest log:** hand-drawn star badges, a yellow marker underline and
  a purple edge on paper.
- `?variant=c` — **Notebook:** a pink notebook edge, simple rules and handwritten questions.
- `?variant=d` — **Journal:** plain paper, a taped edge and a vertical list of entries.

The owner's [Joy Elia reference](https://layers-r2.com/cdn-cgi/image/width=2560,format=avif/09c59de4-bb30-4b1f-bdac-7b5698142754-Artboard-1.png)
supplies the visual direction: the existing Markless paper, lettering, marker colors
and doodle assets. The checker, dot-grid and terminal treatments were removed.

The header offers the four choices, and the choice persists through normal navigation.
The compact phone header reserves room for the fourth choice beside the theme button.

## Keyboard correction

The old select was a normal focusable button, but its page island appeared at the
end of the document. CSS positioned it over an inert slot in the sidebar. Native
Tab therefore skipped from the sidebar logo to its links, reaching the select only
near the end of the page.

The sidebar now contains the real select and is the first page island. Fifty MDX
pages replace their final select island with the sidebar before the page content;
the two error pages also render the sidebar. The document no longer renders it
separately. This keeps its state inside the page's render output and puts the
select in the same visual and keyboard order, without positive tab indices,
keyboard redirection or moving compiled elements in the browser.

A browser test failed on the former arrangement and passes on the new one:
logo → select → first sidebar link, with Shift+Tab reversing the order. Enter opens
the select; Escape closes it and returns focus. Fenced code examples were compared
with the previous commit and remain unchanged in the 50 MDX edits.

## Verification

- `npm run build`
- `pnpm exec tsc --noEmit -p tsconfig.json`
- `pnpm exec tsrx-tsc --noEmit -p tsconfig.json`
- `pnpm exec vp check --no-fmt`
- `node --test scripts/variant.test.mjs`
- `node --experimental-strip-types scripts/brand-review.ts`
- `node --experimental-strip-types scripts/witness.ts`
- Framework: `pnpm typecheck`, explicitly accepted by the owner for this change.

The comparison check covers four previews in light and dark mode, desktop and phone,
keyboard order and activation, ordinary select navigation, accordion behavior,
adjoining control/preview/code sections, keyboard-operated code tabs, matching
select surfaces, standalone example layout, and the fourth link's actual hit target
on a phone.
It compares heading styles with the preview stylesheet enabled and disabled to
verify that the page headings retain their original styling.

Build logs and browser evidence are saved under
`goals/site-brand-makeover/notes/attempt-3-checks/` and
`goals/site-brand-makeover/notes/shots/attempt-3/` in the framework workspace.
The build retains the existing delegate/CSS and chunk-size warnings recorded in
attempt 2. No dependency or framework runtime changes were needed for this pass.
