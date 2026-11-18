# Real apps compiled for iOS and Android: what blocks them, and what the migrator is good for

Branch `cw/native-app-probe` (from `cw/ui-next-blockers`), 2026-11-18. Read-only study: no product code changed.

## One-minute summary

No page of a real app builds for native yet: of 1,078 pages from 40 apps, the 12 that build are all small demos, and
none of the 940 pages that markless-migrate ported from other frameworks builds.

| Where the apps come from | Apps | Pages | Not compilable for native at all | Fail the web compile today | Build for native |
|---|---|---|---|---|---|
| this repo's website | 1 | 80 | 75 (MDX pages) | 0 | 0 |
| this repo's demos | 20 | 45 | 0 | 0 | 12 |
| markless-migrate ports (`examples/`) | 15 | 940 | 0 | 10 | 0 |
| markless-migrate fixtures with Markless output | 4 | 13 | 0 | 0 | 0 |
| **total** | **40** | **1,078** | **75** | **10** | **12** |

Numbers are from `cw/native-integration`, which has the most native compiler support (see "Which tree"). The base
branch `cw/ui-next-blockers` also builds 12 pages; 17 of its port pages fail the web compile.

**What blocks real apps is mostly not what the component ladder has been working on.** Real pages are blocked first by
the element vocabulary: plain HTML text elements (`<code>`, `<pre>`, `<br>`, `<time>`), SVG, `<link>`/`<script>`/`<title>`,
forms and tables. After that come the `idle` and `visible` events, calls into the app's own code, and values that are not
component state (module constants, `@for` items, props). Overlays, pointer events and keyboard focus, which stopped the
ladder's families, block only 16 to 27 pages each.

**On the migrator: yes, use its ports to rank native work, starting now, at almost no cost. Do not use them as a web
against native conformance check until real pages build,** because there is nothing to compare yet. When there is,
start with a check that needs no simulator. Details in "The migrator".

## What was compiled

**The migrator.** markless-migrate (`github.com/compiled-run/markless-migrate`, commit `8e6eb21`, 2026-11-10) moves a
web app built with another framework (Next.js, Remix, Angular, Docusaurus, VitePress, htmx, Alpine.js and others) to
Markless one page at a time. `plan` lists the old site's pages, the old site is recorded in a real browser, `convert`
writes a Markless page from the recording and the old source, a coding agent writes what is left, and `check` compares
old and new side by side in a browser. Its output is an ordinary Markless app: `pages/*.tsrx` for the router,
`components/`, and widget libraries (Radix, Base UI, React Aria) rebuilt as the migrator's own "parts" and copied into
the app (for example `lib/ports/radix-ui-react-dialog/`). The ports pin `@markless/*` 0.5.0 to 0.9.0; this tree is
0.14.0. `convert` needs a browser recording of the old site, so it was not run: the 15 ports under `examples/` are what
it has produced (with agent edits), and the four fixtures that hold `.tsrx` (`markless-site`, `radix-dialog-markless`,
`shadcn-create`, `shadcn-typeset`) were compiled too. The other 23 fixtures are old-site inputs (HTML), not Markless.

