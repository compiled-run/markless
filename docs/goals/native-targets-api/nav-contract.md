# Native navigation: routes are screens (the contract)

Owner: native-nav (branch `cw/native-nav`, base `cw/native-targets`). Read `contract.md` first; this file adds navigation
to it and changes nothing there for a payload of one page. Status 2026-11-17.

## The rule in one paragraph

An app is its `pages/` folder, exactly as on the web. The router's own manifest (`buildRouteManifestFromFileIds`) names
each page's route and the match order; each page compiles to the `markless.native-view/0` page payload it already had;
the app payload lists them. Each route the person visits becomes one screen in the platform's own stack container
(`UINavigationController` on iOS, one `Activity` per screen in the task's back stack on Android), so the back gesture,
the back button and the transitions are the platform's. A screen keeps its views and its runtime while it is on the
stack. Nothing new is authored: `<Link>`, `navigate()`, `<title>` and `params` mean what they mean on the web.

## 1. How route facts reach the native payload

`compileNativeApp({ pages, readModule })` (`packages/mobile/src/compile.ts`) builds the router manifest from the page
file ids, compiles every page with `compileNativeComponent({ ..., manifest })`, and writes:

```json
{
  "version": "markless.native-app/0",
  "routes": [
    { "pattern": "/orders", "params": [], "page": { "version": "markless.native-view/0", "...": "" } },
    { "pattern": "/orders/[id]", "params": ["id"], "page": { "...": "" } }
  ]
}
```

- `routes` is in the router's match order (static segments before `[name]` segments). A host opens a path at the first
  route that matches it: a `[name]` segment takes one path segment, URL-decoded; any other segment matches itself
  (`matchNativeRoute`, `packages/mobile/src/app.ts`). Catch-all routes are not used yet.
- Each page's `route` and `params` are the ones `contract.md` already describes (rung 10).
- Links are checked at build time against the manifest: a `<Link href>` that is not a route of the app, or whose params
  are not that route's, is refused by name (`MARKLESS_NATIVE_UNSUPPORTED`).
- **The title.** A page's `<title>` element (the way a Markless page already sets `document.title`) lowers to the page
  payload's `title`, text parts like any text node (`[{ "text": "Order " }, { "expr": { "member": { "route": "params" },
  "property": "id" } }]`); it is not a view. More than one `<title>`, or one inside an `@if` arm or a `@for` row, is
  refused. Evidence that this is the right source: the router fixtures and the website set titles this way, the
  fragment navigator copies the incoming page's title to `document.title`, and the analyzer already had the `<title>`
  host node, so no new authoring and no new fact was needed. The web column checks `document.title` against the same
  `title` each step expects.
- Facts added to the analyzer for this (native builds only, behind `nativeFacts`): a component prop's value as an
  expression tree (`SemanticComponentPropBinding.nativeExpression`, so a link's `params={{ id: order.id }}` inside a row
  lowers), and a named call's arguments (`invoke.arguments`, so `navigate('/welcome', { replace: true })` lowers). The
  pass resolves `Link` and `navigate` through the module's import facts (`@markless/router`), never by name alone.
- Where route data comes from: **bundled**. Each page's payload, with every initial value, is built into the app, as
  the one-screen rungs are. Nothing is fetched. Pages that load data are async computeds, which stay refused (rung 11);
  fetching payloads or data from the server as the web does is an owner question (section 6).

## 2. What a navigation is in the update journal

- **Op** (in a page's handler): `{ op: 'navigate', route, params, replace? }`. `params` values are strings fixed at
  build time or, new, expressions (`NativeExpr`) the host evaluates when the op runs, in the scope of the element that
  was activated (a row's item for a link inside a `@for` row). `replace: true` comes from `<Link replace>` or
  `navigate(path, { replace: true })`. `navigate(path)` with a path fixed at build time is resolved against the
  manifest at build time into `route` + `params`, so hosts see one op form. Ops after a `navigate` do not run.
- **Journal entry** (what the host applies): `{ op: 'navigate', route, params, replace? }` with every param a string.
  The host builds the page for `route` from scratch with those params and pushes it as a new screen (or, with
  `replace`, puts it in the top screen's place).
- **Title entry** (new): `{ op: 'title', value }`, last in a journal, when a handler changes the page's title text. The
  host writes it to its screen's navigation bar title.
- **Back is not a journal entry.** It is the platform's own action: the host pops the top screen and the screen below
  appears exactly as it was left. Nothing re-runs and nothing is journalled (the reference runtime's `back` returns an
  empty journal; the reference column checks it).
- **Row instances as action hosts** (new): an action on an element inside a list row names the instance, `<node>@<key>`
  (the id hosts already give row views). The runtime runs the handler with that row's item in scope.

## 3. How a back-stack entry is kept

- An entry is `{ route, params, path, runtime }` plus the platform's retained views (`NativeScreen`,
  `packages/mobile/src/app.ts`). Its runtime and views stay alive while the entry is on the stack, so its state (a counter,
  a reversed list) is as it was left when it is shown again. Storage cells share one device store across screens.
- **Opening at a path** (launch or deep link): the stack is every leading part of the path that is itself a route,
  shortest first, ending with the path (`nativeBackStack`). In an app with `/`, `/orders` and `/orders/[id]`,
  `/orders/42` opens three deep; Back walks up. This is the platform convention (Android's synthesized back stack, an
  iOS app restoring its hierarchy) expressed with nothing but route facts. A path that is not a route is a host error.
- On the web the same Back restores the page from the server HTML the router cached, so a page's state starts over and a
  browser opened at a link has nothing behind it. The ladder states both differences per step (`onWeb` with a `why`),
  and the web column is held to what the web actually does there.

## 4. What the host must do

Both hosts:

- Decode `markless.native-app/0` beside `markless.native-view/0`. A single page payload behaves as before (no stack, no
  bar), so rungs 1 to 10 are unchanged.
- Match a path against `routes` in order (section 1). Open the back stack for the launch path (section 3).
- Wire `activate` on elements inside rows, dispatching with the instance id.
- Apply `navigate` (push or replace), `title`, and leave Back to the platform, keeping each screen's views and runtime.
- Show the page's title in the system navigation bar.
- Pass the conformance vectors in `packages/mobile/conformance/navigation.json` (`markless.native-app-conformance/0`):
  the stack (paths), title and texts after each action, Back included.

iOS (`MarklessNavigationController`): a `UINavigationController` whose view controllers are `MarklessViewController`s,
one per stack entry; `navigationItem.title` from the page title; push with `pushViewController`, replace with
`setViewControllers`; the system back button and the interactive pop gesture pop. The scene opens a deep link from
`UIOpenURLContext` (`markless-proof://app/<path>`), at launch or while running.

