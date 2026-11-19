# Yardstick apps

Three small apps written the way a web developer who knows React would write a Markless app today: for the web first,
with public APIs only (`@markless/core`, `@markless/router`, `@markless/ui` families, `@markless/device` behind
`platform` checks, plain CSS). They were not shaped around what the native compiler accepts. They are test material
for one number: how many screens of a realistic app build for phones and match the web.

| App | Screens | What it exercises |
| --- | ---: | --- |
| `notes/` | 6 | list, search, create and edit forms, delete with a confirm modal, `storage()`, empty state, tags |
| `shop/` | 7 | tab bar with a cart badge, product cards with images from local JSON API routes, detail, options in a bottom sheet (`native.sheet` on phones, `drawer` on the web), refresh, loading and error states with `@try`/`@pending`/`@catch`, cart, order |
| `checkin/` | 5 | camera, location and share (`@markless/device` on phones, browser APIs on the web), photo upload, settings with switches, radio groups and a select, permission-denied states, appearance setting |

Each app has a web font, flex and grid layout, a `min-width: 700px` tablet layout, `:active` and `:focus-visible`
styles, and dark mode.

## Headline

Screens that build for phones and match the web, out of all screens (`cw/native-integration` at `3babf6ff2`,
2026-11-18):

| App | Build and match | Build |
| --- | ---: | ---: |
| notes | 0 of 6 | 0 of 6 |
| shop | 0 of 7 | 0 of 7 |
| checkin | 0 of 5 | 0 of 5 |
| **All** | **0 of 18** | **0 of 18** |

No screen builds, so none ran on a phone. On the branch of #829 (JavaScript fallback), 3 of 18 build: notes `/tags`,
checkin `/` and `/checkins/[id]`. No other open native PR makes a screen build on its own.

## How it is measured

- Web reference: `test/apps-web.test.ts` builds each app with the router, serves it from its production server and
  walks it in Chromium at 402 by 778, once in light and once in dark (`<app>/walk.ts`). It runs in the `native-web`
  Vitest project (`pnpm exec vp test run --project native-web`), the ladder's web column in `mobile-hosts.yml`, not in
  the unit shards. `MARKLESS_YARDSTICK_SCREENSHOTS=<dir>` saves a screenshot at each step.
- Native: `node packages/mobile/apps/measure.ts --out packages/mobile/apps/yardstick.json` compiles each app's pages
  with `compileNativeApp` (with `document.tsrx`, the workspace module reader and stylesheets) and records, per screen,
  whether it builds and every error diagnostic (code, message, file, line). `yardstick.json` is that output.
