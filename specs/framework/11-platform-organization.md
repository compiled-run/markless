# Platform Organization

Platform and adapter package boundaries for web, mobile, and desktop targets.
This file owns platform-specific monorepo shape, not the future `arcade/ui`
component surface.

## Terms

- **Core runtime** means host-agnostic graph state, scheduler semantics,
  serializer integration, symbol resolution contracts, and protocol validation.
- **Platform** means a family of host rendering semantics: web DOM, mobile
  native controls, or desktop native controls. A platform owns host primitive
  meaning, event normalization, locator materialization, lifecycle hooks, style
  capability records, and journal-to-host operations.
- **Adapter** means a concrete host/tooling integration inside a platform
  package. An adapter owns environment capabilities such as Vite dev-server
  integration, native bridge setup, JavaScript engine choice, asset URLs,
  packaging, HMR, test harnesses, and OS/runtime quirks.
- **UI package** means the later cross-platform authored component layer that may
  eventually be exposed as `arcade/ui`. It is deferred until platform contracts
  are proven.

Do not use `native` as a primary package or import name. It conflates mobile,
desktop, React Native, and native bindings. Use explicit platform names:
`web`, `mobile`, and `desktop`, with OS or host adapter names below them.

## Package Direction

The existing package map stays valid while web is the only production target. As
platform-specific code grows, split by ownership rather than public API ambition:

- `packages/runtime` remains the shared graph/runtime contract package. Move
  browser-DOM-specific render, resume, locator, and journal application code out
  of this package as platform packages are introduced. Keep graph state,
  scheduler behavior, shared state patches, symbol invocation contracts, and
  payload validation here.
- `packages/serializer` continues to own protocol and payload contract types
  until implementation tests prove a separate public protocol package is needed.
- `packages/compiler` stays platform-aware only through typed artifacts and
  capability records. It must not emit browser-only behavior as the default
  meaning of host elements.
- `packages/bundler` stays the Rolldown-first build base. Platform adapters may
  consume it, but bundler internals should not become the web platform package.
- `packages/arcade` remains the curated public package. It may re-export stable
  platform entry points after they are proven, but internal platform packages are
  not public API by default.

The preferred future production platform packages are:

- `packages/web` for DOM, HTML, CSS, browser events, browser resume, module
  preload sinks, web-specific render targets, and web adapter modules such as
  Vite integration.
- `packages/mobile` for shared mobile native projection semantics and mobile
  adapters. Shared code owns host primitive mapping,
  activation/input/gesture event normalization, graph-to-native journal
  operations, lifecycle hooks, and capability records that apply across iOS and
  Android. Adapter folders such as `src/adapters/ios` and
  `src/adapters/android` own OS bridges, host factories, JavaScript engine
  integration, asset packaging, and OS tests.
- `packages/desktop` for shared desktop native projection semantics and desktop
  adapters. Shared code owns keyboard/pointer/menu/window lifecycle
  normalization, desktop control capabilities, and graph-to-native journal
  operations. Adapter folders such as `src/adapters/macos`,
  `src/adapters/windows`, and `src/adapters/linux` own OS bridges, host
  factories, packaging, and OS tests.

Keep the top-level package list small. Do not create `packages/adapter-*`,
`packages/platform-*`, or nested workspace packages by default. A separate
adapter package is allowed only after tests prove the adapter cannot live inside
its platform package because of publish boundaries, incompatible dependencies, or
host toolchain isolation.

## Platform Contracts

Every platform package should consume the same compiler artifacts and runtime
graph contracts. The difference is the host projection:

- web maps host nodes to DOM elements/comment anchors, events to browser event
  names, style records to CSS, preload records to browser modulepreload hints,
  and journal entries to concrete DOM operations.
- mobile maps host nodes to native control/view descriptors, events to semantic
  activation/input/gesture records plus OS-specific adapter records, style
  records to constrained native style capabilities, and journal entries to
  native view mutations.
