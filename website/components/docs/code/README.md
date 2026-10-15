# The Code component's browser editor and compiler

## The editor

Each file is a server-rendered `<textarea readonly>` over the build's highlighted `<pre>`, both in
one grid cell (`../code-files.tsrx`): the `<pre>` sets the size, the textarea is transparent text
with a visible caret, and the pane around both scrolls. A reader's first point at or focus into the
block calls `bootCodeBlock` (`session.ts`), the one entry point every trigger uses. It wires the
header's Run again, Reset, line numbers, edit and full screen buttons, loads the
highlighter, and removes `readonly`.

`editor.ts` repaints the `<pre>` on each input with `highlight.ts`: shiki's core on its JavaScript
regex engine, with the same github-light/github-dark pair, the site's `tsrx` grammar and the same
surface pass (`tooling/shiki-surface.ts`) as the build. Dark mode stays a CSS swap. Tab, Shift+Tab,
Enter, Backspace and closing pairs are pure functions in `edit-commands.ts`, ported from shikicode
(MIT, https://github.com/magic-akari/shikicode); the editor applies them through
`execCommand('insertText')`, so the browser's own undo keeps every edit. Escape then Tab leaves
the editor. A build error marks its line and prints its first sentence at the line's end; the
problem list under the result jumps to the line with `setSelectionRange`.

## The compiler

`<Code>` (`../code.tsrx`) compiles the reader's edits in the browser. A docs page has one
compile worker (`compile-worker.ts`), started by the first block that boots and shared by every
block on the page. Each request names its block: the worker keeps only each block's newest edit,
compiles the block that edited most recently first, and places each block's files in their own
folder (`/code/<block>/`), so blocks with the same file names never collide. The package source
one compile reads stays loaded for the next. Every block that boots without a saved or typed
edit sends its starter as a warm-up: the worker runs warm-ups only when no block has an edit
waiting, drops a block's warm-up once that block sends an edit, and the hidden frame links and
renders the result so the first real edit finds it ready. The worker runs `compile.ts`, which drives the Markless bundler's own resolve,
load and transform hooks (`bundle-host.ts`) over the block's files and the package source they import, so a component
from another `.tsrx` file or from `@markless/ui` links exactly as in an app build.

Compiles are incremental, the way a dev server's are. Each block keeps one compiler
(`createBlockCompiler`) for its whole life: one bundler state, one dev graph, one build id, and
each module's last build with what it was built from (its loaded text, the resolves its hooks
asked for, the text of every file they resolved or watched, and the code of every module they
loaded). Before a compile, each edited file goes through the bundler's own dev invalidation
(`invalidateEditedGeneratedModules` for an edited `.tsrx`, `invalidateAllGeneratedModules` for
the `.tsrx` files importing any other edited file), and the modules it names are rebuilt. A
module whose recorded inputs all read the same again returns its last code without running the
transform hook. A compile that fails leaves nothing half-built: the builds it started finish
first, and the files whose transform threw are invalidated before the next compile.
In the worker, package source arrives as the bundler first asks for it, so a synchronous read
of a file not loaded yet misses: the file is loaded, and only the modules that were building
when a read missed are built again.

The editor sends a compile on each keystroke when its block has none in flight; text typed
while one is in flight goes in the next compile, sent when that one returns. A successful
result shows at once. A build error shows only once the reader has stopped typing for
`ERROR_PAUSE_MS` (`session.ts`), and the last good result stays up meanwhile.
`incremental.test.ts` holds every `<Code>` block on the site to this: after each edit in a fixed
sequence, the incremental output must equal a cold build's, module for module.
A block may hold several `.tsrx` files. The engine runs the first `.tsrx` in the `files` it is
given; `tooling/code-blocks.ts` puts the page's entry there (the first `.tsrx` fence, or the one
`<Code entry="name.tsrx">` names) and writes every file beside the generated block module, so
the site build prerenders the entry with its relative imports resolved.
Every block keeps its own result frame. The session reports compile errors itself and posts the
compiled modules to the frame (`code:modules`); `frame.ts` links every module to a Blob URL,
renders the entry, and reports runtime errors and its height back; each `import()`, computed ones
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