Android (`MarklessActivity` with an app payload): one `Activity` instance per screen, the path in the intent extra
`route` (or the deep link's data URI). The window gets the platform action bar (title, and the Up arrow below the
first screen); push is `startActivity`, replace is `startActivity` then `finish()`; the system back button and back
gesture finish the top activity, and the one below resumes with its views untouched. A deep link opening at a path
starts the whole synthesized stack with `startActivities` and a cleared task. The activity declares the configuration
changes it handles itself (rotation, screen size), so a rotation does not rebuild it and lose its state; a process
the system kills while in the background starts its screens over (saving runtimes across process death is not built).

## 5. Ladder (navigation rungs)

Folders `packages/mobile/proofs/n<n>-<name>/`, each an app (`pages/`), `expected.json`, `flow.yaml` (written from it),
screenshots. Columns as in `contract.md` section 5.

| # | Rung | Web | Native reference | iOS | Android | Ran as data |
|---|---|---|---|---|---|---|
| N1 | Two routes; a link pushes; back gesture and back button return; first screen's state as left | passing, with Back measured as different: the counter reads `Taps 0` after Back (`onWeb`) | passing | **passing** | **passing** | the counter's ops and the link's `navigate` op; push and Back are the platform's stack, no data needed |
| N2 | `/orders/[id]` from a keyed list after reversing it; title in the navigation bar | passing (`document.title`); Back restores the list in its server order (`onWeb`) | passing | **passing** | **passing** | the reverse is an `assign` op; the row link's param is an expression over the row item, evaluated on tap; the title is text parts over `params` |
| N3 | `navigate()` from a handler: push, then `{ replace: true }` | passing | passing | **passing** | **passing** | `navigate(path)` resolved at build time to `route` + `params`; `replace` is a flag on the op |
| N4 | Opening at a deep link (`markless-proof://app/orders/42`): `Order 42` with Orders and Shop below it | passing up to Back, which leaves the site as a browser does (`onWeb`, `leaves`) | passing | **passing** | **passing** | the stack is derived from route facts; iOS shows its own "Open in Proof?" confirmation the first time a scheme is opened, which the flow taps when shown |
| N5 | A modal sheet | not built: owner decision (section 6) | | | | |

