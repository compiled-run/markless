# Arcade

<p align="center">
  <img src="./assets/arcade-js-logo.png" alt="Arcade logo" width="180" />
</p>

Arcade is a UI framework that ships HTML first and waits to run page code until
a user interacts with that part of the page, like a click.

The syntax is meant to feel like a familiar component framework, but the
compiler and browser handle resume automatically from saved state. You do not
manage serialization or draw boundaries by hand.

```tsx
import { state } from '@arcade/core';

export function Counter() @{
  let count = state(0);

  <button onClick={() => count++}>
    Clicked {count}
  </button>
}
```

Arcade turns that `.tsrx` file into:

- Initial HTML.
- Graph state for values like `count`.
- A map of which HTML nodes may need updates.
- Small code chunks that run only when they are needed.

On startup, the browser reads the saved payload and installs a small delegated
listener layer. It does not rerun `Counter()`, rebuild a virtual tree, or hydrate
the app. When the button is clicked, Arcade loads the click code and updates
only the DOM that depends on `count`.

## What It Is

- `.tsrx` components with familiar JavaScript reads and writes.
- Authoring APIs from `@arcade/core`: `state`, `computed`, `shared`, and
  `element`.
- Compiler-owned state graph, payloads, and lazy symbols.
- No hydration, no VDOM, and no client component replay.

## Status

Arcade is under active implementation. The specs are the behavior contract, and
production package work lives under `packages/*`.

The `poc/` tree contains proof fixtures and earlier proof packages. Treat it as
design evidence, not the public package surface.

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