**This repo.** The website (`website/pages`) and every folder under `demos/` whose `package.json` names a `@markless/*`
package (20 apps; the interaction benchmark's octane and ripple apps are other frameworks and are left out).

**How.** `packages/mobile/proofs/real-app-probe.ts` (committed). For each app it asks the router
(`buildRouteManifestFromFileIds`) which files under `pages/` are routes, and compiles each route with
`compileNativeApp` where the tree has it (`cw/native-integration`, so links between pages are checked against the app's
real routes) and `compileNativeComponent` with the page's file otherwise. An app with no `pages/` folder compiles each
of its top-level components: the modules no other module of the app imports, from the analyzer's `moduleImports`.
Imports resolve from disk; `@markless/*` imports resolve to this tree's packages, so every app is compiled by today's
compiler whatever version it pins. A page builds when the build has no error diagnostic for it. Status pages (`404`,
`500`) are not routes and were not compiled. The reader was checked against the harness's own on three device-proven
rungs (u5, u12, u14): all three build either way.

Reproduce: `node packages/mobile/proofs/real-app-probe.ts --migrate <markless-migrate checkout> --out out.json`
(about three minutes, no simulator or emulator; the docusaurus port is two of them).

**Which tree.** The brief named `cw/ui-next-blockers` as the branch with the most compiler support. It is not:
`cw/native-integration` contains all of it plus 45 commits (a route table in one payload with `compileNativeApp`, `@for`
rows of family parts, app styles, the device features). Both were probed. They build the same number of pages; the
integration tree halves the `@for`/`@if` shape refusals (169 pages to 84) and lowers `<img>`.

**What was not measured.** Styles: Dragon was not run, and most ports style with Tailwind, whose CSS exists only after a
web build. Anything on a device. And refusals hidden behind other refusals (below).

## The pages that build

All 12 are demos: seven files of `demos/codegen-size/corpus` (a corpus of small components for measuring generated
code size), `demos/same-module-branch`, `demos/live-feed-ssr/pages/UpdateSummary.tsrx`, two of the three
`demos/static-router` pages and `demos/executed-at-load/fixtures/for-call-expression.tsrx`. The base tree builds all
three `static-router` pages and not the `executed-at-load` fixture.

**A defect this found** (on `cw/native-integration`): `demos/static-router/pages/index.tsrx` is refused with "a link to
/about/, which is not a route of this app". The page links `<Link href="/about/">` and the route is `/about`. The route
check (`linkRoute` in `packages/compiler/src/passes/native-view.ts`) compares the pattern exactly, while the web router
strips the trailing slash (`normalizeRequestPathname`). The base tree did not check links against routes, so the page
built there.

## What blocks the rest

Ten pages of two ports fail today's web compile before the native pass runs (`MARKLESS_HANDLER_WRITES_RENDER_LOCAL` on
25 sites, `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` on 9, `MARKLESS_CATCH_ERROR_FIELD_LOST` on 4 and two others, in
shadcn-admin, shadcn-ui and tanstack-query). Some are API drift, since the ports pin older versions. The nine
"graph analysis is not available for that module" errors look like the native entry point's doing: it compiles the page
for the web without the interfaces of the modules it imports, which the web build has. Not chased further.

