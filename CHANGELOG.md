# Changelog

Every published Markless package shares one version number: the ten packages
(`@markless/analyzer`, `@markless/bundler`, `@markless/compiler`,
`@markless/core`, `@markless/router`, `@markless/runtime`,
`@markless/serializer`, `@markless/typescript-plugin`, `@markless/web`, and
`create-markless`) are always released together at the same version, because a
project scaffolded by `create-markless` asks for that exact version of
everything else.

This file starts at 0.2.0. Earlier versions have no changelog entries.

## 0.2.0

The first release since 0.1.1 (published 8 July 2026). Nothing was removed: no
export and no entry point that existed in 0.1.1 is gone, so upgrading from
0.1.1 should not require code changes. The version moves to 0.2.0 rather than
0.1.2 because it adds a substantial amount of new public API, headlined by
persistent state.

These packages are now published from GitHub Actions using npm trusted
publishing, so every tarball carries a provenance attestation that npm displays
on the package page. No stored npm token is involved.

### Persistent state: `storage()`

`@markless/core` gains `storage(key, fallback)`, a new way to declare a piece of
state that survives a page reload.

```tsx
let theme = storage('theme', 'light');
```

It reads and writes like ordinary state: reading the binding gives you the
value, and assigning to it persists the new value. Details worth knowing:

- Values are strings in this version.
- Assigning also sets a `data-<key>` attribute on the `<html>` element, so CSS
  can style the persisted choice without JavaScript.
- The compiler seeds the stored value into the page before the framework wakes
  up, so the first paint is already correct. There is no flash of the fallback
  value and no second read on the client.
- Declaring with `let` gives you a writable cell. Declaring with `const` gives
  you a read-only persisted value, and assigning to it is a build error.
- The key and the fallback must be static values the compiler can see. If they
  are not, you get a `MARKLESS_STORAGE_KEY_STATIC` diagnostic instead of
  surprising runtime behavior.
- The compiler also accepts a one-argument form, `storage('light')`, which
  derives the key from the binding name and namespaces it, so `let theme =
storage('light')` persists under `markless:theme`. The derived key is a
  compile-time literal, so minification cannot change it, but renaming the
  binding does change it and orphans data already saved by your users. For
  anything you ship, pin an explicit key.

Only bindings a page actually uses are included in the payload sent to the
browser, and pages that use no persistent state are byte-for-byte unchanged.
The development-time protocol validator (about 4.6 KB gzipped) is no longer
included in production builds.

Supporting exports for this feature, for tooling that needs to read or write the
same data:

- `@markless/serializer` adds `STORAGE_PROTOCOL_VERSION`,
  `STORAGE_SLOT_SYMBOL_KEY`, `StorageSeedMetadata`,
  `createStorageSeedMetadata`, `createStorageSeedMetadataFromGraphNodeId`,
  `isValidStorageKey`, `storageAttributeName`, `storageSlotEntryKey`, and
  `storageSlotEntryKeyFromGraphNodeId`.
- The state payload gains a version 2 form that carries persistent-state slots.
  A page with no persistent state still emits the version 1 form, byte for
  byte. Both decoders are strict about the shape they accept.

### New entry points

- `@markless/bundler/dev-error` publishes the development error protocol: the
  event names (`MARKLESS_DEV_ERROR_EVENT`, `MARKLESS_DEV_ERROR_CLEAR_EVENT`,
  `MARKLESS_DEV_ERROR_CLIENT_ID`), the payload and diagnostic types
  (`MarklessDevErrorPayload`, `MarklessDevDiagnostic`, `MarklessErrorLocation`,
  `MarklessCompileError`), and the helpers that build and render them
  (`createCompileErrorPayload`, `formatMarklessSourceFrame`,
  `normalizeMarklessDevError`, `renderMarklessDevErrorDocument`,
  `renderMarklessDevErrorPlainText`, `serializeMarklessDevError`).
- `@markless/web/inline/resumer` publishes the builder for the small inline
  script that resumes a server-rendered page:
  `createInlineResumerSource`, `createInlineResumerSelfWakeSource`,
  `createInlineResumerDebugRegistrationSource`, and the option types
  `InlineResumerBuildOptions` and `InlineResumerSourceVariants`.

### `@markless/compiler`

New exports covering prop binding identity and capture slots, which is how a
parent's props reach a child component that lives in another module:
`BoundSymbolCaptureRoute`, `BoundSymbolResolverArtifact`,
`BoundSymbolResolverInput`, `BoundSymbolResolverRow`, `CaptureSlot`,
`CaptureSlotRoute`, `ExtractedCaptureSymbol`,
`SemanticComponentPropDeclaration`, and `collectTsrxModuleDiagnostics`, a
result-wide aggregator for every diagnostic a module produced.

Behavior changes:

