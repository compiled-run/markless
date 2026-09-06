# compiled-website

The Markless documentation site, served at `compiled.run/markless`. It is a real Markless app built
on released `@markless/*` packages, so everything on it is doing what a reader's own app would do.

## Where the framework comes from

The site installs `@markless/*` `^0.3.3` from npm. There is no `vendor/` directory, no `@markless/*`
override, and — since 0.3.3 — no `overrides` block at all: `@tsrx/runtime@0.1.1` is published now,
so the `"@tsrx/core": "0.1.58"` pin that findings 1 and 22 needed is gone. Proven by deleting the
block and running `rm -rf node_modules package-lock.json && npm install` on this `package.json`: it
succeeds, `@tsrx/core` resolves to 0.1.60, and the build, the doctor and the witness are green on it.

`scripts/markless-doctor.mjs` compares the *installed* version of each `@markless/*` package, so a
`^` range that resolved somewhere unexpected fails the check rather than passing on the string.

**To move to the next release**, say 0.3.4: change the four `^0.3.3` ranges in `dependencies` and
`devDependencies`, then `rm -rf node_modules package-lock.json && npm install`, then
`npm run build && npm run doctor && npm run witness`. The witness is the thing that tells you what
the release actually changed: a check that was `known-failing` and now passes fails the run on
purpose, so the note explaining the failure has to be removed in the same change set.

**On 0.3.3 nothing is known-failing.** 0.3.1's one known failure — the `class={ternary}` binding on
the reading-a-`.tsrx` page, `NOTES.md` finding 18 — is fixed: the highlight moves on click, the
assertion is real again, and the honesty callout that stood over that widget is deleted. What is
*not* re-tested on 0.3.3 is findings 25, 26, 29, 30 and 31, whose widgets are still parked and whose
pages still describe 0.3.1 measurements; finding 23 was re-run and still holds — an `@if` inside a
component still hangs the build, killed at 180 s on 0.3.3, which is why the sidebar picks an icon
with an expression on `src` rather than a branch. `NOTES.md` finding 37 has the detail.

## Working locally

```sh
npm install && npm run dev
```

npm is the primary: `package-lock.json` is the lockfile in the repo. pnpm works too — the site
carries a `pnpm-workspace.yaml` naming itself, so `pnpm install` scopes to this project instead of
walking up into whatever workspace the checkout happens to sit inside, and the `pnpm-lock.yaml` it
writes is git-ignored rather than committed beside the npm one.

## Run it

```sh
npm install
npm run dev        # dev server
npm run build      # production build into .output/
npm run preview    # serve the production build
```

Pages live under `pages/markless/`, which is what puts them at `/markless/…`; `vite.config.ts` sets
the matching `base` and `nitro.baseURL`.

## Deploy

The site is its own Vercel project, and `compiled.run` proxies it. Nothing about the deploy is
special: the whole point of the base path is that this project genuinely serves `/markless/…`, so
the proxy in front of it is a path-preserving rewrite and not a rewrite that has to strip anything.

| | |
| --- | --- |
| Repo | `https://github.com/compiled-run/compiled-website` |
| Vercel project | `markless-docs`, team `jack-shelton` (`team_4TrBQsvIkFM0lYTqh08Fqxgd`), project `prj_rv06xPVYEu7z8GdStWatxRbjV8tm` |
| Production alias | `https://markless-docs.vercel.app/markless` |
| Public path | `https://compiled.run/markless` once the rewrite below is merged |

### How a deploy happens

`.github/workflows/deploy.yml` runs on every push to `main`: `npm ci`, then a build with nitro's
Vercel preset, then `vercel deploy --prebuilt --prod`, then it curls three routes on the production
alias and fails the run if any of them is not 200. The org and project ids are plain values in the
workflow; the one secret it needs is `VERCEL_TOKEN`, which only the account owner can create:

```sh
# owner-only: create a token at https://vercel.com/account/settings/tokens, then
gh secret set VERCEL_TOKEN --repo compiled-run/compiled-website
```

Until that secret exists the workflow builds and then stops at the deploy step with an explicit
error, rather than deploying nothing quietly.

