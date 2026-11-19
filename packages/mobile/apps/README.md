# Yardstick apps

Three small apps written the way a web developer who knows React would write a Markless app today: for the web first,
with public APIs only (`@markless/core`, `@markless/router`, `@markless/ui` families, `@markless/device` behind
`platform` checks, plain CSS). They were not shaped around what the native compiler accepts. They are test material
for one number: how many screens of a realistic app build for phones and match the web.

| App        | Screens | What it exercises                                                                                                                                                                                                                                  |
| ---------- | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/`   |       6 | list, search, create and edit forms, delete with a confirm modal, `storage()`, empty state, tags                                                                                                                                                   |
| `shop/`    |       7 | tab bar with a cart badge, product cards with images from local JSON API routes, detail, options in a bottom sheet (`native.sheet` on phones, `drawer` on the web), refresh, loading and error states with `@try`/`@pending`/`@catch`, cart, order |
| `checkin/` |       5 | camera, location and share (`@markless/device` on phones, browser APIs on the web), photo upload, settings with switches, radio groups and a select, permission-denied states, appearance setting                                                  |

Each app has a web font, flex and grid layout, a `min-width: 700px` tablet layout, `:active` and `:focus-visible`
styles, and dark mode.

## Headline

Screens that build for phones and match the web, out of all screens (`main` at `501fdb61d`, 2026-11-19):

| App     | Build and match |       Build |
| ------- | --------------: | ----------: |
| notes   |         not run |      0 of 6 |
| shop    |         not run |      0 of 7 |
| checkin |         not run |      3 of 5 |
| **All** |     **not run** | **3 of 18** |

The checkin screens `/`, `/checkins/[id]` and `/permissions` build. No screen has been run on a phone on this commit, so
"match" is not measured yet. Notes builds nothing because `compileNativeApp` throws on the app (#893): `/tags/[tag]`
prints its route param, and the style pass renders the first frame with no params. With that one throw caught, notes
`/`, `/tags` and `/tags/[tag]` build, which would make 6 of 18.

On 2026-11-18 (`cw/native-integration` at `3babf6ff2`), 0 of 18 built. #829 (handlers as JavaScript), #881 (a child
component's prop that follows state), #883 (`@for` inside `@if` or `@try`) and #884 (`compileNativeApp` takes the app
config) are what moved it.

## How it is measured

- Web reference: `test/apps-web.test.ts` builds each app with the router, serves it from its production server and
  walks it in Chromium at 402 by 778, once in light and once in dark (`<app>/walk.ts`). It runs in the `native-web`
  Vitest project (`pnpm exec vp test run --project native-web`), the ladder's web column in `mobile-hosts.yml`, not in
  the unit shards. `MARKLESS_YARDSTICK_SCREENSHOTS=<dir>` saves a screenshot at each step.
- Native: `node packages/mobile/apps/measure.ts --out packages/mobile/apps/yardstick.json` compiles each app's pages
  with `compileNativeApp` (with `document.tsrx`, the app's `app.json`, the workspace module reader and stylesheets) and
  records, per screen, whether it builds and every error diagnostic (code, message, file, line). When
  `compileNativeApp` throws, every screen of that app records the message under the code `THROWN`. `yardstick.json` is
  that output.
- Ranking: `node packages/mobile/apps/rank.ts yardstick.json [#<pr>=<report.json> ...]` groups refusals by code and
  message, with the names a message quotes between backticks and node ids left out (so "the function `parseNotes`" and
  "the function `parseCheckIns`" are one refusal), and counts the screens each blocks. With branch reports (the same
  `measure.ts` run on a PR's head), it lists on which branches a refusal no longer appears on a screen.

## Refusals, ranked by screens blocked

On `main` at `501fdb61d`. The notes screens show only the throw, which hides their own refusals.

| Screens blocked | Refusal                                                                                                                                                 |
| --------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
|               8 | MARKLESS_NATIVE_UNSUPPORTED: the function `…` uses a call to `…`, which needs a script engine                                                           |
|               7 | MARKLESS_NATIVE_UNSUPPORTED: a <Link> whose href or class is not fixed at build time, or whose params are not strings this build can compute            |
|               6 | THROWN: .tag of a value that has none                                                                                                                   |
|               5 | MARKLESS_NATIVE_JAVASCRIPT: the click handler reads `…`, which JavaScript on a phone cannot reach (not state, a prop value, a row item or a computed)   |
|               5 | MARKLESS_NATIVE_UNSUPPORTED: a @try that neither reads a device value nor holds a handler that awaits (a device call, or JavaScript)                    |
|               5 | MARKLESS_NATIVE_UNSUPPORTED: a text expression reads the @catch error of a @try that reads no device value                                              |
|               5 | MARKLESS_NATIVE_UNSUPPORTED: markup outside the root template, its @if arms and its @for rows                                                           |
|               4 | MARKLESS_NATIVE_UNSUPPORTED: the @for list reads the async value `…`, whose body is not one device call; it needs a script engine                       |
|               2 | MARKLESS_NATIVE_UNSUPPORTED: a text expression reads the async value `…`, whose body is not one device call; it needs a script engine                   |
|               1 | MARKLESS_NATIVE_ELEMENT: the <option> element has no native view yet                                                                                    |
|               1 | MARKLESS_NATIVE_ELEMENT: the <select> element has no native view yet                                                                                    |
|               1 | MARKLESS_NATIVE_ELEMENT: the <textarea> element has no native view yet                                                                                  |
|               1 | MARKLESS_NATIVE_JAVASCRIPT: the click handler calls `…` from @markless/device inside JavaScript that runs on the phone, which it cannot reach there yet |
|               1 | MARKLESS_NATIVE_JAVASCRIPT: the click handler calls `…` from @markless/router inside JavaScript that runs on the phone, which it cannot reach there yet |
|               1 | MARKLESS_NATIVE_JAVASCRIPT: the click handler uses `…` (a device object), which JavaScript on a phone cannot reach yet                                  |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: <base.camera> needs el={…} naming a camera the component made, and no other props                                          |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: a <native.sheet> inside an @if arm or a @for row                                                                           |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: a property binding (`…`)                                                                                                   |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: RadioGroupRoot while rendering sets `…` from a value that follows state; pass a fixed value or leave the prop out          |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: SelectItem while rendering sets `…` from a value that follows state; pass a fixed value or leave the prop out              |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: SelectRoot while rendering sets `…` from a value that follows state; pass a fixed value or leave the prop out              |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: the `…` attribute reads the async value `…`, whose body is not one device call; it needs a script engine                   |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: the `…` prop of <Shell> through `…` uses a call to `…`, which needs a script engine                                        |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: the <button> # in the <form> # sits in an @if arm or @for row of its form, which a native build does not submit yet        |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: the change handler reads `…`, which is not state of this component                                                         |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: the click handler on an element this build does not show                                                                   |
|               1 | MARKLESS_NATIVE_UNSUPPORTED: ToggleRoot while rendering sets `…` from a value that follows state; pass a fixed value or leave the prop out              |

Reading the table:

- "The function `…` uses a call to `…`" on 8 screens is mostly one helper: every shop page computes the tab bar's badge
  with `itemCount`, which calls `reduce`. #829 runs handlers as JavaScript, but a function the page calls while
  rendering still needs a script engine.
- The `<Link>` refusal on all 7 shop screens is `aria-current={...}` on the tab bar's links: an attribute that follows a
  prop. Its message names only `href` and `class`.
- The JavaScript handler refusals ("JavaScript on a phone cannot reach") on 5 screens read a value the handler closes
  over that is not state, a prop value, a row item or a computed: a `@catch`'s `reset`, a prop callback (`onPhoto`), or
  the internal state of a `@markless/ui` family (`selectState`, `toggleState`, `radiogroupState`).
- "Markup outside the root template, its @if arms and its @for rows" is a follow-on of other refusals on the same
  screen, as it was on 2026-11-18.
- checkin `/settings` also reports 14 handlers a phone runs only from a hardware keyboard. They are not refusals.

### Nothing open covers these yet (by screens blocked)

1. **A function called while rendering that needs a script engine** (`reduce`, `toString`, `JSON.stringify`), 8
   screens, 7 of them the shop's `itemCount`.
2. **A `<Link>` whose attribute follows a prop or state** (`aria-current` on a tab bar link, `href` from a prop), 7
   screens.
3. **`@try` around an async value that is not a device call** (a `fetch`-backed loader), with its `@catch` error read
   as text, 5 screens: every shop screen that loads data.
4. **A `@markless/ui` family whose value follows state** (`<toggle.root checked>`, `<radio-group.root value>`,
   `<select.root value>`), 1 screen (checkin `/settings`).
5. **Native `<select>`, `<option>`, `<textarea>` and the `selected` property binding**, 1 screen here (checkin
   `/new`), 2 more on notes behind the throw.
6. **A `<native.sheet>` behind `@if (!platform.web)`** is refused as "inside an @if arm", 1 screen (shop
   `/products/[id]`).

## Web defects found while writing the apps

Each was worked around in the app the way a web developer would, and none was fixed here: this job does not change the
framework. Each has an issue, ranked by how badly it would hurt a real app, and a reduced failing test pinned with
`test.fails` in #874, except #866: its test failed on macOS Chromium but passed on CI's Linux runner, so it is not pinned.

1. #863: an `@if (note)` arm keeps running its expressions after `note` turns undefined, so the page throws and never
   shows `@else`; on the server the same arm fails the render. The helpers called in the arm accept `undefined`.
2. #864: live text next to an element in a component's children never updates (found on `select.trigger`, but any
   component shows it). The chosen site shows beside the select.
3. #876: a page the router prefetched shows lists and totals derived from `storage()` as they were before a later write:
   after a delete the list still held the note, after adding to the bag the cart total was old. The apps set
   `router({ prefetch: false })`.
4. #865: a page reading `url.searchParams` from its `url` prop fails its server render. The app keeps the flag in state.
5. #866: `navigate()` right after a `storage()` write renders a page the router has not rendered yet from the old cookie:
   a new note showed "not found" until a reload. Each save waits one task (`setTimeout`) before navigating.
6. #867: `storage()` with one key in the tab bar (its own module) and in the page does not share the value: the badge
   stayed at 0. Each page owns the cart and passes the count down.
7. #868: `@empty` holding live text (`No notes match “{query}”`) does not appear when a filtered list becomes empty. A
   `hidden` paragraph shows the no-match text.
8. #869: an `@if` arm holding `<modal.root>` stops the build (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`). The modal sits
   outside the arm, opened by state.
9. #870: `state(defaultSite)`, a state initialised from a `storage()` value, fails the build with the internal
   `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`. Removed.
10. #871: `<select value={x}>` does not select the option in the server's HTML. The options carry `selected`.
11. #872: a `@for` key built from the row's own fields is refused as unstable (`MARKLESS_REPEAT_KEY_UNSTABLE`). Cart
    lines store their own key.