- Diagnostics now carry a per-variant severity, and `severity: 'error'` means
  the build must not ship. Consumers gate on severity alone.
- Props forwarded to imported children, named locals used as callbacks, and
  optional props that are absent on an imported edge are all classified
  correctly now, instead of falling back to a conservative path.
- Async-capable synchronous computed values work in every context, and a cycle
  between computed values is reported as a diagnostic rather than looping.
- An element-valued guard return is now a hard error instead of silently
  producing wrong output.
- The serialized bound-row payload uses a more compact encoding.

### `@markless/bundler`

- A structured development error surface: compile and runtime failures are sent
  over HMR as a typed payload and rendered in a self-contained overlay with
  clickable, correctly positioned editor links. Fixing the file clears the
  overlay, including when the fix restores byte-identical source.
- Builds fail closed when the compiler reports an error diagnostic, and when an
  imported child is missing capture metadata, rather than emitting code that
  would break at runtime.
- Import specifiers are resolved before capture-metadata checks, so aliased and
  bare specifiers behave the same.
- Development byte accounting attributes child-scoped symbols correctly and
  labels estimated figures as estimates.
- `?direct` virtual style modules are invalidated on hot update.

### `@markless/web`

- New exports under `@markless/web/fns/*` for client and server symbol
  remapping used during resume: `marklessBaseSymbolId`,
  `marklessBoundSymbolId`, `marklessDomUpdateSymbolId`,
  `marklessLiveBoundGraphRoute`, `marklessCsrLoadChildSymbol`,
  `marklessCsrRemapChildDomUpdate`, `marklessCsrRemapChildKeyedRepeat`,
  `marklessCsrRemapGraphOutput`, `marklessCsrUnbindLocalView`, and
  `marklessSsrRemapGraphOutput`.
- Asynchronous work has a dedicated runner transport, and a shell that is still
  waiting on an unsettled boundary wakes itself. The self-wake script is emitted
  only for documents that actually need it.
- Authored prop keys and imported sole-root components mount correctly.
- The emitted runtime is smaller by 69 gzipped bytes.

### `@markless/runtime`

- New export `RuntimeGraphComputedDependencyNode`.
- Key-phase gating for chained asynchronous computed values, so a chain settles
  in one pass instead of waking repeatedly.

### `@markless/router`

- A failed navigation in development renders the structured error document,
  with a plain terminal fallback in production.
- Scoped TSRX styles are delivered correctly: route CSS is collected after the
  route is finalized, the scoped-style fallback is deterministic, and style maps
  stay on the server.
- Client assets are persisted for server-side rendering.

### `@markless/typescript-plugin`

- Parse failures in `.tsrx` files now surface as editor diagnostics, with
  canonical failure keys and diagnostic coordinates clamped to the real file.
- New exports: `MARKLESS_TSRX_EXTENSIONS`, `MARKLESS_TSRX_LANGUAGE_ID`,
  `MARKLESS_TSRX_PARSE_ERROR_CODE`, `MarklessTsrxParseFailure`,
  `MarklessTsrxVirtualCode`, `clampMarklessDiagnosticStart`,
  `getMarklessTsrxParseFailure`, `isMarklessTsrxFile`,
  `mapMarklessSourcePositionToGenerated`, and
  `updateMarklessTsrxParseFailure`. Most of these existed in 0.1.1 but were
  unusable from TypeScript, because that release shipped no type declarations
  at all.

### `create-markless`

- Scaffolded projects opt into agent setup: the scaffold detects installed
  coding agents and, with your consent, writes Markless guidance where the agent
  will find it.
- Scaffolded projects recommend the Markless editor extension and are wired for
  it independently of which extension identity is installed.
- Scaffolded projects now get a `.gitignore`.
- The scaffolded `tsconfig.json` declares the Markless compiler
  (`"tsrx": { "compiler": "@markless/typescript-plugin/volar" }`) and sets
  `"jsx": "preserve"`, so a new app's editor answers completions, hover and
  go-to-definition immediately. `markless doctor` now fails when that
  declaration is missing and names the exact line to add.
- The minimal starter's counter is fixed: reactive state needs `let`, not
  `const`.
- New export `ProgramPromptMultiselectOptions`.

### `@markless/analyzer`

No API changes. Included in the release so every package stays at the same
version.

### Packaging fixes

- `@markless/typescript-plugin` now ships type declarations for its `.` and
  `./language` entry points. 0.1.1 published neither, so the package had no
  usable types.
- `@markless/typescript-plugin` now declares `license: MIT`. 0.1.1 published
  with no license metadata at all.
- `@markless/router`'s `./typescript-plugin` entry point now also ships a
  CommonJS build. TypeScript's language server loads plugins with `require`,
  and 0.1.1 published only an ES module, which it cannot load.
- Every package declares `publishConfig.provenance`, and every published entry
  point is verified to exist inside the tarball before the release goes out.
