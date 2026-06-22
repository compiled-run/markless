# Arcade

<p align="center">
  <img src="./assets/arcade-js-logo.png" alt="Arcade logo" width="180" />
</p>

Arcade is a UI framework for building web and native apps from one web-like
component model.

You write `.tsrx` files that look close to normal components: HTML-like
markup, JavaScript variables, and plain reads and writes. Arcade's compiler
records the important parts of that UI: state, text updates, events, and the
code that should run later.

Then Arcade can render that same model to different places:

- browser DOM for web apps;
- UIKit controls for iOS apps;
- AppKit controls for macOS apps;
- future native targets.

```tsx
import { state } from 'arcade';

export function Counter() @{
  let count = state(0);

  <button onClick={() => count++}>
    Clicked {count}
  </button>
}
```

Arcade turns that `.tsrx` file into:

- state, like `count`;
- text that depends on that state;
- events, like the button click;
- small code chunks that load only when needed.

On the web, Arcade turns this into HTML and DOM updates. The browser does not
rerun `Counter()`, rebuild a virtual tree, or hydrate the app. When the button
is clicked, Arcade loads the click code and updates only the text that depends
on `count`.

On native targets, Arcade can turn the same kind of model into real native
controls. The current proof fixtures show the counter driving iOS
`UIButton`/`UILabel` and macOS `NSButton`/`NSTextField` through JavaScriptCore.
Those proofs do not use Electron, Tauri, React Native, Capacitor, Ionic, or a
WebView.

In short:

```txt
Arcade .tsrx source
  -> Arcade state/events/text model
  -> web DOM
  -> iOS UIKit
  -> macOS AppKit
  -> future targets
```

## What It Is

- `.tsrx` components with familiar JavaScript reads and writes.
- Authoring APIs from `arcade`: `state`, `computed`, `shared`, and
  `element`.
- Compiler-owned state, payloads, and lazy code loading.
- One web-like authoring model that can target more than the browser.
- Target adapters for DOM, UIKit, AppKit, and future hosts.
- No hydration, no VDOM, and no client component replay.

## What This Does Not Mean

Arcade does not try to force one exact UI tree to work everywhere.

An app can have routes or screens that are shared across targets, and it can
also have routes or screens that are only for web, iOS, macOS, or another
target. Arcade gives those targets the same framework model: state, events,
async work, lazy code loading, and resumability. The target owns the real
controls. On the web that means DOM. On iOS that means UIKit. On macOS that
means AppKit.

## Resumability

On the web, Arcade is resumable. A server-rendered page can stay as HTML and CSS
until the user interacts with a handler, like clicking a button. Arcade then
executes only the code needed for that interaction.

## Status

Arcade is under active implementation. The specs are the behavior contract, and
production package work lives under `packages/*`.

The `poc/` tree contains proof fixtures and earlier proof packages. Treat it as
design evidence, not the public package surface.

Relevant native-rendering proofs:

- [`ios-native-rendering-target`](./poc/fixtures/proofs/ios-native-rendering-target/)
  proves Arcade's model can create UIKit controls, run click code through
  JavaScriptCore, and update native button text.
- [`macos-native-rendering-target`](./poc/fixtures/proofs/macos-native-rendering-target/)
  proves the same idea can create AppKit controls, run click code through
  JavaScriptCore, and update native button text.

These proofs validate the runtime idea. The next step is making the compiler
produce these target outputs automatically from one `.tsrx` source shape.

## Development

```sh
pnpm install
pnpm test
pnpm check
pnpm lint
pnpm fmt
pnpm build
```

Read these first when changing the repo:

- [CONTRIBUTING.md](./CONTRIBUTING.md) for the package map and workflow.
- [AGENTS.md](./AGENTS.md) for project rules.
- [specs/framework-design.md](./specs/framework-design.md) for the spec index.
