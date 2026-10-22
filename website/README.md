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

Every page carries one `<PageMeta time assumes sprite />` line under its `H1`. Two of those
three are judgement calls; `time` is not, because a per-page guess is what made the old numbers
wrong by up to four minutes.

**The formula.** `words` is the whitespace-separated token count of the page's `.mdx` source with
the `import` lines removed, so the code fences and the callout text count, which is fair because a
reader spends time on both. The claim is `max(2, round(words / 200))` minutes: 200 words a minute
is a slower rate than plain prose, and the floor keeps a short page from claiming a minute nobody
believes. Every page sets its `time` from it.

```sh
# words on one page
sed '/^import /d' pages/concepts/state.mdx | wc -w
```

Rewriting a page means recomputing its `time` in the same change set. The other two props:
`assumes` is a
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
typecheck, that the code blocks are really highlighted, that a TSRX token shows its hover
doc, that a phone gets the article's `h1` inside the first screenful with the nav collapsed, and
that the Counter island still resumes on a page whose first code block sits above it. It writes
screenshots into the markless repo's goal notes.

## Layout

- `pages/**.mdx` — one file per page. Prose is markdown; interactive pieces are default
  exports of `.tsrx` files, imported at the top and used as top-level blocks.
- `components/demos/` — the demos, grouped by the docs section that shows them (`build/`,
  `concepts/`, `contributing/`, `home/`, `router/`, `start/`, `tooling/`) and, for UI families,
  `ui/<family>/` with `basic.tsrx` as the hero and one file per further example. In a section folder
  `counter.tsrx` is the teaching component shown verbatim on the page and `counter-demo.tsrx` wraps
  it in the playground frame, because a page places each component as its own top-level block. `callout.tsrx` and
  `collapsible.tsrx` are docs chrome, not demos, and live in `components/docs/`.
- `components/docs/sidebar.tsrx`, `document.tsrx`, `nav.ts` — the chrome. `nav.ts` is the single
  source for the page list: the sidebar loops it, and the breadcrumb, the pager and the witness read
  it. Adding a page means adding an entry there and nothing else. `document.tsrx` renders a plain
  `<html>` root.
- `styles/global.css` — the look, copied from the markless repo's `docs/` app, plus the code-block
  palette, the hover-doc box and the dark theme. Below `70rem` the sidebar's list is collapsed
  behind a `<details>` and the "On this page" outline is laid on its side as a strip of chips, so
  the first phone screenful is the article rather than the navigation.
- `public/favicon.svg`, `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt` — the head and
  crawler files. The last three are generated; `scripts/generate-seo.ts` is what writes them.
- `public/theme/sun.png`, `public/theme/moon.png` — the two drawings on the theme toggle, cut from
  the top pair of `theme-icons-sheet.png` by `tooling/cut-sprites.ts theme`. Each button carries the
  drawing of the theme it is standing in, so the sun is only ever painted on paper and the moon only
  ever on the dark ground.
- `components/sprite.tsrx`, `components/mascot.tsrx`, `components/sticker.tsrx` — the hand-drawn
  accents. `public/sprites/`, `public/mascots/` and `public/stickers/` hold the cut assets;
  `tooling/cut-sprites.ts` is what cut them and is not part of the build. Sprites are the flat
  crayon doodles and ship twice, once as drawn and once lifted to chalk for the dark ground.
  Stickers are die-cut, with their own white border and shadow, so they carry depth and one file
  reads on both grounds; they are the larger accents — the landing hero, a callout corner, the
  footer strip — while sprites stay small and inline.
- `components/mascot/mug-spot.tsrx`: the mug hiding on a few pages, peeking over the top edge of
  the code block, callout, figure or pager that follows it, with a face or pose that fits the text
  there. At most one per page. Where the browser supports scroll-driven animations he rises from
  behind the edge as the spot scrolls in (`react="duck"` sinks him back down as you look); with
  reduced motion he just sits there. It wears the glaze, pour, coaster
  and companion the reader picked on `/mascot`: a tiny inline script copies them from
  `localStorage` onto `<html>` before the mug paints, so the page ships no other JavaScript for it.
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

`tooling/highlight-code.ts` runs shiki with two themes, `github-light` and `github-dark`. It drops
each theme's background and default text colour, so a block sits on the site's own ground and ink.

In a `tsrx` fence, the TSRX constructs and the framework calls carry a hover doc: point at `@if`,
`state`, `attach` or an `onClick`-style prop, or tab to it, and one sentence explains it. The
sentences live in `tooling/tsrx-docs.ts`. There is no JavaScript behind them; the box is a child of
the token, shown by CSS on hover and on focus.

## Links

The sidebar links use `<Link>` from `@markless/core/router`. Page prose links are plain markdown
links, and the pager uses plain `<a>` tags.

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
pinned to it.

## Live code

Pages teach with `<Code>` blocks the reader can edit.
[`components/docs/code/README.md`](components/docs/code/README.md) explains how a block compiles in
the browser. `pages/contributing/improve-the-docs.mdx`, served at `/contributing/improve-the-docs`,
explains how to write one.

## Previews

A UI family preview comes from the generator: `<Playground scenario="family/demo" />`. Every other
interactive figure composes `components/docs/preview-card.tsrx`, which draws the same card with the
same CSS (`components/docs/preview-card.test.ts` keeps it equal to `tooling/ui-playground-css.ts`).

An `.mdx` page cannot wrap a component in another, so write a small `.tsrx` wrapper and render it
from the page:

```tsrx
import PreviewCard, { Action, Choice, Controls, Mono, Stage, Switch, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
```

| Part | Props | Draws |
| --- | --- | --- |
| `PreviewCard` (default) | `name` (`data-preview`, for tests), `label` (accessible name) | the card |
| `Controls` | `title` | top band: title on the left, then the controls inside it |
| `Switch` | `label`, `hint`, `checked`, `disabled`, `onChange(checked)` | on/off switch |
| `Choice` | `label` (unique on the page), `hint`, `options` (2-4), `value`, `onChange(value)` | segmented one-of-few |
| `Action` | `end`, `disabled`, `onClick()` | text button: Reset, Reload, Back, Next |
| `Stage` | children | centred demo band |
| `Watch` | children | yellow strip saying what the mechanism did |
| `Mono` | children | code or an identifier inside Watch, without the prose chip |
| `Code` | `files` (1-3 `CodePane`s from `codePane()` in `tooling/code-blocks.ts`) | file tabs, clamp, Expand code |

The build demos keep their highlighted files in `components/demos/build/code-panes.ts`, written by
`code-panes.test.ts` from the demo files; run `vp test -u` after editing a demo. Each part carries
its own `<style>`, because the compiler stamps a module's scope class only on components that
declare one. Option lists are fixed slots, not `@for`: an item built by a repeat loses its value
or its handler when the page resumes.