The remaining 993 pages carry 20,032 native refusals, with 2,507 distinct messages. Every native refusal has the same
code, `MARKLESS_NATIVE_UNSUPPORTED`, and names the construct only in its message, so to rank capabilities I grouped the
messages by their fixed wording ("the <x> element", "the x event has no native meaning yet", "reads `x`, which is not
state of this component", "needs a script engine", ...). That grouping is mine, done outside the repo, over the
compiler's own messages; no code or build output was scanned. A refusal kind on the diagnostic would make it exact.

### Ranked by how many pages each blocks

Integration tree. "Apps" is how many of the 40 apps have at least one page blocked by it. Docusaurus (485 pages) and
htmx.org (188) are documentation sites whose pages share one layout, so the last column leaves them out.

| Capability the page needs | Pages blocked | Apps | Pages outside the two docs sites |
|---|---|---|---|
| plain HTML text elements: `<code>`, `<kbd>`, `<pre>`, `<br>`, `<hr>`, `<time>`, `<small>`, `<blockquote>`, `<details>` | 870 | 16 | 202 |
| SVG drawing: `<svg>`, `<path>`, `<circle>`, `<g>`, `<use>`, `<rect>` | 838 | 11 | 174 |
| the `idle` and `visible` events | 752 | 12 | 81 |
| a call into the app's own code or a browser API from a handler, computed or render (for example `document.getElementById`, `localStorage.setItem`, a helper with a loop) | 740 | 30 | 238 |
| document and script elements: `<link>`, `<script>`, `<title>` (and more than one), `<template>` | 667 | 13 | 186 |
| reading a value that is not component state: module constants, `@for` items, page props, imported data | 387 | 21 | 199 |
| class, style and property bindings | 336 | 16 | 148 |
| forms: `<form>`, `<select>`, `<textarea>`, `<output>`, the `submit` and `change` events | 308 | 22 | 119 |
| a prop passed to a child component that does not lower | 177 | 21 | 177 |
| tables | 117 | 11 | 67 |
| `@for` and `@if` shapes (nested `@for`, `@for` over a non-state list, markup outside the root) | 84 | 21 | 76 |
| animation, scroll and other events | 81 | 12 | 80 |
| state shapes: `shared()` scopes, first values not known at build time, writes while rendering | 63 | 14 | 55 |
| async values and `@try` | 54 | 15 | 54 |
| pointer, hover and touch events | 27 | 7 | 27 |
| keyboard and focus events | 25 | 7 | 23 |
| embedded media (`<iframe>`) | 22 | 5 | 5 |
| the overlay `dismiss` events | 16 | 3 | 16 |

Smaller groups: event fields a tap lacks (14 pages), custom elements left over from an Angular port (13), handlers on
elements already refused (10), links (7), icon components from another package (3), other (13).

Most pages need several capabilities at once: 503 pages need exactly five groups and the median is five. Only 12 pages
need one group. So no single addition unblocks many pages.

### Which additions unblock the most pages

Adding groups one at a time, each time taking the one that makes the most pages build:

| Step | Add | Pages that build after it |
|---|---|---|
| | today | 12 |
| 1 | forms | 19 |
| 2 | `idle` and `visible` | 22 |
| 3 | plain HTML text elements | 30 |
| 4 | document and script elements | 40 |
| 5 | tables | 46 |
| 6 | values that are not state | 48 |
| 7 | calls into app code | 51 |
| 8 | SVG | 576 |
| 9 | class, style and property bindings | 750 |
| 10 | props that do not lower | 775 |

Steps 8 and 9 look huge because the docusaurus and htmx layouts draw SVG icons and bind classes: one component moves
every page of a site. The page that a group blocks is usually blocked in a shared component, not in the page file: the
`idle` refusals in htmx's 188 pages all come from `components/site-header.tsrx`, react-hn's `visible` refusals from
`components/App.tsrx`, vite-site's `idle` from `components/footer.tsrx`. The useful unit of progress for a real app is
its shell (header, footer, layout), not its page count.

These counts are a ceiling, not a promise. The pass stops at some refusals and never looks inside them: hn-graphql's
`/login` shows two refusals (a `@try` with no `@catch`, markup outside the root), but with the `@try` removed it shows
eleven more, from the `<LoginView>` it renders (`<form>`, `<table>`, `<br>`, a `new` in `loginQuery`, its props).

Some groups are not one addition each. "Calls into app code" contains both what the handler study's data vocabulary
could absorb (a helper with a loop) and what no engine runs (`document.querySelector`, `classList.toggle`). "Values that
are not state" is mostly module constants and `@for` items, which are known at build time on the web too.

### Two facts about the diagnostics themselves

- 84% of native refusals (16,905 of 20,032) carry no source location, so neither a person nor the migrator's fix loop,
  which hands an agent a file and line, can find what to change.
- They all share one code, as above.

## Where real apps point somewhere different from the synthetic rungs

**The ladder and its family probe** (`ui-ladder.md`, `ui-family-probe.json`) found keyboard and focus handlers (32 of
46 families), names the pass does not resolve (26), helper calls (23), `@for` shapes (20), components in `@for` rows
(19), the overlay's `dismiss` (13) and pointer events (11) as the cross-cutting blockers, and proposed jobs for handler
bodies, rows, the overlay primitive, Dragon, pointer geometry and text entry. Real apps agree on helper calls and `@for`
shapes. They differ in three ways:

1. **Real pages are blocked earlier, by the element vocabulary.** Text-level HTML, SVG, document elements, tables and
   forms block 870, 838, 667, 117 and 308 pages. No rung used them, because each rung is written to fit what the pass
   lowers. These additions are mostly cheap (a text-level element is a text run; a table can stack as a first cut), and
   each one is a host and conformance-vector change like rungs 4 to 10 were.
2. **Load-time events matter.** `idle` and `visible` block 752 pages in 12 apps, mostly because the migrator boots the
   old site's behaviour on idle (docusaurus's `siteBoot`, htmx's header). On a phone they need a meaning ("after the
   first frame", "when the view scrolls into the screen") or a decision that such handlers are web-only.
3. **Ports do not use `@markless/ui` families.** No port page reaches a file in `packages/headless` (only three website
   pages do). Ports bring their own widgets as the migrator's parts. Overlays, pointer events and keyboard focus block
   only 16, 27 and 25 pages. So the family ladder, however far it gets, will not move ported apps unless the migrator's
   parts become `@markless/ui` families.

**The handler study** (`handler-boundary.md` on `cw/native-handlers`, 1,344 handlers in this repo) said most handlers
can be data with named extensions, and that the hard remainder touches the page. Real apps agree: calls into app code are
the widest blocker by apps (30 of 40), and the ports' calls include exactly that remainder (`document.getElementById`,
`document.body.classList.toggle`, `localStorage.setItem`, `.closest`, `.getAttribute`). But handlers are not what stops
most pages first: a page whose header draws an SVG icon is refused before any handler matters.

