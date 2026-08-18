# Changelog

Every published Markless package shares one version number: the eleven packages
(`@markless/analyzer`, `@markless/bundler`, `@markless/compiler`,
`@markless/core`, `@markless/router`, `@markless/runtime`,
`@markless/serializer`, `@markless/typescript-plugin`, `@markless/vitest-browser`,
`@markless/web`, and `create-markless`) are always released together at the same
version, because a project scaffolded by `create-markless` asks for that exact
version of everything else.

This file starts at 0.2.0. Earlier versions have no changelog entries.

## 0.3.3

A patch release that takes back most of the bytes 0.3.2 added. No behavior
changes for apps that use `computed()`; apps that do not now ship none of the
reconcile machinery.

### Derived reconciliation is installed only where it is used

0.3.2 shipped derived-result reconciliation inside the runtime graph, so every
app paid for it (about 1.4 kB gzip) whether or not it had a `computed()`.
Reconciliation is now an installable plane: `@markless/runtime` exports it as
`@markless/runtime/graph-reconcile`, and the build installs it into an app only
when that app's state payload has computed nodes. Everything else about it is
unchanged: same keyed and identity matching, same object-field reconciliation,
same behavior for async computeds.

For an app with no computed nodes the runtime behaves as it did before 0.3.2:
nothing is recorded on writes, and the reconcile module and its installer are
absent from the built output. The music-player-ssr demo drops from 64,363 to
63,109 gzip bytes of shipped JavaScript.

If you construct a runtime graph yourself (outside a Markless build), pass the
plane to `createRuntimeGraph({ reconcile: createDerivedReconcilePlane })` to keep
path-granular invalidation; without it, a recomputed value invalidates its whole
node.

## 0.3.2

A patch release with one runtime change you will feel on pages that derive lists
or objects, and one compiler fix.

### A recomputed `computed()` only wakes what actually changed

Before this release, when a `computed()` re-ran, the runtime treated its whole
result as new: every expression on the page that read any part of it re-checked.
For a derived list of N rows that meant N re-checks after a change to one field
of one row.

Now the runtime keeps one persistent node per computed and reconciles each new
result against the previous one:

- Objects reconcile field by field. A field that did not change wakes nothing.
- Arrays reconcile by element identity, or by a key you declare on the computed
  node with the runtime option `reconcile.keyed[{ path, keyPath }]`. Position
  alone is never treated as identity, so two different elements at the same
  index are never confused for one another. Malformed keys (missing or
  duplicated on either side) fall back to structural comparison, silently in
  production and with a diagnostic in a debug build.
- Reconciliation never mutates your values and `computed()` stays read-only.
  Objects your derive function returned unchanged keep their identity, which is
  what keyed rows and `element()` handles rely on.

The work that follows a recompute (dirty paths, woken subscriptions, DOM
updates) is now proportional to what changed rather than to the size of the
value. Comparison itself still visits each compared container level. Async
computeds get the same treatment when they publish a fulfilled value.

Runtime bytes grew with this change (about 1.4 kB gzip in the shipped client);
that cost is tracked and a follow-up moves the reconcile machinery out of the
path of apps that never use `computed()`.

### Static `.mdx` pages load again

0.3.1 made MDX pages emit the no-flash `storage()` seed script, but the code
path for a page with no islands referenced the seed list without declaring it,
so every plain markdown route failed at load with
`marklessMdxStorageSeeds is not defined`. Static pages now declare an empty seed
list; pages with islands were unaffected.

### `class` bindings tested by an expression update again

`class={picked === 'x' ? 'a' : 'b'}` produced no DOM update record: the
conditional-class branch of the compiler never created the template-expression
node that text bindings get, so the read could not be resolved and the update
was dropped silently. It now goes through the same composite-expression path as
text bindings. Bare-identifier tests such as `class={active ? 'a' : 'b'}` were
already fine and are unchanged.

## 0.3.1

A patch release with three fixes found while building the Markless docs site as
a Markless app on the published packages.

### MDX islands that derive a value now resume

An MDX page is stitched from several `.tsrx` islands, and each island gets its
own symbol prefix. The view side already applied that prefix; the composed state
payload did not, so an island whose update re-derived a `computed()` looked up a
symbol the loader table did not know and failed with `Unknown Markless MDX
symbol`. `composeMdxState` now prefixes `deriveSymbolId` the same way the view
side prefixes host and event symbol ids.