- desktop maps host nodes to native window/control descriptors, events to
  semantic activation/input/keyboard/pointer records plus OS-specific adapter
  records, style records to desktop control capabilities, and journal entries to
  native view mutations.

The shared compiler artifact should name semantic intent first and platform
details second. For example, a button activation is a semantic `activate`
event. The web platform can map it to `click`, iOS can map it to
`touchUpInside`, and macOS can map it to `action`. The platform mapping is data
owned by platform/adapters; it is not a component rerender path and not a VDOM.

Host locators remain platform-owned: web can use DOM-order element/comment
locators from `arcade/view`, while mobile and desktop can derive native host IDs
or adapter bridge handles from the same view artifact. Shared graph state and
symbol IDs must not depend on DOM nodes, UIKit objects, AppKit objects, or
adapter bridge handles being serializable.

## Adapter Boundaries

Adapters are allowed to be host-specific, but they live inside their platform
package by default. They may use host APIs, toolchain APIs, native build files,
and test harnesses that shared packages cannot use. Adapters should inject these
capabilities into platform shared code instead of making core packages import
them directly:

- file access, module resolution, hashing, environment variables, timers beyond
  standard globals, and dev-server integration
- native bridge creation, JS engine creation, asset URL resolution, and
  platform package loading
- Vite/Rolldown dev, build, preview, HMR, and HTML integration
- OS lifecycle hooks, thread constraints, cleanup, and diagnostics transport

The current Vite integration remains a web adapter surface until a platform
package owns it. Do not move web Vite behavior into mobile or desktop just
because all adapters share build concepts.

## Future `arcade/ui`

Do not create or export `arcade/ui` yet. The future UI layer should sit above
platform contracts, not platform implementations. A later `packages/ui` can own
cross-platform components such as
`base`, `select`, and `collapsible` only after at least the web platform and one
native platform prove the same semantic component contract against their host
capability records.

The eventual public shape should be curated through `packages/arcade`, for
example:

```ts
import { base, select, collapsible } from 'arcade/ui';
```

That import must not expose platform package internals. The UI package should
compile to semantic host intent and platform capability requirements. Platform
packages decide how those requirements become DOM nodes, native controls, style
records, event records, behavior records, and journal entries.

## Migration Sequence

1. Keep existing web behavior working while documenting platform ownership.
2. Extract reusable host-agnostic runtime pieces in `packages/runtime` from
   DOM-specific render/resume helpers as the first platform package is created.
3. Create `packages/web` as the home for DOM render/resume, DOM journal
   application, browser locator materialization, modulepreload sinks, web event
   mapping, and web adapter modules.
4. Keep the current Vite adapter in `packages/bundler` until `packages/web`
   exists; then move web-specific Vite wrappers behind a web-owned adapter module
   or curated subpath.
5. Promote the iOS and macOS proof concepts into `packages/mobile` and
   `packages/desktop` platform contract tests before adding production OS
   adapter folders.
6. Add adapter folders one at a time with fixture-backed receipts. Each adapter
   must prove that it consumes compiler artifacts and shared graph contracts
   without requiring hydration, VDOM reconciliation, or component execution on
   resume.
7. Revisit `arcade/ui` only after platform capability records can express the
   needed primitives without importing web DOM or OS bridge code.

## Verification

Platform organization work is complete only when tests prove the claimed
boundary:

- package inventory tests prove expected manifests, exports, workspace
  membership, and that platform adapters did not become unnecessary top-level
  packages
- core runtime tests prove graph/scheduler/payload behavior without DOM or native
  host APIs
- platform tests prove web DOM behavior and mobile/desktop semantic artifact
  mapping before OS adapters assert UIKit, Android, AppKit, or other host
  behavior
- adapter tests prove host/toolchain integration through real or witness-backed
  fixtures inside the owning platform package
- guardrail scans prove shared packages did not gain DOM-only, OS-only,
  Node-only, hydration, VDOM, or app-authored client/server-entry assumptions