## The migrator

**1. As a source of realistic test apps: yes, now.** Cost: a markless-migrate checkout and the committed probe, about
three minutes, no devices. It found a defect (the trailing-slash link) and a different priority order on its first run.
The natural home is markless-ecosystem-ci (`docs/ci-process.md`), which already builds these ports against Markless from
a commit every night: add the probe's per-page verdicts beside its build and check results, and report pages that stop
building. Caveats that keep it honest:

- Weight by app or by shared shell, not by page: two documentation sites are 673 of the 940 port pages.
- The ports pin old Markless versions; ecosystem-ci is what keeps them current.
- The corpus has no `@markless/ui` usage. It ranks the page and app layer, not the families.
- Shrinking a port to a page that builds would make a good rung: the three pages below are each one or two changes
  from building.

**2. As a conformance check (the same app, web output against native output): not yet.** No real page builds, so
there is nothing to compare. When some do, in order of cost:

- *Without a device* (moderate): for each route, the reference runtime's initial texts (`createNativeRuntime(payload).texts()`)
  against the text of the web build's server-rendered page, then the same after each action. It needs the port built,
  which ecosystem-ci already does. It checks meaning, not looks.
- *On devices* (high): `markless-migrate check` drives two browsers. A native side would need a new capture backend
  (a simulator screenshot and accessibility tree), a macOS runner, and role checks Maestro cannot read (`ui-ladder.md`,
  "Accessibility"). Run it on a schedule, as the ladder's phone runs are planned to be.

Both need the diagnostics to say where a refusal is (84% do not today) before the migrator's fix loop could act on
them.

**3. Changing what the migrator writes so pages build for native: no.** That bends the corpus to the compiler, and the
corpus then stops telling us what real apps need. One thing to know: much of what blocks ports is how the migrator keeps
the old site's behaviour (`<script>`, `<link>`, boot code on `idle`). A phone cannot run that behaviour either way, so
those apps will need it rewritten as Markless code before they can be native.

## The three real pages closest to building

Each was checked by compiling a scratch copy (outside the repo) with the refused construct taken out, on the
integration tree. "Builds" means the native view builds; styles were not checked.

1. **docusaurus port, `/dogfooding/javadoc`** (`pages/dogfooding/javadoc.tsrx`). Refused for "text outside an element":
   the page is a fragment holding a single string. Builds once the text sits in an element. Needs: the pass to put
   root-level text in a text view (or the importer to wrap it). A test page with no real content.
2. **alpinejs.dev port, `/forgot-password`** (`pages/forgot-password.tsrx`). Refused for `<form>` and the `submit`
   event. The form's only handler is `onSubmit={(event) => event.preventDefault()}`, with an email field and a submit
   button. Builds once the form is a `<div>`. Needs: `<form>` as a container whose submit button raises `submit`, and
   `preventDefault()` there meaning "do not navigate". The `<img>`, `<label for>` and `<input type="email">` already
   lower.
3. **vite-site port, `/fr`** (`pages/fr/index.tsrx`, the same as `/ar`). Refused for `<time>` and the `idle` event. The
   `idle` handler is in `components/footer.tsrx`: `onIdle={() => { renderedAt = new Date().toISOString(); }}`. With
   `<time>` as a text element and the event as `onClick`, it is still refused: "a call to `(value).toISOString`, which
   needs a script engine". With both removed, the page builds. Needs: `<time>` as a text element, an `idle` meaning,
   and the clock (`new Date().toISOString()`, the handler study's "dates, the clock, locale formatting").

The next by refusal count are hn-graphql `/login` and `/user`, which are not close: the `@try` they stop on hides
eleven more refusals on `/login` (measured) and the `<table>`, `<form>`, `<title>` and `<link>` markup of `/user`
(read). remix-notes `/` is close in a different way: the markup around the `@try` lowers, and what is left is one `@try` around
`computed(async () => loadUser())`, a server-side session read. That is the async-value question still open for the
owner (rung 11 in `owner-note.md`), not a missing capability.
