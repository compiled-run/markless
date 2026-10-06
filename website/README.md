# website

The Markless documentation site, served at `markless.dev`. It lives in the framework
monorepo as the `website` workspace package and consumes `@markless/*` through `workspace:*`, so a
framework change is checked against the real site in the same change set.

## Run it

From the repository root:

```sh
pnpm install
pnpm docs:dev        # dev server
pnpm docs:build      # production build into website/.output/
pnpm docs:preview    # serve the production build
```

Inside `website/`: `pnpm typecheck`, `pnpm typecheck:tsrx`, `pnpm exec vp check`, `pnpm witness`.
The root formatter and lint config apply here; `public/` and the generated playground modules are
excluded from both.

The dev server only ships a playground's generated CSS with its island's JS, so an untouched dev
page shows the playground unstyled until the first interaction. Visual checks
(`scripts/brand-review.ts`) therefore target a production serve:
`PORT=4310 node .output/server/index.mjs`.

Pages live under `pages/`, and a file's path under it is its URL: `pages/concepts/state.mdx` is
`/concepts/state`. Files in `public/` are served from the site root.

## Deploy

The site is served at `https://markless.dev`, from the root of the origin. `vite.config.ts` reads
`base` and `nitro.baseURL` from `site-base.ts`, which is `/`.

Vercel builds it from this monorepo. `vercel.json` in this folder is the whole build record:

```json
{
	"framework": "nitro",
	"installCommand": "cd .. && pnpm install --frozen-lockfile",
	"buildCommand": "NITRO_PRESET=vercel pnpm run build"
}
```

The install runs at the repository root, because the site consumes `@markless/*` through
`workspace:*`. The build runs `scripts/generate-seo.ts` and then `vp build`; nitro's `vercel` preset
writes `.vercel/output/` (Build Output API v3): `static/**` for the files the CDN serves and one
`__server` function for everything else.

To check a production build locally:

```sh
pnpm --filter website build
PORT=4310 node website/.output/server/index.mjs
```

## The document head, and what a crawler is given

`nav.ts` is the only place a page's title and its one-sentence description are written. Every entry
carries a `description`; `headFor(pathname)` turns an entry into the `<title>` and the
`<meta name="description">` that `document.tsrx` renders, along with `lang="en"`, a canonical link,
the Open Graph tags and the favicon. An unknown path falls back to the site's own name and sentence.

`scripts/generate-seo.ts` writes `public/robots.txt`, `public/sitemap.xml` and `public/llms.txt`
from the same array, and `npm run build` runs it before `vp build` so the files are copied into the
output. `npm run seo` runs it on its own. The site owns the root of `markless.dev`, so all three are
served from there and `robots.txt` names the sitemap. Adding a page still means adding one entry to
`nav.ts` and nothing else.

## Page metadata

Every page carries one `<PageMeta level time assumes sprite />` line under its `H1`. Three of those
four are judgement calls; `time` is not, because a per-page guess is what made the old numbers
wrong by up to four minutes.

**The formula.** `words` is the whitespace-separated token count of the page's `.mdx` source with
the `import` lines removed, so the code fences and the callout text count, which is fair because a
reader spends time on both. The claim is `max(2, round(words / 200))` minutes: 200 words a minute
is a slower rate than plain prose, and the floor keeps a short page from claiming a minute nobody
believes. Every one of the 19 pages is set from it, the reference page included.

```sh
# words on one page
sed '/^import /d' pages/concepts/state.mdx | wc -w
```

Rewriting a page means recomputing its `time` in the same change set. The other three props:
`level` is one of "Start here", "Building", "Under the hood" or "Reference"; `assumes` is a
comma-separated list of keys from the `concepts` map in `nav.ts`, or the word `nothing`, and a key
with no entry behind it prints as plain text and warns during the build; `sprite` names a file in
`public/sprites/`.

Under the meta line, a page whose reader may already know it carries one italic skip line, so a
reader who has done this before has a way up and out rather than only the way down into the
collapsibles. Five pages have an obvious skip target and carry one.

## Checks

```sh
npm run doctor     # environment and build sanity (from create-markless)
npm run witness    # builds must exist: serves .output, curls the routes, clicks a demo in Chrome
```

