# The Code component's browser compiler

`<Code>` (`../code.tsrx`) compiles the reader's edits in the browser. `compile-worker.ts` runs
`compile.ts`, which calls the Markless bundler's own `transformTsrxModule`. The compiler's
parser, analyzer and printer are native addons, so `tooling/code-client.ts` swaps each one for
a WebAssembly build in the worker's bundle:

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