To deploy by hand from a clean checkout:

```sh
npm ci
NITRO_PRESET=vercel npm run build          # writes .vercel/output (Build Output API v3)
npx --yes vercel@57.0.0 deploy --prebuilt --prod --yes --scope jack-shelton
```

The preset is what turns `.output/` into `.vercel/output/`: `static/markless/**` for the files the
CDN serves and one `__server` function for everything else. `vercel.json` records the same build for
a Vercel-side build, should the project ever be connected to the repo. It is not connected today:
`vercel link` reported `You need to add a Login Connection to your GitHub account first`, which is a
click in the owner's Vercel account, so CI is the only path to production.

Per-deployment URLs (`markless-docs-<hash>-jack-shelton.vercel.app`) answer 302 to Vercel's SSO gate
because deployment protection is on for the team. The production alias is not protected and answers
200, which is why every check — the workflow's and your own — runs against the alias.

### What `compiled-run/website` needs

Two entries in that repo's `vercel.json` `rewrites` array, after the `yuku-tsrx` pair. `:path*` does
not match the bare path, so both are needed:

```json
{ "source": "/markless", "destination": "https://markless-docs.vercel.app/markless" },
{ "source": "/markless/:path*", "destination": "https://markless-docs.vercel.app/markless/:path*" }
```

No `headers` entry: that repo's COOP/COEP block is only for projects that need cross-origin
isolation, and this site self-hosts its fonts. The same PR adds a `<a href="/markless">Markless
&rarr;</a>` link to that repo's `index.html` and a row to its Projects table.

## The document head, and what a crawler is given

`nav.ts` is the only place a page's title and its one-sentence description are written. Every entry
carries a `description`; `headFor(pathname)` turns an entry into the `<title>` and the
`<meta name="description">` that `document.tsrx` renders, along with `lang="en"`, a canonical link,
the Open Graph tags and the favicon. An unknown path falls back to the site's own name and sentence.

`scripts/generate-seo.ts` writes `public/robots.txt`, `public/sitemap.xml` and `public/llms.txt`
from the same array, and `npm run build` runs it before `vp build` so the files are copied into the
output. `npm run seo` runs it on its own. The site is one section of `compiled.run`, served under
`/markless/`, so `public/` lands at `/markless/` and all three are served from there; a host-level
`/robots.txt` belongs to the origin, and the copy here states this section's rules and names its
sitemap. Adding a page still means adding one entry to `nav.ts` and nothing else.

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
sed '/^import /d' pages/markless/concepts/state.mdx | wc -w
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

- `pages/markless/**.mdx` — one file per page. Prose is markdown; interactive pieces are default
  exports of `.tsrx` files, imported at the top and used as top-level blocks.
- `components/demos/` — the demos. `Counter.tsrx` is the teaching component shown verbatim on the
  page; `CounterDemo.tsrx` wraps it in the playground frame, because MDX cannot nest components.
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
accents. It is keyed off `html[data-theme='dark']`, with `@media (prefers-color-scheme: dark)` as
the default for a reader who has not chosen.

`components/docs/theme-toggle.tsrx` is the control, and `storage('theme', 'system')` is the whole of
it: assigning to that binding writes `localStorage.theme` and stamps `data-theme` on `<html>`, and
the seed script the router puts in the head applies the stored value before the first paint, so the
theme never flashes.

The toggle is an island each `.mdx` page renders rather than part of `site-header.tsrx`, because the
router serves only the document's HTML and drops its state payload, so nothing on the document path
can resume. The header reserves `.theme-toggle-slot` at the end of its tools row and the island is
pinned to it. `NOTES.md` finding 19 has the reasoning, including why the component has two buttons
instead of one.

Four pages ship without a live widget, each for a reason the page states out loud and the witness
asserts. `concepts/conditionals.mdx` and `concepts/lists.mdx`: a component whose body uses `@if`
makes the production build stop making progress on 0.3.1, and the transform that never returns is
named in `NOTES.md` finding 23. `concepts/async.mdx`: `@try` blocks build fine, but an async
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