### `storage()` works in router apps

A module-scope `storage()` used from a page or MDX island served a state payload
stamped as the storage version with no storage records, and the client refused
the whole payload, taking every island on the page down with it. Storage records
now travel through MDX composition, the payload version is computed from what the
payload carries, and MDX pages emit the no-flash storage seed script. A
`storage()` declared in `document.tsrx` used to be dropped silently; it now fails
the build with `MARKLESS_ROUTER_DOCUMENT_STORAGE_UNSUPPORTED`, which tells you to
move it into a component the page renders.

### `@for` over a plain array renders its rows

`@for` over a collection that is not reactive state, such as an inline array, a
module constant, or an imported constant, rendered zero rows on the server with no
diagnostic. The compiler now carries the authored collection expression on the
repeat record and the server-render module evaluates it in the module's own
scope, so those loops render. A repeat with no readable collection is a build
error, `MARKLESS_REPEAT_COLLECTION_UNREADABLE`, instead of an empty list.

## 0.3.0

The headline is what a page runs before you touch it. On 0.2.2, loading a
client-rendered page meant building the whole reactive graph first. On 0.3.0 the
page does not start the framework at all: it ships event triggers and nothing
else, and your first real interaction loads the runtime and replays that exact
event. Server-rendered pages render from data the build already produced instead
of scanning their own markup, and a page whose starting values are known at build
time can ship with no state script at all.

The rest is authoring surface. `style` accepts an object. An `element()` handle
works as identity in id-reference attributes, so there is no `useId` to reach
for. `overlay` lifts an element above the rest of the UI. And a `<` that cannot
open a tag is finally just text.

Nothing was removed. Every export and entry point that existed on 0.2.2 is still
there, so upgrading should not require code changes.

### `style` accepts an object

`style` took a string. It now also takes an object, the same shape React, Solid,
and Qwik use:

```tsx
let x = state(0);

<div style={{ display: 'flex', gap: 8, transform: `translate(${x}%, 0)` }}>
	Panel
</div>
```

The rules for keys and values:

- camelCase keys become their hyphenated CSS names, so `marginTop` writes
  `margin-top`. Hyphenated keys are accepted as written.