Vectors both hosts pass headless: `navigation.json` (N2's app), `navigation-replace.json` (N3), `navigation-deep-link.json` (N4):
Swift `swift test` 22 tests (3 navigation vectors, 10 one-page vectors); Kotlin `test-jvm.sh` 254 checks, 0 failed.

"Needed more than data": nothing. Every handler on these rungs ran as ops; the stack itself is the platform's container,
which is host code by design (as view building is), not something the payload describes.

## 6. Not built, with options

### N5: a modal sheet

Routes today say nothing about presentation: a page file exports only its component, the router reads no route
metadata, and there are no intercepting, parallel or grouped routes. So a sheet cannot be expressed with what routes
already say, and per the brief this stops here. The smallest options, each in code:

1. **A `<Link>` / `navigate()` option, as `replace` already is.** One new value on an existing call; the route stays a
   plain page; the web ignores it (a normal navigation) or opens a `<dialog>`.
   ```tsrx
   <Link href="/orders/[id]/edit" params={{ id }} present="sheet">Edit</Link>
   navigate(`/orders/${id}/edit`, { present: 'sheet' });
   ```
2. **A page that is a sheet wherever it is opened**: one route-file export the router reads.
   ```tsrx
   export const presentation = 'sheet';
   export default function EditOrder({ params }: PageProps<{ id: string }>) @{ ... }
   ```
3. **No route at all: the HTML `<dialog>` the page already can render**, which a native host presents as a sheet
   (`UISheetPresentationController`, an Android `Dialog`). Needs `dialog` as a portable element and its open state as
   a cell; nothing new for routes.
   ```tsrx
   let editing = state(false);
   @if (editing) { <dialog open><EditForm onDone={() => (editing = false)} /></dialog> }
   ```

### Tabs

A tab bar is several stacks side by side, each with its own back stack (`UITabBarController` of
`UINavigationController`s; Android's bottom navigation with one stack per tab). Routes say nothing about which routes
are tabs, so like a sheet it needs one owner decision. Options:

1. **Top-level routes are tabs when the app opts in**, in one app-level place the router already owns (the document
   or the Vite plugin options): `markless({ native: { tabs: ['/', '/orders', '/account'] } })`. No page changes; the web
   keeps its links.
2. **A tab bar is markup**: the document renders `<nav>` with `<Link>`s the native build recognises as the tab bar
   (one per top-level route), so the web's nav bar and the phone's tab bar are the same source.
   ```tsrx
   <nav>
   	<Link href="/">Shop</Link>
   	<Link href="/orders">Orders</Link>
   </nav>
   ```
3. **A route-file export per tab root** (`export const tab = { label: 'Orders', icon: 'bag' }`), the same kind of
   route metadata as sheet option 2.

Platform differences inside a tab (icons) would be plain conditionals over `platform` from `@markless/device`
(`cw/device-slice`), not new grammar.

## 7. Receipts

One harness run per platform on tree `25aa26c93` (mini-2; simulator `markless-nav`, iPhone 17 on iOS 27.2; AVD
`markless_nav`, Pixel 7, API 36, gesture navigation), all four navigation rungs plus the fourteen one-screen rungs
(1, 2, 3, 4, 5, 5b, 6, 7, 7b, 7c, 7d, 8, 9, 10) to show the hosts' changes broke none of them: 18 of 18 on each, verdict
"proof passed on iOS and Android". Reports: `receipts/2026-11-17-nav-*.json`, `receipts/2026-11-17-nav-verdict.txt`.
Screenshots: `packages/mobile/proofs/n<n>-<name>/screenshots/{ios,android}/`. Devices were shut down after the run.

What is real and what is a stand-in: the compiler, the router's manifest, the web build (Chromium, production server),
the iOS simulator and the Android emulator with the real hosts are real. The deep link is a real URL opened by the system
(`simctl openurl` / an Android VIEW intent through Maestro's `openLink`). The reference column is the TypeScript runtime
with a mirror host, not a device. Nothing is a test double on devices.