- Ranking: `node packages/mobile/apps/rank.ts yardstick.json [#<pr>=<report.json> ...]` groups refusals by code and
  message, with the names a message quotes between backticks and node ids left out (so "the function `parseNotes`" and
  "the function `parseCheckIns`" are one refusal), and counts the screens each blocks. With branch reports (the same
  `measure.ts` run on a PR's head), it lists on which branches a refusal no longer appears on a screen.

Branches measured (heads on 2026-11-18): #827 `6f5fde5b7`, #829 `ae9c33173`, #834 `889970021`, #839 `bce695aa8`,
#841 `850bab41b`, #845 `69a18fab0`, #849 `f2a7f466b`. #841 to #850 are one stack: #842, #843, #844, #846, #847, #848 and
#850 remove nothing beyond what the first branch below them removes, so the table names #841, #845 and #849.

## Refusals, ranked by screens blocked

| Screens blocked | Refusal | Removed on these branches (screens) |
| ---: | --- | --- |
| 14 | MARKLESS_NATIVE_UNSUPPORTED: markup outside the root template, its @if arms and its @for rows | #829 (6) |
| 9 | MARKLESS_NATIVE_UNSUPPORTED: the `…` prop of <Shell> | none |
| 8 | MARKLESS_NATIVE_UNSUPPORTED: a <Link> whose href or class is not fixed at build time, or whose params are not strings this build can compute | none |
| 5 | MARKLESS_NATIVE_UNSUPPORTED: a @try that neither reads a device value nor holds a handler that awaits a device call | #829 (5) |
| 5 | MARKLESS_NATIVE_UNSUPPORTED: a text expression reads the @catch error of a @try that reads no device value | none |
| 5 | MARKLESS_NATIVE_UNSUPPORTED: the function `…` uses a TryStatement, which needs a script engine | #829 (5) |
| 4 | MARKLESS_NATIVE_UNSUPPORTED: @for inside an @if arm or another @for | none |
| 4 | MARKLESS_NATIVE_UNSUPPORTED: the click handler on an element this build does not show | #829 (2) |
| 4 | MARKLESS_NATIVE_UNSUPPORTED: the computed `…` uses a call to `…`, which needs a script engine | #829 (4) |
| 3 | MARKLESS_NATIVE_UNSUPPORTED: the function `…` uses a call to `…`, which needs a script engine | #829 (1) |
| 2 | MARKLESS_DEVICE_USAGE_MISSING: camera needs usage text for NSCameraUsageDescription; add device.usage.camera to the app config | none |
| 2 | MARKLESS_DEVICE_USAGE_MISSING: location needs usage text for NSLocationWhenInUseUsageDescription; add device.usage.location to the app config | none |
| 2 | MARKLESS_NATIVE_ELEMENT: the <option> element has no native view yet | none |
| 2 | MARKLESS_NATIVE_ELEMENT: the <select> element has no native view yet | none |
| 2 | MARKLESS_NATIVE_ELEMENT: the <textarea> element has no native view yet | #845 (2), #849 (2) |
| 2 | MARKLESS_NATIVE_UNSUPPORTED: a property binding (`…`) | none |
| 2 | MARKLESS_NATIVE_UNSUPPORTED: a text expression reads the async value `…`, whose body is not one device call; it needs a script engine | none |
| 2 | MARKLESS_NATIVE_UNSUPPORTED: the click handler is defined elsewhere (a named or factory function) | #829 (2) |
| 2 | MARKLESS_NATIVE_UNSUPPORTED: the click handler reads `…`, which is not state of this component | #829 (2) |
| 2 | MARKLESS_NATIVE_UNSUPPORTED: the click handler uses a call to `…`, which needs a script engine | #829 (2), #834 (2) |
| 2 | MARKLESS_NATIVE_UNSUPPORTED: the dismiss event has no native meaning yet | #834 (2) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: <base.camera> needs el={…} naming a camera the component made, and no other props | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: a <native.sheet> inside an @if arm or a @for row | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: a text expression through `…` uses a call to `…`, which needs a script engine | #829 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: ModalRoot while rendering sets `…` from a value that follows state; pass a fixed value or leave the prop out | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: RadioGroupRoot while rendering sets `…` from a value that follows state; pass a fixed value or leave the prop out | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: SelectItem while rendering sets `…` from a value that follows state; pass a fixed value or leave the prop out | #849 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: SelectRoot while rendering sets `…` from a value that follows state; pass a fixed value or leave the prop out | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the `…` attribute reads the async value `…`, whose body is not one device call; it needs a script engine | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the `…` prop of <Shell> through `…` uses a call to `…`, which needs a script engine | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the `…` prop of <toggle.root> | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the <button> # in the <form> # sits in an @if arm or @for row of its form, which a native build does not submit yet | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the <input> # in the <form> # has `…`, which the web checks before a submit and no native host checks yet | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the change handler reads `…`, which is not state of this component | none |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the click handler awaits inside an expression; a native build awaits only the whole value of a statement | #829 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the click handler calls `…` inside an expression; call it as a handler statement or as an async computed's body | #829 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the click handler calls `…` with something other than a callback and a delay | #829 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the click handler reads the async value `…`, whose body is not one device call; it needs a script engine | #829 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the focus event has no native meaning yet | #841 (1), #845 (1), #849 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the input handler on an element this build does not show | #829 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the keydown event has no native meaning yet | #841 (1), #845 (1), #849 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the pointerdown event has no native meaning yet | #834 (1) |
| 1 | MARKLESS_NATIVE_UNSUPPORTED: the pointerup event has no native meaning yet | #834 (1) |

Reading the table:

- "Removed" means the message no longer appears on that screen on the branch. It can come back reworded. On #829, "a
  @try that neither reads a device value nor holds a handler that awaits a device call" becomes "... awaits (a device
  call, or JavaScript)" on the same 5 screens, so it is still refused there. The `<textarea>` element refusal becomes "the
  `<textarea>` in the `<form>`, whose text a native build does not submit yet" on #845.
- Some refusals follow from others. "Markup outside the root template, its @if arms and its @for rows" is the largest
  (14 screens) but is a follow-on: on notes `/tags`, replacing the one function that uses `try` removed both it and
  the function's refusal, and the page built. "The click handler on an element this build does not show" is the same
  kind. #829 clears them where it clears their cause.
- #829 makes some refusals visible that were hidden behind others. On its branch, "@for inside an @if arm or another
  @for" blocks 4 more screens, a handler that calls `navigate` from `@markless/router` or a `@markless/device`
  function inside JavaScript is refused on 2 and 1 screens, and the submit handlers of notes `/new` and checkin `/new`
  stay refused ("awaits inside ... a called function").
- The `<Link>` refusal on all 7 shop screens is `aria-current={...}` on the tab bar's links: an attribute that follows a
  prop. Its message names only `href` and `class`. On notes `/new` it is `href={cancelHref}` from a prop.

### Nothing open covers these yet (by screens blocked)

1. **A child component's prop that follows state or a route param** (`title`, `count` of the app's `Shell`), 9 screens.
2. **A `<Link>` whose attribute follows a prop or state** (`aria-current` on a tab bar link, `href` from a prop), 8
   screens.
3. **`@try` around an async value that is not a device call** (a `fetch`-backed loader), with its `@catch` error read
   as text, 5 screens: every shop screen that loads data. #829 rewords it and still refuses it.
4. **`@for` inside an `@if` arm, a `@try` arm or another `@for`**, 4 screens (8 on #829's branch).
5. **What `compileNativeApp` cannot be told**: it takes no target and no app config. A `<native.sheet>` behind
   `@if (!platform.web)` is refused as "inside an @if arm" (1 screen), and camera and location are refused for missing
   iOS usage text although `checkin/app.json` has it (2 screens). Native `<select>`/`<option>` and the `selected`
   property binding come next, 2 screens each.

## Web defects found while writing the apps

Each was worked around in the app the way a web developer would, and none was fixed here: this job does not change the
framework. Each has an issue, ranked by how badly it would hurt a real app, and a reduced failing test pinned with
`test.fails` in #874.

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
