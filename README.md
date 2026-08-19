# Markless

<p align="center">
  <img src="./assets/markless-logo.png" alt="Markless logo" width="200" />
</p>

Markless is a UI framework for building web and native apps from one web-like
component model.

You write `.tsrx` files that look close to normal components: HTML-like
markup, JavaScript variables, and plain reads and writes. Markless's compiler
records the important parts of that UI: state, text updates, events, and the
code that should run later.

Then Markless can render that same model to different places:

- browser DOM for web apps;
- UIKit controls for iOS apps;
- AppKit controls for macOS apps;
- future native targets.

```tsx
import { state } from '@markless/core';

export function Counter() @{
  let count = state(0);

  <button onClick={() => count++}>
    Clicked {count}
  </button>
}
```

Markless turns that `.tsrx` file into:

- state, like `count`;
- text that depends on that state;
- events, like the button click;
- small code chunks that execute only when needed.

On the web, Markless turns this into HTML and DOM updates. The browser does not
rerun `Counter()`, rebuild a virtual tree, or hydrate the app. When the button
is clicked, Markless executes the click code and updates only the text that depends
on `count`.

On native targets, Markless can turn the same kind of model into real native
controls. The current proof fixtures show the counter driving iOS
`UIButton`/`UILabel` and macOS `NSButton`/`NSTextField` through JavaScriptCore.
Those proofs do not use Electron, Tauri, React Native, Capacitor, Ionic, or a
WebView.

In short:

```txt
Markless .tsrx source
  -> Markless state/events/text model
  -> web DOM
  -> iOS UIKit
  -> macOS AppKit
  -> future targets
```

## What It Is

- `.tsrx` components with familiar JavaScript reads and writes.
- Authoring APIs from `@markless/core`: `state`, `computed`, `shared`, and
  `element`.
- Compiler-owned state, payloads, and lazy code execution.
- One web-like authoring model that can target more than the browser.
- Target adapters for DOM, UIKit, AppKit, and future hosts.
- No hydration, no VDOM, and no client component replay.

## What This Does Not Mean

Markless does not try to force one exact UI tree to work everywhere.

An app can have routes or screens that are shared across targets, and it can
also have routes or screens that are only for web, iOS, macOS, or another
target. Markless gives those targets the same framework model: state, events,
async work, lazy code execution, and resumability. The target owns the real
controls. On the web that means DOM. On iOS that means UIKit. On macOS that
means AppKit.

## Resumability

On the web, Markless is resumable. A server-rendered page can stay as HTML and CSS
until the user interacts with a handler, like clicking a button. Markless then
executes only the code needed for that interaction.

## Status

Markless is under active implementation. The specs are the behavior contract, and
production package work lives under `packages/*`.

The `poc/` tree contains proof fixtures and earlier proof packages. Treat it as
design evidence, not the public package surface.

Relevant native-rendering proofs:

- [`ios-native-rendering-target`](./poc/fixtures/proofs/ios-native-rendering-target/)
  proves Markless's model can create UIKit controls, run click code through
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

## Editor support

For VS Code, install the upstream TSRX extension, which owns the `.tsrx` language
id, syntax highlighting, and the TSRX language server:

```sh
code --install-extension ripple-ts.ripple-ts-vscode-plugin
```

`.vscode/extensions.json` already recommends it, so VS Code offers to install it
when you open this repository. Markless no longer ships its own extension; if you
sideloaded an earlier build, remove it (`code --uninstall-extension markless.markless`)
so two extensions do not contend for `.tsrx` files.

The Markless-specific editor behaviour is wired through `tsconfig.json` rather
than through an extension: the top-level `tsrx.compiler` key points the TSRX
language server at `@markless/typescript-plugin/volar`, and the
`compilerOptions.plugins` entries load `@markless/typescript-plugin` and
`@markless/router/typescript-plugin` into TypeScript's own language server.
Zed reads the same plugins through `.zed/settings.json`. Apps created with the
CLI ship both editor configurations.

Read these first when changing the repo:

- [CONTRIBUTING.md](./CONTRIBUTING.md) for the package map and workflow.
- [AGENTS.md](./AGENTS.md) for project rules.
- [specs/framework-design.md](./specs/framework-design.md) for the spec index.

## Agent Guidance

AI agent rules, skills, and MCP config are sourced from [`.ruler/`](.ruler/) and
generated with [Ruler](https://github.com/intellectronica/ruler) via `pnpm rules`.
`AGENTS.md`, `CLAUDE.md`, and the per-agent skill copies are generated files —
edit `.ruler/` instead and rerun `pnpm rules`. CI and the pre-commit hook fail
when generated files drift from their sources.