`npm run witness` needs a production build first (`npm run build`) and uses system Chrome through
`playwright-core`. It checks the routes answer, that every page serves a title and a description no
other page serves, that `robots.txt`, `sitemap.xml` and `llms.txt` answer with what they exist for,
that no rendered code block prints the `computed(async ({ signal }) => …)` form that does not
typecheck on 0.3.1, that the code blocks are really highlighted, that a TSRX token shows its hover
doc, that a phone gets the article's `h1` inside the first screenful with the nav collapsed, and
that the Counter island still resumes on a page whose first code block sits above it. It writes
screenshots into the markless repo's goal notes.

## Layout

- `pages/**.mdx` — one file per page. Prose is markdown; interactive pieces are default
  exports of `.tsrx` files, imported at the top and used as top-level blocks.
- `components/demos/` — the demos, grouped by the docs section that shows them (`home/`,
  `how-it-works/`, `start/`, `concepts/`, `build/`, `router/`) and, for UI families, `ui/<family>/`
  with `basic.tsrx` as the hero and one file per further example. In a section folder
  `counter.tsrx` is the teaching component shown verbatim on the page and `counter-demo.tsrx` wraps
  it in the playground frame, because MDX cannot nest components. `callout.tsrx` and
  `collapsible.tsrx` are docs chrome, not demos, and live in `components/docs/`.
- `components/docs/sidebar.tsrx`, `document.tsrx`, `nav.ts` — the chrome. `nav.ts` is the single
  source for the page list: the sidebar loops it, and the breadcrumb, the pager and the witness read
  it. Adding a page means adding an entry there and nothing else. `document.tsrx` keeps a plain
  `<html>` root rather than `<Html>` from `@markless/router`, which still fails the build on 0.3.3
  (`NOTES.md` findings 2, 24 and 40).
- `styles/global.css` — the look, copied from the markless repo's `docs/` app, plus the code-block
  palette, the hover-doc box and the dark theme. Below `70rem` the sidebar's list is collapsed
  behind a `<details>` and the "On this page" outline is laid on its side as a strip of chips, so
  the first phone screenful is the article rather than the navigation (`NOTES.md` finding 36).
- `public/favicon.svg`, `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt` — the head and
  crawler files. The last three are generated; `scripts/generate-seo.ts` is what writes them.
- `public/theme/sun.png`, `public/theme/moon.png` — the two drawings on the theme toggle, cut from
  the top pair of `theme-icons-sheet.png` by `tooling/cut-sprites.ts theme`. Each button carries the
  drawing of the theme it is standing in, so the sun is only ever painted on paper and the moon only
  ever on the dark ground (`NOTES.md` finding 41).
- `components/sprite.tsrx`, `components/mascot.tsrx`, `components/sticker.tsrx` — the hand-drawn
  accents. `public/sprites/`, `public/mascots/` and `public/stickers/` hold the cut assets;
  `tooling/cut-sprites.ts` is what cut them and is not part of the build. Sprites are the flat
  crayon doodles and ship twice, once as drawn and once lifted to chalk for the dark ground.
  Stickers are die-cut, with their own white border and shadow, so they carry depth and one file
  reads on both grounds; they are the larger accents — the landing hero, a callout corner, the
  footer strip, the like heart — while sprites stay small and inline.
- `components/docs/like-heart.tsrx` — the heart under the "On this page" rail. Clicking it pops the
  heart, throws four doodles out of it, floats a "+1" past the count and adds one to the count. The
  count is a `state()` and resets on reload: it wants `storage()`, and a second `storage()` binding
  on a page never persists on 0.3.1 while the theme toggle holds the first (`NOTES.md` finding 30).
  The pop and the burst are pressed-state transitions in the stylesheet rather than keyframes on a
  toggled class, because a `class={ternary}` binding is compiled without a dom update (finding 18);
  `NOTES.md` finding 33 has the shape.
- `tooling/` — build-time code. `highlight-mdx.ts` is a Vite plugin registered after `router()`;
  `highlight-code.ts` runs shiki; `tsrx-docs.ts` holds the one-sentence explanation of each TSRX
  token; `tsrx.tmLanguage.json` is the TSRX TextMate grammar. It is not called `plugins/` because
  Nitro claims that name for server plugins.

## Code blocks

Fenced code is highlighted at build time. `tooling/highlight-mdx.ts` finds the static HTML in the
module the router emits for each `.mdx` page, hands every `<pre><code class="language-…">` block to
shiki, and puts the result back, recounting the elements so the islands further down the page still
resume against the right nodes.

