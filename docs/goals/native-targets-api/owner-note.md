# Native targets: where things stand (for Jack)

Night one, 2026-11-16 to 17. The technical contract is `contract.md` beside this file; this page is the short version.

## What is truly shared

- **One compiler, one analysis.** The same compiler that builds the web app now also emits a native view description for
  iOS and Android: the elements, their text, the state, which element fires which event, and what each handler does,
  written as a small expression tree with JavaScript's meaning (`count = count + 1`, `name = event.target.value`,
  `visits = String(Number(visits) + 1)`). Nothing is parsed out of HTML, and the web output is byte for byte what it was.
  Anything outside that tree (a call to your own function, `await`, a loop) is a build error naming the construct; that
  list is how we will know when a phone needs a JavaScript engine.
- **One meaning of updates.** A small reference runtime (TypeScript, in `packages/mobile`) defines what happens when a
  handler runs: which state changes and which on-screen texts change, in what order. It writes test files ("after this tap,
  this text reads Count 1") that the Swift host and the Kotlin host must both reproduce exactly.
- **One styling compiler.** The component's CSS, the same scoped CSS the web build ships, goes to Dragon, which turns it into
  per-platform view properties and box positions at build time. Nothing on the phone reads CSS.

## What differs between iOS and Android, and why

- **Which native view an element becomes** (a `UIButton` versus an Android `Button`). Each platform has its own controls, and
  accessibility comes from using the real ones. Android's `Button` cannot hold child views, so a button's text is the
  button's own text there; iOS puts a label inside.
- **How a tap reaches the handler** (`touchUpInside` versus a click listener). The data says "activate"; each platform wires
  its own event to it.
- **Units and fonts.** iOS lays out in points, Android in physical pixels at 2.625 per dp on the test phone; fonts are
  registered differently. Dragon emits one style file per device for this reason.
- **The update code itself is written twice** (Swift and Kotlin) because the ruling is no JavaScript engine for handlers that
  are just data. The shared test files are what keep the two from drifting.

## Your picture, checked against the repo

"Most things carry over: elements become the native view that makes most sense, CSS goes through Dragon, state and storage
are intent compiled to data." This holds for elements, text, events and simple state writes (shown tonight), and for CSS
(Dragon already produces both platforms' properties and matches Chrome's boxes). It does not hold yet for: handlers that
call author code or await (a fetch, a helper function), which need either a declared data source or a script engine; layout after a
text change (the phone does not re-run layout yet); and the headless component library, which reaches into about 25
browser-only globals today (see "Headless components" below).

## Where the ladder stands

Eleven small real components, each run by the same Maestro flow on the iOS simulator and the Android emulator, with the
web build as the reference. A rung counts only when both phones pass.

The compiler now lowers rungs 1 to 10 (static text, styles, a counter, attributes and classes, `@if`, keyed lists, child
components with callbacks, text input, storage, a route param and a link to another route); a checker that changes what
it shows only through the update journal agrees with the web build on every step of all ten. Rung 11 (an async value)
stops on purpose: the value comes from your own JavaScript, and how a phone runs that is your call (below). On devices, rung 1 passes on both phones through one command; the
two phone hosts are catching up to the payload (Android reports rungs 1 to 5 and 9 green on the emulator; iOS is moving
to the new expression form). The contract note's ladder table has the exact status and the check behind each cell.

## What the compiler must learn next

An app's whole route table (several pages, back stack, how a page is presented), then async values (rung 11, needs your
decision below). After that: state inside child components (one set of cells per
instance), `{children}`, components imported from other modules, `@switch` and `@else if`, and re-running layout on the
phone when text changes (linking Dragon's layout engine on the device).

## Device features (camera, location, notifications)

Full research: `capabilities-research.md` (draft PR #733). Three options:

1. **A typed TypeScript capabilities package** (`@markless/device`): `await location.current()`, a `<Camera>` element,
   `haptics.tap()`. Compiler: learns which features a route reaches, writes the iPhone and Android permission entries,
   refuses a build missing a usage description. Hosts: one native module per feature. Script engine: not needed for calls
   whose result just lands in state; needed if a handler then computes on the result.
2. **Web standards only** (`<input type="file" capture>`, `navigator.geolocation`): nothing new to learn, but phones would have
   to emulate imperative browser APIs, and haptics, biometrics and phone notifications have no settled standard.
3. **Expo or Capacitor style plugins with explicit permission calls**: proven, but every author learns a permission API the
   web model ("calling the feature asks") makes unnecessary.

**Recommendation: option 1, using web standards where one is settled.** Because the compiler can then see exactly which
features each route uses and write the permission files itself, and authors never write a permission request.

## Headless components (@markless/ui) on phones

Full assessment: `headless-cross-platform.md` (draft PR #735). The design fits: families use handles, `ui-*` and ARIA
attributes, and one overlay primitive. What is web-only today: about 25 direct uses of `document.activeElement`,
`window.setTimeout`, `getComputedStyle`, `instanceof HTMLElement`, synthetic `PointerEvent`s and similar. A native host must
supply roles and states from ARIA, labels, focus (two kinds on a phone), screen-reader gestures mapped to the key and
dismiss events families already handle, and a synchronous read of an element's last drawn position inside a handler. The
`<style>` defaults under `@layer markless` go through Dragon like any other CSS. **Smallest first family: `toggle`.**

## Decisions I need from you

**How Markless gets Dragon.** Recommendation: publish Dragon as a `1.0.0-alpha` prerelease and depend on it, because until
then a native build needs a Dragon checkout beside Markless and CI cannot style native builds.

**Device features.** Recommendation: option 1 above (typed `@markless/device`, web standards where settled), because the
compiler can derive permissions and authors never write one.

**Platform differences in app code.** Recommendation: leave it unbuilt until a ladder rung needs it, because nothing so far
does, and the `target` constant is still a new authoring idea that needs your sign-off.

**Async values on the phone (rung 11).** Recommendation: decide after rung 10, because both options are real: the
compiler recognises a declared fetch (a URL template and a JSON path) and the phone runs it as data, or a JavaScript engine
runs only async computeds. The first keeps "no engine" and covers most screens; the second covers everything at the cost
of shipping an engine.

**Where phone tests run.** Recommendation: on a schedule on a macOS runner (as Dragon does), not on every pull request,
because simulator plus emulator runs take minutes and need a Mac.
