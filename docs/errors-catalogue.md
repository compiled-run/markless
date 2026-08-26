# Markless diagnostics catalogue

Generated from package sources by `scripts/diagnostics-catalogue.mjs`. Do not edit by hand.

198 codes. Each one is served at `https://markless.dev/errors/<CODE>`.

| Code | Package | Pass / phase | Title | Message |
| --- | --- | --- | --- | --- |
| `MARKLESS_ALLOW_ERROR_UNSUPPRESSIBLE` | compiler | semantic-graph | TODO: no builder title | TODO: no builder message |
| `MARKLESS_ALLOW_REASON_REQUIRED` | compiler | semantic-graph | TODO: no builder title | TODO: no builder message |
| `MARKLESS_ALLOW_STALE` | compiler | semantic-graph | TODO: no builder title | TODO: no builder message |
| `MARKLESS_ARM_COMMIT_ANCHORS_MISSING` | web | resume-commit-arm | TODO: no builder title | could not commit its settled @try/@catch content: the boundary's comment anchor pair is no longer intact in the live DOM. |
| `MARKLESS_ARM_COMMIT_RENDERER_MISSING` | web | resume-commit-arm | TODO: no builder title | settled with rendered @try/@catch content, but this host provides no HTML renderer to build DOM nodes from it. |
| `MARKLESS_ARTIFACT_CHILD_PROP_NOT_BUILD_KNOWN` | compiler | link | Delegate child prop is not build-known | <…> prop … must be a build-known static value. Runtime component execution is not a fallback. |
| `MARKLESS_ARTIFACT_CHILD_RENDER_INVALID` | compiler | link | Delegate child renderSsr returned no static HTML | <…> renderSsr must return static HTML. |
| `MARKLESS_ASYNC_ARM_RENDER_UNSUPPORTED` | compiler | public-render | The settled @try content cannot render in the browser yet | TODO: no builder message |
| `MARKLESS_ASYNC_BOUNDARY_REQUIRED` | compiler | semantic-graph | Async computed reads need an async boundary | Cannot read … "…" outside @try/@pending/@catch. Wrap the read in an async boundary. |
| `MARKLESS_ASYNC_POST_AWAIT_READ` | compiler | semantic-graph | Reactive reads after await are not resumable | Cannot read "…" after await in async computed "…". Snapshot the value before awaiting. |
| `MARKLESS_ASYNC_SETTLE_RECORDS_MISSING` | web | resume-async-wiring | TODO: no builder title | TODO: no builder message |
| `MARKLESS_ASYNC_SETTLE_SOURCE_AMBIGUOUS` | web | resume-async-wiring | TODO: no builder title | TODO: no builder message |
| `MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED` | compiler | semantic-graph | attach can only be bound to host elements | Cannot bind attach={…} on component …. attach installs DOM behavior and needs a concrete host element owner. |
| `MARKLESS_ATTRIBUTE_DUPLICATE` | compiler | semantic-graph | Duplicate attribute on one element | `…` appears twice on …. Only one can win, and render paths can disagree about which value is used. |
| `MARKLESS_ATTRIBUTE_OBJECT_VALUE` | compiler | semantic-graph | Lowercase on* attributes are plain HTML attributes; This attribute renders "[object Object]" | `…={…}` is a plain attribute, not a Markless event. It would serialize the function source into HTML.… (+1 more) |
| `MARKLESS_BARE_ARM_INTERPOLATION` | compiler | semantic-graph | A branch arm renders a bare expression instead of a fragment | `{…}` stands alone as this arm's whole body. A standalone expression container is not a template output node, so the arm has no markup of its own and its text has nowhere to live but the element around it — which erases whatever the other arm rendered there. |
| `MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED` | compiler | capture-analysis | This element behavior cannot run in the browser yet | Cannot emit lazy behavior symbol "…" because it reads component-local "…", a local … value that cannot cross a resume boundary. (+1 more) |
| `MARKLESS_BRANCH_ARM_EMPTY` | web | resume-branches | TODO: no builder title | Branch … resolved arm … to an empty fragment. |
| `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` | compiler | symbol-modules | Changing this … cannot rebuild what it shows | this … (…) cannot be rebuilt when … changes because …. |
| `MARKLESS_BRANCH_ELSE_SPELLING` | compiler | semantic-graph | A branch alternative is spelled `else` instead of `@else` | This `else` follows an @if arm but is not written as `@else`, so it is not read as a branch at all. TSRX parses it as literal text next to the @if, and the block after it becomes a separate expression, so the page renders the word "else" followed by the arm's own source as escaped text. |
| `MARKLESS_CALLBACK_PROP_ARITY_UNSUPPORTED` | compiler | semantic-graph | Callback props accept at most one parameter | Callback prop `…` is unsupported because …. Lazy callback symbols accept zero parameters or one simple identifier, object pattern, or array pattern without top-level defaults or rest. |
| `MARKLESS_CALLBACK_SLOT_SOURCE_UNSUPPORTED` | compiler | semantic-graph | A callback slot can only be filled by the widget root’s own callback prop | "…" assigns … into the "…" callback slot of shared() "…", and … is not one of this component's callback props. |
| `MARKLESS_CALLBACK_SLOT_UNBOUND` | compiler | semantic-graph | A callback slot is invoked but no component fills it | shared() "…" invokes its "…" callback slot, but no component in this module assigns a callback prop into it. |
| `MARKLESS_CALLBACK_SLOT_UNRESOLVED` | web | fns | TODO: no builder title | … was dispatched from a part whose widget instance no rendered widget owns, so the consumer's callback could never be reached. |
| `MARKLESS_CANONICAL_SYMBOL_MISSING` | web | render-canonical | TODO: no builder title | TODO: no builder message |
| `MARKLESS_CAPTURE_METADATA_MISSING` | compiler | link | Imported child has no current capture metadata | Parent module … composes imported child …, but its compiled artifact has no current capture metadata. Rebuild the child with the current Markless compiler and clear any stale build cache. |
| `MARKLESS_CAPTURE_OPAQUE_PROP` | compiler | capture-analysis | Lazy handler prop capture is not resumable | Cannot bind lazy symbol "…" because prop "…" for "…" is read through a path the compiler cannot reduce to a capture slot, so "…" would reach the browser unbound. (+2 more) |
| `MARKLESS_CAPTURE_UNSUPPORTED_VALUE` | compiler | capture-analysis | Cannot capture local … in lazy symbol; Cannot check the captures of this lazy symbol | Cannot capture "…" in lazy … symbol "…" because local … values cannot cross a resume boundary. (+1 more) |
| `MARKLESS_CHILDREN_OPAQUE` | compiler | public-render | children cannot be inspected or transformed | children is an opaque template projection: place it with {children}, wrap it, or pass it through — mapping, counting, indexing, or mutating it is not supported. |
| `MARKLESS_CHILD_SYMBOL_MISSING` | bundler | hooks | TODO: no builder title | Linked child … does not provide requested symbol module …. Rebuild the child with the current Markless compiler and clear any stale build cache. |
| `MARKLESS_COMPILER_PASS_GRAPH_INVALID` | compiler | compiler-pass-graph, pass-graph | TODO: no builder title | TODO: no builder message |
| `MARKLESS_COMPILE_BLOCKED` | bundler | transform | TODO: no builder title | … has … compiler error(s). |
| `MARKLESS_COMPONENT_BARREL_UNRESOLVED` | bundler, compiler | link, link-driver | Component barrel re-export does not resolve | Module … re-exports through more than … chained barrels. (+1 more) |
| `MARKLESS_COMPONENT_EXPORT_NAME_RESERVED` | bundler | source-module | TODO: no builder title | TODO: no builder message |
| `MARKLESS_COMPONENT_PART_AS_PAGE` | web | render-to-string | TODO: no builder title | "…" is published as a bare render part, not a page. |
| `MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED` | compiler | semantic-graph | A prop expression that reads state needs a route the child can follow | Prop `…` on `<…>` is written as `…`, which reads state but is not an expression this compiler can route. |
| `MARKLESS_COMPONENT_ROOT_CONDITIONAL` | compiler | public-render | Component root is conditional | … has a second template return, so the public render module cannot choose one component root without deleting statement flow. |
| `MARKLESS_COMPONENT_SPREAD_UNSUPPORTED` | compiler | semantic-graph | Only the props rest binding can be spread onto a component | `{...…}` on `<…>` cannot be forwarded, because `…` is not this component's props rest binding. |
| `MARKLESS_COMPONENT_TAG_UNRESOLVED` | compiler | semantic-graph | Member component tag must come from an import; Member component tag must name a component that module serves; Member component tag must name one component of a module surface | Cannot resolve `<… />` because `…` does not export a component named `…`. (+2 more) |
| `MARKLESS_COMPOSED_DOM_UPDATE_UNMAPPED` | web | fns | TODO: no builder title | DOM update "…" on host "…" with symbol "…" reads prop "…", but composition found no route. |
| `MARKLESS_COMPOSED_GRAPH_NODE_UNCLASSIFIED` | compiler | protocol-state | TODO: no builder title | the compiler cannot tell whether graph node "…" belongs to a composed component instance or to the page, so it refuses to emit it into the state payload. |
| `MARKLESS_COMPOSED_READ_UNMAPPED` | web | fns | TODO: no builder title | TODO: no builder message |
| `MARKLESS_COMPUTED_DEPENDENCY_CYCLE` | compiler | semantic-graph | A computed cannot depend on itself; Computed dependencies cannot form a cycle | Cannot create computed dependency cycle `…`. (+1 more) |
| `MARKLESS_CSR_BEHAVIOR_HOST_MISSING` | web | render-csr | TODO: no builder title | TODO: no builder message |
| `MARKLESS_CSR_DELEGATED_TRIGGER_UNMATCHED` | web | render-csr | TODO: no builder title | event record names no … route |
| `MARKLESS_CSR_DOM_JOURNAL_TARGET_MISSING` | web | render-csr | TODO: no builder title | CSR DOM journal could not resolve …. |
| `MARKLESS_CSR_ROOT_DECLARATION_MISSING` | bundler | source-module | TODO: no builder title | TODO: no builder message |
| `MARKLESS_CSS_ANCHOR_ATTRIBUTE` | compiler | semantic-graph | CSS anchoring is regular CSS | Cannot write … as an attribute. CSS anchoring is regular CSS - declare anchor-name/position-anchor in a <style> block or your stylesheet. |
| `MARKLESS_DEBUG_DEFINE_CONFLICT` | bundler | vite | TODO: no builder title | __MARKLESS_DEBUG_ENABLED__ is controlled by markless(). Remove the consumer definition or set markless({ debug: true }). |
| `MARKLESS_DEBUG_DETAILS_DROPPED` | web | debug-channel | TODO: no builder title | Debug violation details were not JSON-safe and were dropped. |
| `MARKLESS_DEBUG_EVENT_HOST_MISSING` | web | resume-runtime | TODO: no builder title | Debug registration skipped missing event host …. |
| `MARKLESS_DECIDED_BRANCH_ARM_UNKNOWN` | web | fns | TODO: no builder title | TODO: no builder message |
| `MARKLESS_DELEGATE_ARTIFACT_MISSING` | compiler | link | Delegate child produced no build-time rendering | <…> resolves to …, which this build did not compile and which handed back no build-time rendering, so the edge stays a runtime import.… |
| `MARKLESS_DEV_DEFINE_CONFLICT` | bundler | vite | TODO: no builder title | __MARKLESS_DEV_ENABLED__ is controlled by markless(). Remove the consumer definition. |
| `MARKLESS_DEV_MODULE_RUNNER_UNAVAILABLE` | bundler | vite | TODO: no builder title | TODO: no builder message |
| `MARKLESS_DEV_PRERENDER_ENVIRONMENT_MISSING` | bundler | vite | TODO: no builder title | TODO: no builder message |
| `MARKLESS_DEV_RUNTIME_ERROR` | bundler | dev-error | TODO: no builder title | TODO: no builder message |
| `MARKLESS_DYNAMIC_TAG_INVALID` | web | fns, ssr-data | TODO: no builder title | TODO: no builder message |
| `MARKLESS_ELEMENT_GUARD_RETURN_UNSUPPORTED` | compiler | public-render | Element-valued guard returns are not supported | … uses an element-valued guard return before its template root, so the public render plan cannot preserve both outcomes. |
| `MARKLESS_ELEMENT_HANDLE_DUPLICATE` | compiler | semantic-graph | element() handle is bound more than once | Cannot bind element handle "…" inside a keyed repeat because one authored handle would point at many row host elements. markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package (+1 more) |
| `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` | compiler | semantic-graph | One element() handle per IDREF attribute | TODO: no builder message |
| `MARKLESS_ELEMENT_HANDLE_IDREF_ID_CONFLICT` | compiler | semantic-graph | An element named by an IDREF cannot also declare an id | Cannot mint the id for el={…} because this element already declares an id attribute. |
| `MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED` | compiler | semantic-graph | A repeated element() handle cannot be named by an IDREF | Cannot resolve …={…} because "…" is bound inside a keyed repeat, so it names one element per row rather than one element. |
| `MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND` | compiler | semantic-graph | element() handle is referenced but never bound | Cannot resolve …={…} because "…" is never bound with el={…} in this component. |
| `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` | compiler | semantic-graph | This shared() element() handle cannot be named by an IDREF here | Cannot resolve …={…} because "…" is declared in a shared() factory that this component roots, or in a factory that is not { scope: 'widget' }. |
| `MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS` | web | inline | TODO: no builder title | Element handle … is registered by … rendered widgets on this page, and the reading handler named no instance. Read the handle from a part of the widget that binds it. |
| `MARKLESS_ELEMENT_HANDLE_PLURAL_IDREF` | compiler | semantic-graph | An array-typed element() handle cannot fill this position | Cannot resolve …={…} because "…" is declared as an array (element<T[]>()), so it names an ordered set of elements rather than one. |
| `MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED` | compiler | semantic-graph | Nested prop-forwarded element handles are not supported yet | Cannot bind el={…} because this slice only supports element handles passed as direct component props, not through arrays or nested object props. |
| `MARKLESS_ELEMENT_HANDLE_RENDER_READ` | compiler | semantic-graph | DOM handles cannot be read while rendering | Cannot render "…" because "…" is an element() handle, not serializable graph state. |
| `MARKLESS_ELEMENT_HANDLE_REQUIRED` | compiler | semantic-graph | el expects an element() handle | Cannot bind el={…} because "…" is …, not an element() handle. |
| `MARKLESS_ELEMENT_HANDLE_UNBOUND` | compiler | semantic-graph | element() handle is read before it is bound | Cannot read element handle "…" inside computed "…" in …: element() handles are DOM-bound and readable only in event handlers, so "…" is undefined on every derivation. (+1 more) |
| `MARKLESS_ELEMENT_MODULE_SCOPE` | compiler | semantic-graph | element() cannot be created at module scope | Cannot create element handle "…" at module scope. |
| `MARKLESS_EVENT_DISPATCH_UNMATCHED` | web | resume-events | TODO: no builder title | No event record matched … dispatch…. |
| `MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED` | compiler | capture-analysis | This event handler cannot run in the browser yet | Cannot emit lazy … symbol "…" because it reads component-local "…", a local … value that cannot cross a resume boundary. (+1 more) |
| `MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION` | compiler | semantic-graph | Event props need a function | `…={…}` passes the result of `…`, not a function. The expression would run once while rendering, and the click would receive a number. |
| `MARKLESS_EVENT_SPREAD_UNSUPPORTED` | compiler | semantic-graph | Event handlers cannot be spread onto an element | {...…} spreads … onto an element. Events compile to static view records, so handlers inside a spread would be discarded. |
| `MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED` | compiler | semantic-graph | Framework APIs cannot be aliased or passed as values | `… … = …` copies the framework API `…` into a plain variable. `…(5)` would not create graph state — the compiler only rewrites calls made through the imported name. |
| `MARKLESS_FRAMEWORK_API_RUNTIME_CALL` | core | framework-api, framework-api-runtime | TODO: no builder title | TODO: no builder message |
| `MARKLESS_FRAMEWORK_IMPORT_REQUIRED` | compiler | semantic-graph | Framework API must be imported | Cannot use …() until it is imported from markless. (+1 more) |
| `MARKLESS_IMPORTED_SYMBOL_CLAIMS_UNREADY` | bundler | hooks | TODO: no builder title | Source … could not seal imported symbol claims after final publications. |
| `MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED` | compiler | public-render | This list can never grow in the browser | … The browser has no renderer, so a row that arrives after the page loads has no markup to be built from: this list will render the rows the server sent, reorder them and remove them, and silently ignore every new one. |
| `MARKLESS_LEAN_PAYLOAD_MISSING` | web | event-only-lean | TODO: no builder title | TODO: no builder message |
| `MARKLESS_LINKED_RENDER_DATA_PAYLOAD_ACCESS` | web | payload-document-common | TODO: no builder title | linked render-data wake must not read markless/state or markless/view payload scripts. |
| `MARKLESS_MDX_RENDER_DATA_CHILD_MISSING` | router | vite | TODO: no builder title | TODO: no builder message |
| `MARKLESS_MDX_RENDER_DATA_ROOT_MISSING` | router | vite | TODO: no builder title | TODO: no builder message |
| `MARKLESS_MODULE_INSTANCE_DIVERGENT_HANDLERS` | compiler | symbol-modules | This module-scope instance would become one instance per handler | Module-scope instance "…" is carried into … handler modules (…). Each of those modules runs its own constructor, so they hold … separate instances and anything one of them records is invisible to the others. |
| `MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED` | compiler | semantic-graph | overlay can only be marked on host elements | Cannot mark overlay on component …. overlay elevates one concrete host element above the rest of the UI and needs a host element owner. |
| `MARKLESS_OVERLAY_VALUE_UNSUPPORTED` | compiler | semantic-graph | overlay accepts only a literal | …. overlay must be written on the element itself as bare `overlay`, `overlay={true}`, or `overlay={false}`. |
| `MARKLESS_PARSE_ERROR` | compiler | compile-module, parse, semantic-graph | TSRX parser rejected this source | yuku-tsrx reported: … |
| `MARKLESS_PAYLOAD_INVALID` | serializer, web | event-only-lean, fns, payload, payload-document-common, protocol-client, protocol-validation | Invalid Markless payload; Invalid resumability payload | Missing … payload script content. (+1 more) |
| `MARKLESS_PRERENDER_BOUNDARY_MISSING` | web | prerender | TODO: no builder title | TODO: no builder message |
| `MARKLESS_PRERENDER_BRANCH_MISSING` | web | prerender | TODO: no builder title | TODO: no builder message |
| `MARKLESS_PRERENDER_CHILD_MISSING` | web | prerender | TODO: no builder title | TODO: no builder message |
| `MARKLESS_PRERENDER_CONTAINER_MISSING` | bundler | build, vite | TODO: no builder title | expected exact #app build placeholder (+1 more) |
| `MARKLESS_PRERENDER_DATA_COMPONENT_MISSING` | web | prerender | TODO: no builder title | TODO: no builder message |
| `MARKLESS_PRERENDER_DATA_SYMBOL_MISSING` | web | fns, prerender | TODO: no builder title | TODO: no builder message |
| `MARKLESS_PRERENDER_PROP_UNDERIVABLE` | web | prerender | TODO: no builder title | TODO: no builder message |
| `MARKLESS_PRERENDER_RENDER_DATA_MISSING` | bundler | transform | TODO: no builder title | Imported child … from … has no linked render-data artifact. |
| `MARKLESS_PRERENDER_WAKE_RESOLVER_MISSING` | compiler | link | Prerender wake variant has no resolver to own its routes | MARKLESS_PRERENDER_WAKE_RESOLVER_MISSING |
| `MARKLESS_PROJECTION_NOT_RENDERED` | web | ssr-data | TODO: no builder title | <…> was given projected children but never rendered them, so they are counted by the served locator table and absent from the served HTML. Render `{children}` somewhere in <…>'s own markup, including inside an @if/@else arm. |
| `MARKLESS_PROTOCOL_VERSION_MISMATCH` | serializer | payload, protocol-client, protocol-validation | Unsupported resumability protocol version | Unsupported … protocol version …. |
| `MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT` | compiler | public-render | … passed render support checks but has no usable render plan | TODO: no builder message |
| `MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED` | compiler | public-render | No renderable component root was found; This component root cannot be rendered yet | No component with a TSRX template root was found, so the compiled module would render nothing. |
| `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT` | compiler | public-render | … is not rendered by the public render path yet | <…> contains an @try block, but <…> is a helper component in the same file as the page. Its @try/@pending/@catch content is dropped from the rendered HTML. (+5 more) |
| `MARKLESS_RENDER_BODY_UNSUPPORTED` | compiler | public-render | Component body statement is not supported by the render module | TODO: no builder message |
| `MARKLESS_RENDER_DATA_READER_SPECIFIER_UNRESOLVABLE` | bundler | transform | TODO: no builder title | … needs an absolute module filename, got …. |
| `MARKLESS_RENDER_DATA_STYLE_UNLINKED` | compiler | render-data | Render data links a scoped style module the link does not carry | Render data for … links scoped style module …, which this link does not carry. |
| `MARKLESS_REPEAT_BINDING_NAME_CONFLICT` | compiler | public-render | Two @for loops give the same name two different meanings | "…" is one @for loop's item and another @for loop's index in the same file. Rename one of them. |
| `MARKLESS_REPEAT_COLLECTION_UNREADABLE` | compiler | semantic-graph | This @for collection cannot be read; This @for collection names nothing; This @for collection reaches no cell on its shared instance | @for (const … of ...) has a collection the compiler could not read back as an expression, so the repeat has neither a state graph node nor an authored expression to take its rows from. It would render no rows at all. (+2 more) |
| `MARKLESS_REPEAT_KEY_DUPLICATE` | web | fns, repeat-runtime, resume-keyed-repeats | TODO: no builder title | Duplicate @for key … from …. (+2 more) |
| `MARKLESS_REPEAT_KEY_IS_INDEX` | compiler | semantic-graph | Keying by index makes row identity follow the position | key … identifies each row of … by its position, not by its data. If … reorders, inserts, or deletes, any row-local state, event wiring, and DOM reuse stay with the slot number. |
| `MARKLESS_REPEAT_KEY_REQUIRED` | compiler | semantic-graph | This @for needs a key | @for (const … of …) repeats reactive state without a key. When … changes, the rows of this list have no identity to update, reorder, or resume by. |
| `MARKLESS_REPEAT_KEY_UNSTABLE` | compiler | semantic-graph | @for key must identify the item stably | key … does not derive identity from … or an explicit index alias. Row state, event wiring, and DOM reuse follow the key, so rows of … could not be matched with themselves reliably. |
| `MARKLESS_REPEAT_ROWS_FROZEN` | compiler | semantic-graph | This @for renders its rows once and never updates them | @for (const … of …) takes its rows from `…`, which is neither a state cell nor a computed, so the repeat resolves to no graph node and its rows are built on the server and never rebuilt in the browser. The row body reads `…`, a … that can change after that render, and those rows would silently keep their first-render values. |
| `MARKLESS_RESOLVER_CLAIMS_DIVERGED` | compiler | link | Resolver claim sets disagree | Resolver … has incompatible final claim sets. |
| `MARKLESS_RESUME_ALREADY_RESUMED` | web | payload-resume-registry, resume, resume-already-resumed-warning | This container was already resumed | resumeFromPayloadDocument was called again on an already live container. |
| `MARKLESS_RESUME_LOCATOR_MISMATCH` | web | inline | TODO: no builder title | Resume locator … expected <…> at DOM order index … but found <…>. |
| `MARKLESS_RESUME_LOCATOR_MISSING` | web | inline, resume, resume-arm-records, resume-async-boundaries | TODO: no builder title | Arm-scoped branch … expected an arm-branch comment anchor at arm-local index …. (+2 more) |
| `MARKLESS_RESUME_RECORD_DELTA_DUPLICATE_KEY` | serializer | resume-record-delta, resume-record-merge | TODO: no builder title | TODO: no builder message |
| `MARKLESS_RESUME_RECORD_DELTA_REMOVAL_UNSUPPORTED` | serializer | resume-record-delta | TODO: no builder title | async runner set. (+2 more) |
| `MARKLESS_RESUME_RECORD_DELTA_VERSION_MISMATCH` | serializer | resume-record-delta, resume-record-merge | TODO: no builder title | TODO: no builder message |
| `MARKLESS_RESUME_RECORD_DIVERGENCE_UNSERIALIZABLE` | serializer | resume-record-delta | TODO: no builder title | … contains |
| `MARKLESS_ROUTER_DOCUMENT_STORAGE_UNSUPPORTED` | router | vite | TODO: no builder title | the document declares storage cells (…), but the router serves only the document's HTML, so their state payload never reaches the browser and they can never resume. Declare storage() at module scope in a component the page renders instead. |
| `MARKLESS_ROUTER_RENDER_DATA_MISSING` | router | route-renderer | TODO: no builder title | Navigated route … has no linked render-data module. |
| `MARKLESS_ROUTER_UNKNOWN_HASH_ROUTE` | router | spa-navigation | TODO: no builder title | Navigation to "…" matched no route file. |
| `MARKLESS_ROUTE_ARTIFACT_REGISTERED_LATE` | compiler | link | Client route artifact registered after its primary module transformed | Client route artifact … was registered after its primary module transformed. Register every production route artifact before transformation begins. |
| `MARKLESS_ROW_COMPONENT_INTERACTIVE` | web | fns | TODO: no builder title | <…> inside a @for row keyed by position has its own state, events, or async content, so its interactions cannot resume: an index key carries no row value to route them to. Key the @for by a stable field of the item, or keep components in index-keyed rows presentational (markup from item props, like <Link>). |
| `MARKLESS_ROW_ELEMENT_HANDLE_UNSUPPORTED` | compiler | semantic-graph | This is not a row-ownable element() handle | Cannot bind el={…} inside a keyed repeat. A row host takes a declared element() handle, named directly (el={row}) or as one member off a shared() instance (el={select.optionEls}). markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package |
| `MARKLESS_SCALAR_LEAN_ESCALATE` | web | event-only-lean | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SCALAR_WRITE_CELL_MISSING` | web | fns | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SCALAR_WRITE_GRAPH_MISSING` | web | fns | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SCALAR_WRITE_SHAPE` | web | fns | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SEED_CHILDREN_UNAVAILABLE` | compiler | public-render | These children cannot be seeded into shared state | <…> seeds "…" from its children, but the children written here contain markup or a value that is worked out while they render, so the seed would read nothing. |
| `MARKLESS_SERIALIZE_UNSUPPORTED_VALUE` | serializer | protocol-state, serialization, value | Cannot serialize graph state value | Cannot serialize value at … because unknown values are not durable graph state. (+2 more) |
| `MARKLESS_SERVER_DERIVE_UNREACHABLE` | compiler | public-render | This computed value cannot be worked out on the server | … Anything reading it would render as if the value were missing. |
| `MARKLESS_SETTLE_KERNEL_UNSUPPORTED` | web | settle-kernel | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SETTLE_PLAN_UNSUPPORTED` | web | fns | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SHARED_CALL_UNBOUND` | compiler | semantic-graph | a shared() call must be bound to a name | shared() definition "…" is called but its result is discarded. |
| `MARKLESS_SHARED_CALL_UNCOMPILED` | bundler | source-module | TODO: no builder title | … — a shared definition can only be called from a compiled module; this call site was not compiled. |
| `MARKLESS_SHARED_CALL_UNRESOLVED` | compiler | semantic-graph | Shared definition call does not resolve | `…` reaches no shared() definition. … |
| `MARKLESS_SHARED_COMPUTED_CROSS_MODULE` | compiler | foreign-scope, symbol-modules | A shared() computed cannot be read from another module yet ("…") | Serving this page works "…" out by copying its expression from … into this file. The copied expression names "…", and nothing in this module binds it, so rendering this page on the server would throw a ReferenceError. (+1 more) |
| `MARKLESS_SHARED_DEFINITION_CYCLE` | compiler | semantic-graph | Shared definitions cannot depend on each other circularly | Cannot create shared definition cycle "…". |
| `MARKLESS_SHARED_EXPORT_NAME_RESERVED` | bundler | source-module | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SHARED_FACTORY_CLASS_INSTANCE` | compiler | capture-analysis | A shared() factory cannot return a class instance | shared() definition "…" returns …, so the definition declares no fields at all: the payload carries nothing for it, and both the server render and the browser handler name a value that was never built. |
| `MARKLESS_SHARED_FAMILY_SCOPE_IMPLICIT` | compiler | semantic-graph | shared() family has no declared scope | … components in this module resolve shared() "…" (…), which is the shape of a widget family, but no scope is declared so it is page-scoped. |
| `MARKLESS_SHARED_INSTANCE_EXPORTED_FUNCTION` | compiler | symbol-modules | The exported function "…" resolves a shared() definition at module scope | "…" is exported from this file and calls `…()` in its body. A shared() instance is resolved by a component as it renders, and this function is not a component, so there is no instance for the call to return. Compiling this file drops the `export` keyword from "…" and carries the rest into the emitted symbol modules, where `…` is not carried at all — the definition ships as payload graph nodes rather than as code. The copy that lands would throw the moment it runs, and the export a consumer imported is gone. |
| `MARKLESS_SHARED_MEMBER_UNKNOWN` | compiler | state-lowering | Shared state has no such member | Cannot read "…" because the …() shared state declares no member named "…". |
| `MARKLESS_SHARED_METHOD_CROSS_MODULE` | compiler | symbol-modules | A shared() method cannot be called from another module yet (…) | The emitted … module for … was built by copying the body of … out of … into this file. … … |
| `MARKLESS_SHARED_SCOPE_INVALID` | compiler | semantic-graph | shared() scope must be valid | Unknown shared() scope …. Valid scopes are …. (+1 more) |
| `MARKLESS_SHARED_SEED_UNKNOWN_FIELD` | compiler | state-lowering | Shared instance has no such field to seed | Cannot write to "…" because "…()" declares no graph field named "…". Instance callback fields such as "…" are not supported yet (tracked). |
| `MARKLESS_SHARED_SEED_UNSUPPORTED` | compiler | state-lowering | Cannot seed shared state from this expression | Cannot seed "…" from "…" because a component body seeds a shared instance only from its own props or from constants. |
| `MARKLESS_SOURCE_SYMBOL_CLAIMS_DIVERGED` | compiler | link | Emitted symbol claims for one source disagree | Source … has incompatible emitted symbol claims in … and …. |
| `MARKLESS_SOURCE_SYMBOL_CLAIMS_FINAL_WITHOUT_START` | bundler | module-metadata-registry | TODO: no builder title | Source … published final claims without an active emitted variant. |
| `MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED` | bundler | module-metadata-registry | TODO: no builder title | Source … claims were consumed before final publication completed. Emitted variants that have not published: …. |
| `MARKLESS_SPREAD_STATIC_SNAPSHOT` | compiler | semantic-graph | Spread attributes render once | {...…} copies attributes during initial render. When … changes later, these attributes do not update. |
| `MARKLESS_SSR_DATA_ANCHOR_MISSING` | web | fns | TODO: no builder title | async:… (+1 more) |
| `MARKLESS_SSR_DATA_ANCHOR_START_MISSING` | web | ssr-data | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SSR_DATA_BOUNDARY_MISSING` | web | ssr-data | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SSR_DATA_BRANCH_SELECTOR_MISSING` | web | ssr-data | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SSR_DATA_CHILD_RENDERER_MISSING` | web | ssr-data | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SSR_DATA_CHILD_STRUCTURE_MISSING` | web | ssr-data | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SSR_DATA_CHUNK_MISSING` | web | ssr-data | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SSR_DATA_HOST_MISSING` | web | fns | TODO: no builder title | TODO: no builder message |
| `MARKLESS_SSR_DATA_SERVED_ARM_INVALID` | web | ssr-data | TODO: no builder title | TODO: no builder message |
| `MARKLESS_STATE_CONST_REASSIGNMENT` | compiler | state-lowering | Cannot reassign a const graph binding | Cannot update "…" because it was declared with const. JavaScript const binding semantics are preserved for state(). |
| `MARKLESS_STATE_CREATION_SITE_UNSTABLE` | compiler | semantic-graph | state() and computed() need a stable creation site | …() creates "…" …. That would ship a graph cell whose identity does not match when this code runs. |
| `MARKLESS_STATE_CROSS_MODULE_IMPORT` | compiler | semantic-graph | Imported module-scope state is not resumable | Cannot import graph state "…" from "…" into "…". |
| `MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED` | compiler | semantic-graph, state-lowering | Graph destructuring defaults are not supported yet; This prop default is only supported where the body assigns it | Cannot create graph alias "…" from "…" with a default value. (+1 more) |
| `MARKLESS_STATE_DYNAMIC_PATH_READ` | compiler | state-lowering | Cannot read from a dynamic graph path | Cannot read "…" because graph read paths must be statically resolvable. |
| `MARKLESS_STATE_DYNAMIC_PATH_WRITE` | compiler | state-lowering | Cannot write to a dynamic graph path | Cannot write to "…" because graph write paths must be statically resolvable. |
| `MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE` | compiler | semantic-graph, state-lowering | element() handles cannot be stored in state | Cannot store element handle "…" in state "…" because element handles are DOM locators, not serializable graph data. (+1 more) |
| `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` | compiler | semantic-graph | Helper-created state return shape is not supported; Helper-created state return shape is not supported yet; Imported helper-created state needs module analysis | Cannot call imported helper "…" from "…" as component state because graph analysis is not available for that module. (+2 more) |
| `MARKLESS_STATE_MODULE_ESCAPE` | compiler | state-lowering | Module-scope storage cannot be written from render or handlers | Cannot write to "…"…. |
| `MARKLESS_STATE_MODULE_SCOPE` | compiler | semantic-graph | state() and computed() cannot be created at module scope | Cannot create "…" with …() at module scope. |
| `MARKLESS_STATE_NESTED_CREATION` | compiler | semantic-graph | A framework API call cannot be a graph value; state() cannot be the initial value of another state() | `…` creates a computed whose value would be another …() call. `…` derives a value; it cannot derive graph nodes. (+1 more) |
| `MARKLESS_STATE_OPTIONAL_CHAIN_WRITE` | compiler | state-lowering | Cannot write graph state through optional chaining | Cannot write to "…" through optional chaining because graph writes must have definite targets. |
| `MARKLESS_STATE_PROPERTY_CLASS_INSTANCE` | compiler | capture-analysis | A class instance cannot be a field of a shared() or state() value | TODO: no builder message |
| `MARKLESS_STATE_READ_ONLY_WRITE` | compiler | state-lowering | Cannot write to a read-only graph binding | Cannot write to "…" because … are read-only. |
| `MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED` | compiler | public-render | Per-row state in keyed repeats is not supported yet | …() creates "…" inside a keyed @for row. Per-row cells need per-row graph scopes, which do not exist yet. |
| `MARKLESS_STATE_REST_ALIAS_EXCLUDED_PATH` | compiler | state-lowering | Cannot write through an object-rest excluded path | Cannot write to "…" because "…" was excluded when "…" was created. |
| `MARKLESS_STATE_STALE_LOCAL_WRITE` | compiler | state-lowering | Handler write would leave the template stale | Cannot write to "…" from a handler because the template reads the component local "…" only during initial render. |
| `MARKLESS_STATE_UNRESOLVED_WRITE` | compiler | state-lowering | Cannot resolve graph write target; Host-object write is not tracked as state | Cannot write to "…" because the compiler cannot resolve that target. (+1 more) |
| `MARKLESS_STATE_WRITE_IN_COMPUTED` | compiler | semantic-graph | A computed cannot write graph state | `…` writes to `…` while deriving a computed value. A computed is a graph read, so writing graph state there would re-trigger the same derivation. |
| `MARKLESS_STATE_WRITE_IN_TEMPLATE` | compiler | semantic-graph | Cannot write state inside a template expression | TODO: no builder message |
| `MARKLESS_STORAGE_KEY_STATIC` | compiler | semantic-graph | Storage fallback must be static; Storage key must be static | storage() requires its fallback to be a static string literal. (+1 more) |
| `MARKLESS_STORAGE_SEED_FALLBACK_MISSING` | bundler | transform | TODO: no builder title | … has no static string fallback. |
| `MARKLESS_STREAM_ARM_RENDER_MISSING` | web | render-to-stream | TODO: no builder title | Async boundary … settled during streaming, but the re-render pass produced no … in its …. The settled @try/@catch content cannot stream. |
| `MARKLESS_STYLE_OBJECT_UNSUPPORTED` | compiler | semantic-graph | This style object shape is not supported | style={…} uses …, which style objects do not support. Supported: an object literal written on the element, or an unmodified same-file `const` object literal referenced by name or flattened with `...spread`, with keys that are plain names or compile-time strings and values that are literals, state, computed values, or props. |
| `MARKLESS_SUBMODULE_UNSUPPORTED` | compiler | semantic-graph | TSRX submodules are not supported by this host yet | The identifier-source import "import ... from …;" has no submodule resolution in markless yet; nothing is split out of the client bundle. (+1 more) |
| `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` | compiler | symbol-modules | The emitted module for … is missing the declaration of "…"; This expression passes "…" around instead of calling it; This expression reads "…" in a shape the compiler cannot lower; This expression uses the row item "…" in a position the compiler cannot lower | The emitted … module for … still names "…" directly. … "…" is a shared() instance built by the component, and no instance exists inside the handler module, so this module would throw a ReferenceError the first time it runs. (+3 more) |
| `MARKLESS_SYNC_POLICY_UNEXTRACTABLE` | compiler | semantic-graph | Cannot extract synchronous event policy | Cannot extract a synchronous … policy for … because the guard is not limited to graph state, event fields, props, and constants. (+1 more) |
| `MARKLESS_TEMPLATE_AS_VALUE` | compiler | semantic-graph | A template is not a value | … puts a template… where Markless needs runtime data. Templates compile into page structure with locators, not values to store, pass, or serialize. |
| `MARKLESS_TEMPLATE_EXPRESSION_STATIC` | compiler | state-lowering | This expression reads state but never updates | This text reads `…`, but only plain reads like `{…}` update the page today. The expression renders its initial value and never changes when `…` changes. |
| `MARKLESS_TEMPLATE_READ_UNDECLARED` | compiler | public-render | Template read is not declared in render scope | TODO: no builder message |
| `MARKLESS_TEXT_UPDATE_RECORD_MISSING` | web | fns | TODO: no builder title | TODO: no builder message |
| `MARKLESS_TRY_BLOCK_TOGGLE_RERENDER` | compiler | public-render | Toggling this … re-renders the whole @try block | TODO: no builder message |
| `MARKLESS_TYPE_STRIP_FAILED` | bundler | transform | TODO: no builder title | … could not have its TypeScript syntax stripped. … |
| `MARKLESS_WIDGET_INSTANCE_UNRESOLVED` | web | fns | TODO: no builder title | … was read at dispatch from a part whose widget instance no rendered widget owns, so the read would answer for no instance at all. |