Supported fences: `tsrx`, `ts`, `tsx`, `js`, `json`, `css`, `sh`, `bash`, `html`. A fence in any
other language is left as plain `<pre><code>`.

Colours are not chosen by shiki. The theme is shiki's CSS-variable theme under a `--code-` prefix,
and every one of those variables is defined in `styles/global.css` from the site's paper tokens, so
the palette lives with the rest of the design.

In a `tsrx` fence, the TSRX constructs and the framework calls carry a hover doc: point at `@if`,
`state`, `attach` or an `onClick`-style prop, or tab to it, and one sentence explains it. The
sentences live in `tooling/tsrx-docs.ts`. There is no JavaScript behind them; the box is a child of
the token, shown by CSS on hover and on focus. `NOTES.md` section 9 says why it is not an island.

## Links

**Every internal link is a plain `<a href>`, and every navigation is a full document load.** Not for
want of trying: `<Link>` from `@markless/router` cannot be imported into a `.tsrx` component on
0.3.3 (`MARKLESS_CAPTURE_METADATA_MISSING`), cannot be imported into an `.mdx` page at all (the
router's MDX transform takes default imports from `.tsrx` files only), and `<Html>` from the same
package still fails the SSR build the way finding 2 said it did on 0.2.2. The router's own SPA
machinery is in the built page and can be reached by hand — its click handler wants a
`data-markless-router-link` attribute rather than the component — but it is bound to the page-body
container, so the sidebar, the breadcrumb and the pager are outside it, and inside it a navigation
changes the URL and then leaves the previous page on screen. `NOTES.md` finding 40 has the three
probes, the exact errors and the browser measurement.

## Themes

The dark theme is the paper design with the ground and the ink swapped and the same four pastel
accents. Every dark value sits nested inside the rule that holds its light value, under an
`html.dark &` (or `&.dark` on `:root`) selector, so the two are never apart.

`components/docs/theme-toggle.tsrx` is the control, and `storage('theme', 'system')` is the whole of
it: assigning to that binding writes `localStorage.theme` and stamps `data-theme` on `<html>`, and
the seed script the router puts in the head applies the stored value before the first paint.
`public/theme.js` resolves that stored choice (`system` against the OS setting) into a `dark` or
`light` class on `<html>`, which is the only thing the CSS reads, so the theme never flashes.

The toggle is an island each `.mdx` page renders rather than part of `site-header.tsrx`, because the
router serves only the document's HTML and drops its state payload, so nothing on the document path
can resume. The header reserves `.theme-toggle-slot` at the end of its tools row and the island is
pinned to it. `NOTES.md` finding 19 has the reasoning, including why the component has two buttons
instead of one.

`concepts/conditionals.mdx` and `concepts/lists.mdx` show their examples as plain files to paste
into a project, with no live widget. Every example on both pages compiles, except the first file on
the conditionals page: it is shown on purpose as the code the compiler refuses
(`MARKLESS_STATE_CREATION_SITE_UNSTABLE`, state created inside an `@if`), and the callout above it
says so. The witness asserts that callout and that neither page has a demo frame.

Two more pages ship without a live widget, each for a reason the page states out loud and the
witness asserts. `concepts/async.mdx`: `@try` blocks build fine, but an async
boundary inside an MDX page serves no `asyncBoundaries` entry and no locator for the nodes in its
arms, so nothing on the page can move (finding 25). `concepts/styling.mdx`: the scoped stylesheet a
component compiles to is written into the build output and never linked from the page, and an
element whose `class` is an expression is emitted without its scope class (finding 26). In every
case the witness asserts both the callout and the absence of a demo frame, so the day the framework
accepts those components the run goes red and the note has to come out with the fix.

`start/first-app.mdx` has no widget by design: it is a terminal transcript, and a fake terminal
would be a lie. `reference.mdx` has none for the same kind of reason: it is a lookup page, not a
page anyone reads front to back.

Every widget on the site reads its state directly in a text binding. A `computed` that closes over
a plain object is missing from the chunk a click loads, whether the object sits at module scope or
in the component body (`NOTES.md` finding 31), so the four Router and How-it-works widgets are
written as ternary text bindings and say so in a comment.

`NOTES.md` records what 0.2.2, then 0.3.0, then 0.3.1 could and could not do while this was built.
Read it before changing the shell or the build config.