- A bare number gets `px`, except for zero and except for properties where a
  bare number is already a complete value (`lineHeight`, `opacity`, `zIndex`,
  `flexGrow`, `order`, and the rest of React's unitless list).
- `--custom-property` keys pass through untouched, name and value both.
- `null`, `undefined`, `true`, `false`, and the empty string mean "write no
  declaration", which is what React does with them too.

An object literal written on the element works, and so does an unmodified
same-file `const`, either referenced by name or flattened with a spread. Later
keys win:

```tsx
const base = { padding: 8, color: 'gray' };

<div style={base} />
<div style={{ ...base, color: 'black' }} />
```

None of this costs anything at runtime. Declarations the compiler can resolve
become literal CSS text inside the template, and the ones reading `state()`,
`computed()`, or props recombine into a single derived value feeding the style
update that already existed. An app that adopts object style ships the same
bytes as one that writes strings.

Shapes that cannot be resolved while compiling are refused rather than guessed
at. `MARKLESS_STYLE_OBJECT_UNSUPPORTED` names the specific reason: an object
imported from another module, an exported or reassigned `const`, a whole object
held in `state()`, an object chosen at runtime, an array of styles, or a
computed key that is not a compile-time string. The diagnostic always offers the
same three ways out: write the declarations on the element, move them into an
unmodified same-file `const`, or pass a CSS string.

In the editor, `style` is typed `string | StyleObject`, with property names from
`csstype`. You get completion for real CSS properties, an error on a misspelled
one, open `--custom` properties, and bare numbers on lengths.

### `element()` handles are identity in IDREF positions

There is no `useId` in Markless, and none is coming. An id has no render
lifecycle to hook into, so instead of handing you a string to place yourself, an
`element()` handle is now valid wherever the platform expects an id reference:

```tsx
const label = element<HTMLSpanElement>();

<span el={label}>Notifications</span>
<div role="group" aria-labelledby={label}>…</div>
```

The compiler resolves the relationship and the emitter writes the id onto both
sides. You never see the string, never invent a naming scheme for it, and can
never collide with someone else's.

The IDREF positions are `aria-labelledby`, `aria-controls`, `aria-describedby`,
`popovertarget`, and `for`. `aria-activedescendant` is deliberately not one of
them: it names one row of a live collection, which needs per-row identity that
this release does not do.

A handle referenced in one of those positions and never bound with `el={handle}`
is a compile error, `MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND`. It is an error and
not a warning because of how the failure looks: the page renders correctly, and
the relationship is simply absent. Nothing else in your toolchain will catch
that. The existing `MARKLESS_ELEMENT_HANDLE_UNBOUND` warning, for reading a
handle before it is bound, keeps its severity, because that read renders
`undefined` where you can see it, and `// markless-allow` can still say it was
intentional.

One handle per attribute in this release. `aria-labelledby={[first, second]}`,
`` aria-describedby={`${first} legacy-id`} ``, and a choice between two handles
are all refused with `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` rather than
joined, because joining ids means minting them, ordering them, and picking a
separator, which is id spelling the compiler deliberately does not own. A handle
bound inside a keyed repeat is refused too, with
`MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED`: one authored handle there names one
element per row, and choosing a row silently would point the relationship at
whichever rendered first.

Plain string ids in those attributes are untouched, and so is every attribute
outside the set.

### `overlay` marks an element for elevation

`overlay` is a new element attribute. It renders the element above the rest of
the UI, escaping any clipping or stacking ancestor:

```tsx
<div overlay class="sheet">Menu</div>
<div overlay={true}>The same thing, spelled out</div>
<div overlay={false}>Not elevated</div>
```

That is the whole feature. `overlay` does not dismiss on an outside click, does
not move focus, does not position or animate anything, and adds no ARIA roles.
Those stay yours to write, which is what keeps one attribute from turning into a
dialog framework.

The value has to be a literal. `overlay={isOpen}` is a compile error,
`MARKLESS_OVERLAY_VALUE_UNSUPPORTED`, because elevation is structural rather
than reactive: the record the compiler emits carries no inputs, so it has no
dependencies and can never re-run. Drive existence with `@if` and leave
`overlay` a literal on the element inside the branch:

```tsx
@if (isOpen) {
	<div overlay class="sheet">Menu</div>
}
```

`overlay` also has to sit on a host element. `<Dialog overlay />` is a compile
error, `MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED`, because a component is not a
DOM locator and may render zero, one, or many host nodes. It cannot be worked
around by forwarding a prop either, since a forwarded value is not a literal.

### A `<` that cannot open a tag is text

Both of these used to fail to parse:

```tsx
<span>I <3 this</span>
<span>x <= 10</span>
```

A `<` in markup text opens a tag only when the next character could start one: a
letter, `{`, `/`, or `>`. Anything else is literal text now, and it escapes to
`&lt;` in the rendered HTML. The rule holds inside `{ … }` expression containers
too, and the editor uses the same rule, so a `<3` in your copy no longer puts a
red line under the whole file.

### Client-rendered pages do not start the runtime at load

On 0.2.2, a client-rendered page constructed its reactive graph while loading:
state cells, computed values, event wiring, symbol loading, all of it before
anything could happen. On 0.3.0 the page ships delegated event triggers derived
from build-time render data, and stops. No graph, no cells, no wiring. The first
genuine interaction demands the runtime and then replays the event that caused
it exactly once, so a click that lands before the page has woken still does what
the user asked instead of being dropped.

Async boundaries follow the same rule. Settling one loads that branch's chunk,
its record registration, and the small patcher that fills the slots. The full
resume runtime still waits for an interaction.

On the server side, rendering works from the same build-time render data instead
of scanning the markup it just produced, and a payload with no persistent state
decodes through an entry that carries no storage validation code at all.

Two demo applications in this repository are measured on every run by a gate
that fails the build if the numbers drift. In their shipped configuration, which
includes the prerendering described below, the music player executes 543 bytes
at load and the live feed 3,693, both down from roughly 70,000 when this work
started; the server-rendered versions of the same pages execute 1,216 and 1,323.
A build without prerendering does not reach figures that small, but it no longer
starts the runtime at load either.

### Pages whose starting state is known at build time ship no state script

A server-rendered page normally carries a script holding the values the browser
needs in order to resume: state cells, computed values, component props. When
the request-time values match what the build already evaluated, there is nothing
to send. Those pages now serve a container with zero state and view scripts and
a small inline bootstrap pointing at the wake chunk instead.

If any value diverges from the build, the page emits exactly the payload it
emitted before, byte for byte. A value that cannot be compared fails loudly
rather than being assumed equal.

### Build-time prerendering, as a preview

The build can render pages to HTML ahead of time and serve them with the resume
path attached, instead of rendering on the client at load. This is what takes
the demo numbers above down to hundreds of bytes.

It is off by default and turned on per build with the `MARKLESS_PRERENDER=1`
environment variable, plus `MARKLESS_PRERENDER_WAKE=1` for router applications.
Treat it as a preview: the behavior is covered by the demos and their browser
tests, but the way you switch it on is not settled and will change before this
becomes the default.

The dev server renders those pages through the same path production uses, so a
prerendered page cannot behave differently while you are developing it than it
does once shipped. A page that fails to evaluate shows the framework error
surface rather than a blank shell or a silent fall back to client rendering.

### A click on nothing no longer breaks the rest of the page

On a prerendered page, a single click on an element with no event handler, such
as a heading, a gap between controls, or album art, could permanently disable
every remaining interaction on that page. Clicking around quickly made it easy
to hit. The fallback path was taking ownership of event dispatch and never
giving it back; it is now consulted only for events nothing else claims.

### A third-party widget can no longer break resume

Elements the framework finds by position are now resolved once per container
into a list pinned by element reference and updated in place, rather than
re-derived from the live DOM. Before this, a third-party widget that replaced
one of your elements, such as a YouTube embed swapping out its own placeholder,
shifted every position after it, which showed up as a resume error or as clicks
that silently did nothing.

### The console tells you what actually executed

In development the console prints one line per turn:

```
markless: 3.0 KB executed at load · this click +12.4 KB · total 15.4 KB
```

The numbers come from a cumulative ledger, readable at
`window.__marklessExecutionLedger`, tied to the build's own map of module sizes.
That map fails the build if a module the instrumentation hooked is missing from
it, charges are counted once per chunk, and "at load" means before the first
real gesture. This replaces three separate log implementations that disagreed
with each other and printed zeros and "bytes unknown". Builds with logging off
gain nothing from it.

### Dev server and hot reload fixes

Four ways an edit could leave the dev server serving stale code or crash it
outright:

- Editing a file that another component imports could fail the parent's
  transform with `MARKLESS_CAPTURE_METADATA_MISSING`, because the parent looked
  its children up in a registry its own invalidation had just cleared, and Vite
  could answer a child's re-request from cache without re-entering the plugin,
  so the child never re-recorded itself.
- Generated modules were only registered as a side effect of transforming the
  file that owns them. When one was invalidated on its own, nothing re-created
  it, Vite read a virtual path off disk instead, and the module runner's reload
  died, swallowing the edit entirely.
- The barrier that holds renders during a hot update guessed when the update had
  finished using a zero-delay timer. The guess could fire between passes, so a
  render started on the browser's reload signal could still be handed pre-edit
  modules. Every environment is now invalidated before that signal goes out.
- Nitro dev could pick up stale out-of-process runner state after an edit.

### `@` completions no longer appear inside `<style>`

Typing CSS in a local `<style>` block offered `@if`, `@for`, and the rest of the
construct snippets. The id identifying a style block carried the filename, which
the editor host lowercases in transit, so the guard that detects CSS context
never matched; and half-typed CSS, such as a lone selector dot, threw a fatal
parse for the whole file and dropped the editor into treating everything as
markup. Style ids are now short hashes that survive the round trip, and
unfinished CSS is recovered instead of being fatal.

### `create-markless` works inside an existing monorepo

Scaffolding a project inside an existing workspace produced something that could
not install: the new project inherited the host workspace and resolved its
dependencies against the parent lockfile instead of its own. The scaffold now
detects the host workspace and opts out of it, per package manager, because they
disagree with each other. pnpm needs an explicit opt-out file, and so does bun,
which accepts `--ignore-workspace` and then quietly ignores it. npm, yarn
classic, and yarn berry each signal workspace membership differently. A separate
test job installs a scaffolded project for real under npm, pnpm, yarn, bun, and
deno, because a real install is the only place this shows up.

### Strict TypeScript across every package

All eleven packages typecheck under `strict`, and the declarations in the
published tarballs are what that produces. The 661 errors in the way were fixed
as real repairs in the packages that owned them, with no suppressions and no
`any` casts, so the types your editor shows describe what the code actually
does. Type errors now block commits and continuous integration too.

### New entry points

`@markless/web` and `@markless/core` each gain a `resume-storage-free` entry
point, and `@markless/serializer` gains subpaths for async boundary arms and for
comparing and merging resume records. These are wiring the bundler picks for
you, not API to import by hand, and they are purely additive.

## 0.2.2

Two compiler diagnostics were rejecting correct code. If you hit either on
0.2.1, this release is the fix.

### `computed()` no longer rejects local variables

`MARKLESS_STATE_WRITE_IN_COMPUTED` flagged every assignment written inside a
`computed()` body without checking whether the target was reactive state at
all. Ordinary local work was refused:

```tsx
const total = computed(() => {
	let sum = 0;
	for (const item of items) sum += item; // rejected on 0.2.1
	return sum;
});
```

`sum` is declared inside the derivation and cannot re-trigger it. The rule now
resolves the assignment target against the real dependency graph, so writing to
actual state inside a `computed()` still errors, and a local accumulator does
not.

### Snapshot-before-await stopped depending on variable names

`MARKLESS_ASYNC_POST_AWAIT_READ` asks you to read state *before* awaiting, then
use the snapshot afterwards. It resolved a derivation's own local variable back
to a module-wide name, so the same correct pattern passed in one `computed()`
and failed in the next one that happened to reuse the variable name. Names a
derivation binds itself now shadow outer ones.

Reading state directly after an `await` is still an error. That rule is real and
unchanged.

### Pages without `storage()` no longer load the storage runtime

The resume path loaded the storage plane on every page, including pages that
declare no persistent state. It now loads only when the page actually has
storage cells. Fewer bytes fetched and executed on pages that never asked for
persistence.

Some storage code was also reaching every page through a bundling quirk: a
module needed eagerly by the payload decoder also held client-storage-only
constants, which pinned the whole file into the eager chunk. Splitting it keeps
those bytes on the pages that use them.

### `@markless/vitest-browser` is published

The browser-mode testing package is on npm for the first time, at the same
version as everything else. It gains a `./ssr-plugin` entry point, which its own
error messages already told you to import but which was never actually exported,
and it now ships the TypeScript types for the browser commands it registers.

`vitest` is a required peer dependency (`^4.1.5`) because the package imports it
directly; `vite` is optional.

## 0.2.1

A type-only fix. No runtime behavior changes, and no code that worked on 0.2.0
stops working.

### `storage()` accepts one argument, as documented

0.2.0 shipped a contradiction inside the `@markless/core` tarball. The type
declaration required two arguments:

```ts
declare function storage(key: string, fallback: string): string;
```

while `agent/markless.md`, in that same tarball, documented the one-argument
form:

```tsx
let theme = storage('light'); // persists under markless:theme
```

The compiler has always accepted the one-argument form, so the code compiled and
ran correctly and your editor put a red line under it anyway. That was
especially unhelpful for AI agents, since `agent/markless.md` exists precisely to
tell them how to use the framework, and it was telling them to write something
the types rejected.

`storage()` is now declared as two overloads:

```ts
export function storage(fallback: string): string;
export function storage(key: string, fallback: string): string;
```

Arity is what distinguishes them. With one argument, that argument is the
fallback and the storage key is derived from the binding name. With two, the
first is an explicit key. This mirrors what the compiler already did.

An optional second parameter would have been wrong here: `storage(key,
fallback?)` types a lone argument as a *key*, which is the opposite of what the
compiler does with it.

Nothing else changed. The two-argument form, the derived-key behavior, the
persistence format, and every other package are untouched.

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
  `getMarklessTsrxLanguagePlugin`, `getMarklessTsrxParseFailure`,
  `isMarklessTsrxFile`, `mapMarklessSourcePositionToGenerated`, and
  `transformTsrxForTypeScriptService`. These existed in 0.1.1 but were
  unusable from TypeScript, because that release shipped no type declarations
  at all.

### `create-markless`

- Scaffolded projects opt into agent setup: the scaffold detects installed
  coding agents and, with your consent, writes Markless guidance where the agent
  will find it.
- Scaffolded projects recommend the Markless editor extension and are wired for
  it independently of which extension identity is installed.
- Scaffolded projects now get a `.gitignore`.
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
