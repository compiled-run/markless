<p align="center">
  <img src="./assets/markless-mug.svg" alt="The Markless mug" width="150" />
</p>

<h1 align="center">Markless</h1>

<p align="center">
  <strong>Build for any device, the web way.</strong><br />
  Write elements and events in JavaScript. Markless is designed to compile them to any device.
</p>

<p align="center">
  <a href="https://markless.dev">Docs</a> ·
  <a href="https://markless.dev/start/new-app">Create an app</a> ·
  <a href="https://markless.dev/start/migrate">Migrate an app</a> ·
  <a href="https://markless.dev/how-it-works">How it works</a>
</p>

## What it looks like

```tsx
import { computed, state } from '@markless/core';

export default function Order() @{
	let mugs = state(1);
	const total = computed(() => mugs * 4);

	<section>
		<p>Mugs: {mugs}</p>
		<p>Total: {total} dollars</p>
		<button onClick={() => mugs++}>Add a mug</button>
		@if (mugs > 3) {
			<p>That is a lot of coffee.</p>
		}
	</section>
}
```

- `@{ }` is a component body. Statements come first, then the elements it shows.
- `{ }` inside the elements holds a value. When `mugs` changes, every spot that shows it, or `total`, changes too.
- Lines that start with `@` (`@if`, `@for`, `@switch`, `@try`) control which elements show.
- `mugs` is a plain `let`. You read it and assign to it like any variable.

[Reading a .tsrx file](https://markless.dev/start/reading-tsrx) walks through it line by line.

## What makes it different

**Compiled reactivity.** `state()` and `computed()` are plain function calls, with nothing else to mark up. The compiler reads your code at build time and works out which text, attribute or list each value feeds. The update graph is built before anything runs, so the browser never has to discover it. Nothing to mark is also where the name comes from.

**Resumable.** The server sends HTML that arrives already wired, and the browser picks up where the server left off without running your components again. A click loads only the code for that handler, and only the text that reads the changed value updates.

**Rendering is data, interactions are JavaScript.** The compiler turns what a page shows into data: the state, the planned updates, and where each one lands. Your event handlers stay JavaScript, split into small pieces that load when they are needed. Data can be drawn by any host, and that is why Markless is designed to render on any device.

## Where it runs today

| Target | Status |
| --- | --- |
| Web: browser, server rendering, streaming, tests | Works today. This is what ships on npm. |
| iOS (UIKit) and macOS (AppKit) | Early proofs. A hand-written counter drives real native buttons through JavaScriptCore, with no WebView. The compiler does not produce native output yet. See [native targets](https://markless.dev/how-it-works/native-targets). |
| Android, Windows, Linux | Not started. [Help us get there.](https://markless.dev/contributing) |

## Quick start

```sh
npm create markless@latest
```

Every question has a default, so pressing Enter is fine. Then run `npm run dev` in the new folder and open `localhost:3000`. [Create an app](https://markless.dev/start/new-app) covers the rest, including production builds and deploying.

## Migrate an existing app

[Markless Migrate](https://github.com/compiled-run/markless-migrate) moves a web app to Markless one page at a time. Your coding agent rewrites a page. Then a checker opens the old page and the new one side by side and compares what people see, what search engines get, what screen readers get, how fast it loads, and how each control behaves when it is used. A page switches over only once it matches the original.

It is a preview. These are work-in-progress ports of public sites, not official ones. JavaScript executed at page load, before and after:

| Port | Original | Markless |
| --- | --- | --- |
| shadcn/ui docs, home page | 1,660 kB | 143 kB |
| Docusaurus website | ~650 kB | ~107 kB |

More ports and their full reports: [markless.dev/start/migrate](https://markless.dev/start/migrate).

## Packages

| Package | What it is |
| --- | --- |
| [`@markless/core`](./packages/core) | What you write against: `state()`, `computed()`, `element()`, `shared()`, rendering, and the Vite plugin |
| [`@markless/router`](./packages/router) | File-based routes on [Nitro](https://nitro.build), with streaming server rendering and links that load the next page early |
| [`create-markless`](./packages/cli) | `npm create markless`, the app scaffolder |
| [`@markless/ui`](./packages/headless/components) | Headless, accessible components (work in progress) |
| [`@markless/vitest-browser`](./packages/vitest-browser) | Test components in a real browser with Vitest |
| [`@markless/typescript-plugin`](./packages/typescript-plugin) | Types and editor support for `.tsrx` files |
| [`@markless/analyzer`](./packages/analyzer) | Browser QA checks, with an optional Playwright driver |
| [`@markless/compiler`](./packages/compiler), [`runtime`](./packages/runtime), [`web`](./packages/web), [`serializer`](./packages/serializer), [`bundler`](./packages/bundler) | The internals behind `@markless/core`. You don't import these directly. |

## Contributing

```sh
pnpm install
pnpm test
pnpm run typecheck
```

Start with [CONTRIBUTING.md](./CONTRIBUTING.md) for the workspace layout and [markless.dev/contributing](https://markless.dev/contributing) for the guided version. Agent rules live in [`.ruler/`](./.ruler/) and are generated into `AGENTS.md` and `CLAUDE.md` with `pnpm rules`.

For editor support, install the TSRX extension (`ripple-ts.ripple-ts-vscode-plugin`). Apps made with `npm create markless` come with the editor settings already in place.

## License

[MIT](./LICENSE)
