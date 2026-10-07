# The Code component's browser compiler

`<Code>` (`../code.tsrx`) compiles the reader's edits in the browser. `compile-worker.ts` runs
`compile.ts`, which drives the Markless bundler's own resolve, load and transform hooks
(`bundle-host.ts`) over the block's files and the package source they import, so a component
from another `.tsrx` file or from `@markless/ui` links exactly as in an app build.
A block may hold several `.tsrx` files. The engine runs the first `.tsrx` in the `files` it is
given; `tooling/code-blocks.ts` puts the page's entry there (the first `.tsrx` fence, or the one
`<Code entry="name.tsrx">` names) and writes every file beside the generated block module, so
the site build prerenders the entry with its relative imports resolved.
`frame.ts` links every compiled module to a Blob URL; each `import()`, computed ones
included, goes through the run that linked it, and runtime imports go through a loader every
later run can still call.

`@markless/ui` families compile from the package source the worker bundles as text
(`worker-sources.ts`); the bundler reads it through the in-memory `source-fs.ts`. Import a
family as `import { accordion } from '@markless/ui'`; the compiler rejects family subpaths.
Icon tags such as `<lucide.plus />` need the `ui()` build plugin, which reads the Iconify data
under Node, so they do not run in a block. A block that calls `storage()` fails the site build (an open bundler
issue), and a block has no routes or server: it runs one component tree in the frame.

The compiler's parser, analyzer and printer are native addons, and the bundler's hooks import
`node:fs`, `node:url` and `vite`, so `tooling/code-client.ts` swaps each in the worker's
bundle: `source-fs.ts` and `bundler-shims.ts` for the Node and Vite imports, and a
WebAssembly build for each native addon:

| Native package        | Browser build                                                        |
| --------------------- | -------------------------------------------------------------------- |
| `@tsrx/yuku` 0.2.0    | `yuku-tsrx.wasm`, vendored here, read through `yuku-tsrx-binding.ts` |
| `yuku-analyzer` 0.9.1 | `@yuku-analyzer/wasm` 0.9.1, read through `yuku-analyzer-binding.ts` |
| `yuku-codegen` 0.9.1  | `@yuku-codegen/wasm` 0.9.1, read through `yuku-codegen.ts`           |

`wasm.ts` instantiates all three before the first compile. The published wasm bindings use
top-level await, which deadlocked the production chunk graph, so the bindings here read from
`wasm.ts` instead.

## `yuku-tsrx.wasm`

`@tsrx/yuku` publishes no WebAssembly build, so this file is vendored. It was built from the
`@tsrx/yuku` v0.2.0 source tree (https://github.com/tsrx-org/yuku), the version
`packages/compiler/package.json` pins, using that tree's wasm target (`src/ffi/wasm.zig`).
`yuku-tsrx-wasm.ts` packs the option flags the way that target reads them.

`tooling/code-wasm.test.ts` holds it to the native addon: for every `.tsrx` component in the
site, the wasm `parse` and `analyze` buffers must equal the addon's byte for byte. When the
compiler moves to a new `@tsrx/yuku` version, rebuild this file from the matching tag and run
that test.
