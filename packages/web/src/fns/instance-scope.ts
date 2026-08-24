import type { RuntimeGraph } from '@markless/runtime';
import { installComposedArmRecordQualifier } from '../resume-arm-records.ts';
import type { ResumeArmRecordSet, ResumeSymbol, ResumeSymbolContext } from '../resume-types.ts';

// A composed child's compiled symbols spell the child module's own graph node
// ids, but composition merged that child's nodes into the page graph under its
// instance path. The symbol id carries the same path, so every loader — the
// bundler's symbol route, the dev harness, a test's own loadSymbol — recovers
// the instance from the id it was asked for. INSTANCE_PATH restates the
// serializer's grammar; composed-page-space.test.ts keeps the two in step.
const INSTANCE_PATH = /^(?:[cp]\d+:|r:[^:]*:)+/;

// The one reading of a prefix as an instance path; host-minted prefixes (router `m<n>:`) are not one.
export function marklessInstancePath(prefix: string | undefined): string {
	return (prefix && INSTANCE_PATH.exec(prefix)?.[0]) || '';
}

const ROW_SEGMENT = /r:[^:]*:/g;

// Restates protocolRowSegment for the reason INSTANCE_PATH restates the grammar.
export function marklessRowSegment(key: unknown): string {
	return `r:${encodeURIComponent(String(key))}:`;
}

// Row segments are runtime identity, so no route literal or symbol table holds one.
export function marklessRowFreeSymbolId(symbolId: string, instancePath?: string): string {
	const path = instancePath ?? INSTANCE_PATH.exec(symbolId)?.[0] ?? '';
	if (!path.includes('r:')) return symbolId;
	return path.replace(ROW_SEGMENT, '') + symbolId.slice(path.length);
}

const INSTANCE_SEGMENT = /[cp]\d+:|r:[^:]*:/g;

/**
 * What a rendered row's record knows that a bound symbol's id cannot.
 *
 * A bound symbol is minted per component EDGE, so its id carries the build-time
 * branch/repeat scope and never a row value; the record that matched the
 * dispatch carries the value, as the `r:<key>:` segment of its host id. Each
 * pair here says: an id spelled against this row-free instance prefix belongs to
 * that rendered row, and reaches it under this with-rows prefix. Longest prefix
 * first, and every node-qualifying `rowFree` is non-empty, so an id carrying no
 * instance path at all - the parent's own page-space nodes, which a capture slot
 * reads - matches nothing and is left exactly as spelled.
 *
 * `rowBoundary` pairs are the exception, and only widget-root resolution reads
 * them. They stand at a row segment rather than after an edge segment, so their
 * `rowFree` may be empty; qualifying an ordinary node against one would drag the
 * parent's own page-space cells into the row.
 */
export type MarklessRowScope = ReadonlyArray<{
	readonly rowFree: string;
	readonly withRows: string;
	readonly rowBoundary?: boolean;
}>;

// A dispatch with no row still needs the widget-projection reading below; the
// empty pair list is what says "no row named, resolve the projection anyway".
const EMPTY_ROW_SCOPE: MarklessRowScope = [];

export function marklessRecordRowScope(
	hostNodeId: string,
	graph?: RuntimeGraph,
): MarklessRowScope | undefined {
	const path = marklessInstancePath(hostNodeId);
	// No row to thread, but a bound symbol still spells widget ids against its
	// projection site rather than the root that owns them, so a page carrying any
	// widget root gets the adapter with no pairs: widget resolution, nothing else.
	if (!path.includes('r:'))
		return marklessGraphWidgetRegistry(graph).rootPaths.size > 0 ? EMPTY_ROW_SCOPE : undefined;
	const pairs: Array<{ rowFree: string; withRows: string; rowBoundary?: boolean }> = [];
	let rowFree = '';
	let withRows = '';
	for (const segment of path.match(INSTANCE_SEGMENT) ?? []) {
		withRows += segment;
		// The boundary pair comes second at the same `rowFree`, so reversing puts
		// the row-carrying answer ahead of the plain one the edge segment pushed.
		if (segment.startsWith('r:')) {
			pairs.push({ rowFree, withRows, rowBoundary: true });
			continue;
		}
		rowFree += segment;
		pairs.push({ rowFree, withRows });
	}
	return pairs.length > 0 ? pairs.reverse() : undefined;
}

export function marklessRowScopedGraphNodeId(
	graphNodeId: string,
	scope: MarklessRowScope,
	registry: MarklessWidgetRegistry,
): string {
	const widget = marklessRowWidgetGraphNodeId(graphNodeId, scope, registry);
	if (widget !== undefined) return widget;
	for (const { rowFree, withRows, rowBoundary } of scope)
		if (!rowBoundary && graphNodeId.startsWith(rowFree))
			return withRows + graphNodeId.slice(rowFree.length);
	return graphNodeId;
}

/**
 * A widget-scoped `shared:` id as a bound symbol spells it: `c1:p2:shared:…`.
 *
 * The prefix is the component EDGE the widget's part was compiled at, so it
 * names no row - while the widget-root registry holds one root per RENDERED
 * widget, filed under the row the root was rendered in. Asking it with the edge
 * path finds nothing, `marklessComposedGraphNodeId` leaves the id in page space,
 * and the write lands on an id no rendered widget owns: the record matches, the
 * symbol runs, and nothing moves. Threading the dispatched record's row through
 * the edge path first is what makes the lookup reach this row's own root.
 *
 * `undefined` means "no rendered widget owns this id", and every such id - a
 * storage slot, a page-scoped `shared()` graph - falls through to the caller and
 * resolves exactly as it does today. A widget rooted OUTSIDE every row is not
 * one of them: no row can answer it, so the projection site answers it below.
 */
function marklessRowWidgetGraphNodeId(
	graphNodeId: string,
	scope: MarklessRowScope,
	registry: MarklessWidgetRegistry,
): string | undefined {
	const pageSpace = PAGE_SPACE_ID.exec(graphNodeId);
	// A prefix already carrying a row is either resolved or a re-entrant pass
	// over an id this same adapter wrote; the graph tag catches the common case.
	if (!pageSpace || pageSpace[2] !== 'shared' || !pageSpace[1] || pageSpace[1].includes('r:'))
		return undefined;
	const edgePath = pageSpace[1];
	const sharedId = graphNodeId.slice(edgePath.length);
	for (const { rowFree, withRows } of scope) {
		if (!edgePath.startsWith(rowFree)) continue;
		const rootPath = marklessWidgetRootPath(
			sharedId,
			withRows + edgePath.slice(rowFree.length),
			registry,
		);
		if (rootPath) return rootPath + sharedId;
	}
	// The prefix walk above can only CHOP segments, so it never crosses a root
	// that stands deeper than the reading edge path; a widget rooted inside this
	// dispatch's row is exactly that shape.
	const rowRooted = marklessRowRootedGraphNodeId(sharedId, edgePath, scope, registry);
	if (rowRooted) return rowRooted;
	// No row answered - either none was named, or the widget is rooted outside
	// every row the dispatch is in. The projection site itself is then the whole
	// question the registry was built to answer, and an id whose prefix already
	// names its own root resolves back to itself.
	const rootPath = marklessWidgetRootPathThroughRows(sharedId, edgePath, registry);
	return rootPath ? rootPath + sharedId : undefined;
}

/**
 * The rendered root this dispatch's ROW holds for the definition being read.
 *
 * The two spellings of one containment differ by more than the row. A part
 * authored inside a repeat is compiled once, at the projection edge the repeat
 * itself sits at (`c0:`), while the renderer files one root per rendered row and
 * files it under the row's own projection slot as well (`r:banana:c0:p1:`). The
 * prefix walk in `widgetRootPathFor` only ever chops segments off the right, so
 * from `c0:` it can reach `c0:` and nothing longer: the row's root is invisible
 * to it, the projection site answers with the template definition no row ever
 * rendered into, and the read comes back undefined. That is what makes a keyed
 * option's click write `undefined` into its group.
 *
 * Asked from the other end it is exact: the dispatched record names the row, the
 * registry holds one root per rendered row, and only one of them both stands
 * inside that row and extends the edge path the reader spelled. Rows are tried
 * longest first, so a nested repeat answers with its innermost row. Anything
 * less than a single answer is left to the caller - two roots matching means the
 * question was ambiguous, and an ambiguous id must resolve exactly as it does
 * today rather than pick one.
 */
function marklessRowRootedGraphNodeId(
	sharedId: string,
	edgePath: string,
	scope: MarklessRowScope,
	registry: MarklessWidgetRegistry,
): string | undefined {
	if (registry.rowRooted.size === 0) return undefined;
	// `sharedId` is either a definition id or one of its nodes, and the module
	// path inside it carries separators of its own - so ask both ways rather than
	// guess which separator splits them.
	const slash = sharedId.lastIndexOf('/');
	const definitionId = registry.rowRooted.has(sharedId)
		? sharedId
		: slash > 0 && registry.rowRooted.has(sharedId.slice(0, slash))
			? sharedId.slice(0, slash)
			: undefined;
	if (definitionId === undefined) return undefined;
	for (const { withRows } of scope) {
		if (!withRows.includes('r:')) continue;
		let answer: string | undefined;
		for (const [id, rootPath] of registry.rootPaths) {
			if (!rootPath.startsWith(withRows) || id !== rootPath + definitionId) continue;
			const beyondRow = rootPath.slice(withRows.length);
			// One containment, two spellings: whichever is shorter must be a prefix
			// of the other, or these are different places that share a row.
			if (!beyondRow.startsWith(edgePath) && !edgePath.startsWith(beyondRow)) continue;
			if (answer !== undefined && answer !== rootPath) return undefined;
			answer = rootPath;
		}
		if (answer !== undefined) return answer + sharedId;
	}
	return undefined;
}

// A dispatched bound symbol reaches this graph twice over: the capture adapter
// reads the parent's nodes as the parent spells them, and the bound base reads
// its own instance's nodes already carrying the build-time edge prefix. Only the
// second kind is a row's, which is what the prefix match above decides. The tag
// keeps a re-entrant dispatch - a bound handler invoking a parent callback that
// runs through this same path - from inserting the row a second time.
type MarklessRowScopedGraph = MarklessScopedGraph & { readonly marklessRowScope?: string };

export function marklessRowScopedGraph(
	graph: RuntimeGraph,
	scope: MarklessRowScope,
): RuntimeGraph {
	const tag = scope.map((pair) => pair.withRows).join('|');
	if ((graph as MarklessRowScopedGraph).marklessRowScope === tag) return graph;
	const registry = marklessGraphWidgetRegistry(graph);
	const qualify = (graphNodeId: string) =>
		marklessRowScopedGraphNodeId(graphNodeId, scope, registry);
	const scoped = {
		...graph,
		marklessRowScope: tag,
		read: (graphNodeId, path) => graph.read(qualify(graphNodeId), path),
		write: (write) => graph.write({ ...write, graphNodeId: qualify(write.graphNodeId) }),
		update: (update) => graph.update({ ...update, graphNodeId: qualify(update.graphNodeId) }),
		call: (call) => graph.call({ ...call, graphNodeId: qualify(call.graphNodeId) }),
		delete: (deletion) =>
			graph.delete({ ...deletion, graphNodeId: qualify(deletion.graphNodeId) }),
		subscribe: (subscription) =>
			graph.subscribe({ ...subscription, graphNodeId: qualify(subscription.graphNodeId) }),
	} as MarklessRowScopedGraph;
	// A wrapper is a new object, so it would otherwise mint a registry of its own
	// and re-read every definition. File it against the one its base already has.
	marklessShareWidgetRegistry(scoped, registry);
	return scoped;
}

// A symbol loaded through the child's own composed loader already answers in
// page space, so resume must not scope it a second time.
const composedSymbols = new WeakSet<object>();

export function marklessMarkComposedSymbol<T extends object>(symbol: T): T {
	composedSymbols.add(symbol);
	return symbol;
}

export function marklessInstanceScopedLoadSymbol(
	loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>,
): (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol> {
	return (symbolId: string) => {
		const instancePath = INSTANCE_PATH.exec(symbolId)?.[0];
		if (!instancePath) return loadSymbol(symbolId);
		// The row is consumed here and re-applied below as graph scope.
		const loaded = loadSymbol(marklessRowFreeSymbolId(symbolId, instancePath));
		return typeof (loaded as Promise<ResumeSymbol>)?.then === 'function'
			? (loaded as Promise<ResumeSymbol>).then((symbol) => scopeSymbol(symbol, instancePath))
			: scopeSymbol(loaded as ResumeSymbol, instancePath);
	};
}

function scopeSymbol(symbol: ResumeSymbol, instancePath: string): ResumeSymbol {
	if (composedSymbols.has(symbol)) return symbol;
	return (context: ResumeSymbolContext) =>
		symbol({
			...context,
			// A CSR container activates its authored behaviors BEFORE it demand-loads
			// the runtime graph, so a behavior on an element inside a component
			// arrives with no graph at all - the context type says otherwise,
			// render-csr.ts casts one in. There is nothing to scope, and the behavior
			// still has to run: it gets the absent graph its caller handed over,
			// exactly as a behavior on the root component's own element already does.
			// Only the element handles carry a scope a graph-less context can honour.
			graph: (context.graph &&
				marklessInstanceScopedGraph(context.graph, instancePath)) as RuntimeGraph,
			getElementHandle: marklessInstanceScopedElementHandle(
				context.getElementHandle,
				instancePath,
				context.graph,
			),
			...(context.read
				? {
						read: (graphNodeId: string, path?: ReadonlyArray<string>) =>
							context.graph.read(
								marklessComposedGraphNodeId(
									graphNodeId,
									instancePath,
									marklessGraphWidgetRegistry(context.graph),
								),
								path,
							),
					}
				: {}),
		});
}

/**
 * A widget-scoped `element()` handle names one element PER RENDERED WIDGET, and
 * its compiled id is one module-level string every instance of that widget
 * spells. Qualifying it exactly as the widget's graph nodes are qualified is
 * what turns it back into a key: the registration and the reading handler both
 * land on the rendered widget's own root path, so a page carrying two instances
 * answers each handler with its own element instead of the last registration.
 *
 * A handle that is not widget-scoped is returned untouched. A component-local
 * handle is already one element per key, and a page-scoped `shared()` graph is
 * page space by design.
 */
export function marklessWidgetHandleId(
	handleId: string,
	instancePath: string,
	registry: MarklessWidgetRegistry = marklessWidgetScope.active,
): string {
	if (!instancePath) return handleId;
	const pageSpace = PAGE_SPACE_ID.exec(handleId);
	if (!pageSpace || pageSpace[2] !== 'shared') return handleId;
	return marklessComposedGraphNodeId(handleId, instancePath, registry);
}

/**
 * The reading half of the same key.
 *
 * The compiled symbol asks for the module-level id, so the instance it is
 * running in is what has to be added here. The qualified id is asked first; the
 * id exactly as compiled answers when this page registered no qualified handle
 * at all - a single-instance page, or a handle whose host never travelled
 * through composition. The registry itself refuses a raw id that more than one
 * rendered widget registered, so the fallback can never hand back an arbitrary
 * instance's element.
 */
export function marklessInstanceScopedElementHandle(
	getElementHandle: ResumeSymbolContext['getElementHandle'],
	instancePath: string,
	graph?: RuntimeGraph,
): ResumeSymbolContext['getElementHandle'] {
	// Several context builders cast an object literal into the symbol context, so
	// a context that never carried a handle reader reaches here as undefined.
	if (typeof getElementHandle !== 'function') return getElementHandle;
	return (handleIdOrName: string) => {
		// Resolved per read, not per symbol: the widget registry is filled by the
		// scoped graph this same context builds, so the answer exists only once the
		// symbol body runs.
		const scoped = marklessWidgetHandleId(
			handleIdOrName,
			instancePath,
			graph ? marklessGraphWidgetRegistry(graph) : marklessWidgetScope.active,
		);
		return (
			(scoped === handleIdOrName ? undefined : getElementHandle(scoped)) ??
			getElementHandle(handleIdOrName)
		);
	};
}

// Only ids the symbol itself spells are child-local. Shared definitions and the
// graph's own bookkeeping (journal, flush, subscriptions by record id) stay in
// page space.
/**
 * The scope adapter's own reading of where the symbol it wraps is running.
 * A symbol that dispatches to ANOTHER instance's symbol needs both: the
 * unscoped page graph to hand it (its own path already rides its symbol id),
 * and this path to say which rendered widget it dispatched from.
 */
export type MarklessScopedGraph = RuntimeGraph & {
	readonly marklessPageGraph?: RuntimeGraph;
	readonly marklessInstancePath?: string;
};

export function marklessInstanceScopedGraph(
	graph: RuntimeGraph,
	instancePath: string,
): MarklessScopedGraph {
	if (!instancePath) return graph;
	// Resume loads a widget piece's symbol by its instance path alone; the widget
	// roots it must map onto are the qualified definition ids the payload carries,
	// along with the projection sites composition registered them under. Re-read
	// per adapter, not once per registry: a settled arm can add definitions after
	// this graph's registry was first asked for.
	const registry = marklessGraphWidgetRegistry(graph);
	marklessNoteGraphWidgetRoots(registry, graph);
	// Page-space families (shared, storage) keep their page ids through every adapter.
	const qualify = (graphNodeId: string) =>
		marklessComposedGraphNodeId(graphNodeId, instancePath, registry);
	return {
		...graph,
		marklessPageGraph: (graph as MarklessScopedGraph).marklessPageGraph ?? graph,
		marklessInstancePath: instancePath,
		read: (graphNodeId, path) => graph.read(qualify(graphNodeId), path),
		write: (write) => graph.write({ ...write, graphNodeId: qualify(write.graphNodeId) }),
		update: (update) => graph.update({ ...update, graphNodeId: qualify(update.graphNodeId) }),
		call: (call) => graph.call({ ...call, graphNodeId: qualify(call.graphNodeId) }),
		delete: (deletion) =>
			graph.delete({ ...deletion, graphNodeId: qualify(deletion.graphNodeId) }),
		subscribe: (subscription) =>
			graph.subscribe({
				...subscription,
				graphNodeId: qualify(subscription.graphNodeId),
			}),
	};
}

// Mirrors PROTOCOL_PAGE_SPACE_ID_PREFIXES, past any instance path a nested
// compose already applied; composed-page-space.test.ts keeps the two in step so
// the browser never imports the serializer's protocol module.
const PAGE_SPACE_ID = /^((?:[cp]\d+:|r:[^:]*:)*)(shared|storage):/;

/**
 * One render's answer to "which rendered widget owns this id".
 *
 * Widget-scoped shared() definitions are the one page-space family that is NOT
 * page-wide: one graph per rendered widget. `rootPaths` answers, for an id a
 * part spells, WHICH rendered widget's instance path holds its nodes.
 * Composition fills it as it merges children; resume fills it from the payload.
 * A page with no widget-scoped definition never fills it and never pays for the
 * lookup.
 *
 * `rowRooted` names the definitions at least one of whose rendered roots stands
 * inside a repeat. Such a widget has one graph per ROW, so which graph an id
 * names is runtime identity - and the reading instance path of a dispatched
 * bound symbol carries no row, because a bound symbol is minted per component
 * EDGE. That set is what tells the two failures apart below: an id no widget
 * claims at all, and an id whose widget is real but whose row has yet to arrive.
 */
export type MarklessWidgetRegistry = {
	readonly rootPaths: Map<string, string>;
	readonly rowRooted: Set<string>;
};

/**
 * One registry per RUNTIME GRAPH, and a graph is one rendered page.
 *
 * A widget root path is only ever an answer about the container that rendered
 * it, so a realm-wide map is a category error: two Markless roots on one page
 * each render their own widgets, and a torn-down container's roots must not
 * answer for the render that replaces it. Filing the registry against the graph
 * makes both true by construction - the entries die with the graph, and a
 * lookup can only reach the rendered widgets of the graph it was asked about.
 *
 * The key is the PAGE graph, recovered through `marklessPageGraph`, because
 * every scope adapter below hands its symbol a fresh wrapper object over the
 * same page graph and all of them must reach the same answer.
 */
const graphRegistries = new WeakMap<object, MarklessWidgetRegistry>();

// Nothing writes to this one. It is the answer for a lookup with no graph in
// hand and no compose running: no rendered widget, so no id belongs to one.
const NO_WIDGETS: MarklessWidgetRegistry = { rootPaths: new Map(), rowRooted: new Set() };

/**
 * Which registry the lookups below read when the CALLER names no graph.
 *
 * Two readers cannot name one. Inside a compose there is no graph yet, so
 * composition.ts swaps this to the render's own registry and swaps it back.
 * And the generated symbol-resolver module's bound-symbol adapter holds the
 * dispatching graph in a closure it never passes on, so it reaches this field
 * instead - which is why every entry point that DOES hold a graph points this
 * at that graph's registry before running anything (`marklessScopeWidgetsTo`).
 *
 * `composing` is what keeps a dispatch from stealing the field out from under a
 * compose. Only a server ever composes and dispatches at once.
 */
export const marklessWidgetScope = { active: NO_WIDGETS, composing: false };

/**
 * Points the graph-less readers at the registry of the graph now being read.
 *
 * A dispatch is not synchronous, so this is a pointer re-aimed per entry rather
 * than a scope that unwinds: the next entry re-aims it, and a torn-down
 * container's registry is never re-aimed at again. Two containers dispatching
 * async bodies that interleave their writes are the one case it cannot separate
 * - the readers that hold a graph are exact regardless.
 */
function marklessScopeWidgetsTo(registry: MarklessWidgetRegistry): MarklessWidgetRegistry {
	if (!marklessWidgetScope.composing) marklessWidgetScope.active = registry;
	return registry;
}

function marklessRegistryHolder(graph: RuntimeGraph): object {
	return (graph as MarklessScopedGraph).marklessPageGraph ?? graph;
}

/**
 * This graph's rendered widgets, minted on first ask and filled from the graph
 * itself: the payload's widget-scoped definitions carry their qualified root ids
 * and the projection sites composition registered them under, which is every
 * answer a lookup needs and the only place resume has ever read them from.
 */
export function marklessGraphWidgetRegistry(graph?: RuntimeGraph): MarklessWidgetRegistry {
	if (!graph) return marklessWidgetScope.active;
	const holder = marklessRegistryHolder(graph);
	const held = graphRegistries.get(holder);
	if (held) return marklessScopeWidgetsTo(held);
	const registry: MarklessWidgetRegistry = { rootPaths: new Map(), rowRooted: new Set() };
	graphRegistries.set(holder, registry);
	marklessNoteGraphWidgetRoots(registry, graph);
	return marklessScopeWidgetsTo(registry);
}

// Every scope adapter hands its symbol a fresh wrapper over the same page graph,
// and all of them must reach the one registry that page's widgets are filed in.
function marklessShareWidgetRegistry(graph: object, registry: MarklessWidgetRegistry): void {
	graphRegistries.set(graph, registry);
}

function marklessNoteGraphWidgetRoots(registry: MarklessWidgetRegistry, graph: RuntimeGraph): void {
	for (const definition of graph.listSharedDefinitions?.() ?? [])
		if (definition.scope === 'widget') {
			const rootPath = marklessInstancePath(definition.id);
			marklessNoteWidgetRoot(registry, definition.id, rootPath);
			for (const projectionId of definition.projectionIds ?? [])
				marklessNoteWidgetRoot(registry, projectionId, rootPath);
		}
}

export function marklessNoteWidgetRoot(
	registry: MarklessWidgetRegistry,
	id: string,
	rootPath: string,
): void {
	registry.rootPaths.set(id, rootPath);
	if (rootPath.includes('r:'))
		registry.rowRooted.add(id.slice(marklessInstancePath(id).length));
}

// The widget this child-local `shared:` id belongs to: the answer registered for
// the longest prefix of the reading instance's path.
function marklessWidgetRootPath(
	graphNodeId: string,
	instancePath: string,
	registry: MarklessWidgetRegistry,
): string {
	return widgetRootPathFor(graphNodeId, instancePath, registry) ?? '';
}

/**
 * The same question asked of a path that may carry rows the ROOT does not.
 *
 * One root per rendered widget means a root inside a repeat is registered under
 * its row and a root outside one is registered without any - but a part
 * projected INTO an outside root from inside the repeat carries the row in its
 * own path regardless. The walk below chops segments off the right, so a leading
 * `r:<key>:` blocks it from ever reaching that root. Rows are asked first, so a
 * per-row root always wins over the row-free reading; only a path no rendered
 * row answers is asked again with its rows dropped.
 */
function marklessWidgetRootPathThroughRows(
	graphNodeId: string,
	instancePath: string,
	registry: MarklessWidgetRegistry,
): string {
	const withRows = widgetRootPathFor(graphNodeId, instancePath, registry);
	if (withRows !== undefined) return withRows;
	const rowFree = instancePath.replace(ROW_SEGMENT, '');
	if (rowFree === instancePath) return '';
	return widgetRootPathFor(graphNodeId, rowFree, registry) ?? '';
}

/**
 * The two spellings of one containment, and the one that has to wait for a row.
 *
 * A widget root is filed under the path it RENDERED at, rows and all
 * (`r:page%3A5:c0:p2:`). A dispatching bound symbol runs at the compose tree's
 * path for that same containment, which names the component edges and no row
 * (`c0:p2:p3:`) - a bound symbol is minted per edge, and a row key is a runtime
 * value no symbol id can hold. Neither spelling is a prefix of the other, so the
 * walk above can never get from one to the other on its own.
 *
 * Leaving the id in page space here is what breaks the projection bridge: the
 * write lands on an id no rendered widget owns, the record matches, the symbol
 * runs, and nothing moves. Keeping the reading path ON the id instead hands the
 * question to `marklessRowWidgetGraphNodeId`, which is spelled for exactly this
 * input - it holds the dispatched record's rows and re-asks the registry with
 * them, reaching the ONE root this row rendered. An alias resolved at lookup,
 * never a second registry entry, so one containment still yields one instance.
 *
 * Two guards keep that from minting a phantom instance instead. The path must
 * carry no row of its own, because a path that already names its rows and STILL
 * found no root is not waiting on one. And the definition must be one some row
 * really did root: an id belonging to no widget at all - a page-scoped
 * `shared()` graph, a storage slot - is page space and stays exactly as spelled.
 */
function marklessUnresolvedWidgetGraphNodeId(
	graphNodeId: string,
	instancePath: string,
	registry: MarklessWidgetRegistry,
): string {
	const rowRootedDefinitions = registry.rowRooted;
	if (instancePath.includes('r:') || rowRootedDefinitions.size === 0) return graphNodeId;
	const slash = graphNodeId.lastIndexOf('/');
	const rowRooted =
		rowRootedDefinitions.has(graphNodeId) ||
		(slash > 0 && rowRootedDefinitions.has(graphNodeId.slice(0, slash)));
	return rowRooted ? instancePath + graphNodeId : graphNodeId;
}

// `undefined` is "no widget claims this id from here", which is not the same
// answer as a widget whose root is the page itself.
function widgetRootPathFor(
	graphNodeId: string,
	instancePath: string,
	registry: MarklessWidgetRegistry,
): string | undefined {
	const widgetRootPaths = registry.rootPaths;
	if (widgetRootPaths.size === 0) return undefined;
	// The id is either a definition id (`shared:<file>#<export>`) or one of its
	// nodes (`<definitionId>/<kind>:<name>`). The definition id carries the module
	// path, which has separators of its own, so ask the registry both ways instead
	// of guessing which separator splits them.
	const slash = graphNodeId.lastIndexOf('/');
	for (let end = instancePath.length; end > 0; end--) {
		if (instancePath[end - 1] !== ':') continue;
		const prefix = instancePath.slice(0, end);
		const rootPath =
			widgetRootPaths.get(prefix + graphNodeId) ??
			(slash > 0 ? widgetRootPaths.get(prefix + graphNodeId.slice(0, slash)) : undefined);
		if (rootPath !== undefined) return rootPath;
	}
	return undefined;
}

// Every id family a component owns is instance-local; a page-scoped shared()
// graph and a persisted storage slot are page-space on purpose. The compiler
// refuses at build time to emit an id belonging to neither, so this stays a
// concatenation.
export function marklessComposedGraphNodeId(
	graphNodeId: string,
	instancePath: string,
	registry: MarklessWidgetRegistry = marklessWidgetScope.active,
): string {
	if (!instancePath) return graphNodeId;
	const pageSpace = PAGE_SPACE_ID.exec(graphNodeId);
	if (!pageSpace) return instancePath + graphNodeId;
	if (pageSpace[2] === 'storage') return graphNodeId;
	// Only a widget lookup writes a prefix onto a `shared:` id, so a prefixed one
	// names a widget root: composing it AGAIN is another rendered widget.
	if (pageSpace[1]) return instancePath + graphNodeId;
	const rootPath = marklessWidgetRootPathThroughRows(graphNodeId, instancePath, registry);
	if (rootPath) return rootPath + graphNodeId;
	return marklessUnresolvedWidgetGraphNodeId(graphNodeId, instancePath, registry);
}

// Composed child-owned boundaries load their update symbol through the
// instance prefix riding boundary.id (c0:boundary:1 -> prefix "c0:"). The
// arm-render module mints records in the child module's own id space, so
// committed host, symbol, arm-branch, AND graph node ids take the same prefix
// before registration — host ids join the page-wide host map, symbol ids
// resolve through the same prefix routes the update symbol itself resolved
// through, and graph reads land on the instance's own cells (the child's nodes
// were merged into the page graph under this path). Page-space ids (shared,
// storage) are excepted by marklessComposedGraphNodeId.
function composedBoundaryArmRecords(
	boundaryId: string,
	set: ResumeArmRecordSet,
	graph?: RuntimeGraph,
): ResumeArmRecordSet {
	const exhaustive = {
		locators: true,
		events: true,
		domUpdates: true,
		behaviors: true,
		elementHandles: true,
		keyedRepeats: true,
		branches: true,
	} satisfies Record<keyof ResumeArmRecordSet, true>;
	void exhaustive;
	const prefix = boundaryId.slice(0, boundaryId.lastIndexOf('boundary:'));
	if (!prefix) return set;
	// Host/symbol ids take the whole prefix; graph ids only its instance-path part.
	const instancePath = marklessInstancePath(prefix);
	const registry = marklessGraphWidgetRegistry(graph);
	const prefixHost = <T extends { readonly hostNodeId: string }>(record: T): T => ({
		...record,
		hostNodeId: prefix + record.hostNodeId,
	});
	const qualifyRead = <T extends { readonly graphNodeId: string }>(read: T): T => ({
		...read,
		graphNodeId: marklessComposedGraphNodeId(read.graphNodeId, instancePath, registry),
	});
	// Arm-scoped branch records ride the protocol's untyped record bag.
	const qualifyLooseRead = (record: Record<string, unknown>): Record<string, unknown> =>
		typeof record.graphNodeId === 'string'
			? {
					...record,
					graphNodeId: marklessComposedGraphNodeId(
						record.graphNodeId,
						instancePath,
						registry,
					),
				}
			: record;
	return {
		locators: set.locators.map(prefixHost),
		events: set.events.map((event) => ({
			...prefixHost(event),
			symbolIds: event.symbolIds.map((symbolId) => prefix + symbolId),
		})),
		domUpdates: set.domUpdates?.map((update) => ({
			...prefixHost(qualifyRead(update)),
			...(update.symbolId ? { symbolId: prefix + update.symbolId } : {}),
		})),
		behaviors: set.behaviors.map((behavior) => ({
			...prefixHost(behavior),
			...(behavior.inputGraphReads
				? { inputGraphReads: behavior.inputGraphReads.map(qualifyRead) }
				: {}),
			...(behavior.symbolId ? { symbolId: prefix + behavior.symbolId } : {}),
		})),
		elementHandles: set.elementHandles.map((handle) => ({
			...prefixHost(handle),
			handleId: marklessWidgetHandleId(handle.handleId, instancePath, registry),
		})),
		keyedRepeats: set.keyedRepeats?.map((repeat) => ({
			...repeat,
			id: prefix + repeat.id,
			parentHostNodeId: prefix + repeat.parentHostNodeId,
			...(repeat.collectionGraphNodeId
				? {
						collectionGraphNodeId: marklessComposedGraphNodeId(
							repeat.collectionGraphNodeId,
							instancePath,
							registry,
						),
					}
				: {}),
			rowEvents: repeat.rowEvents.map((event) => ({
				...event,
				symbolIds: event.symbolIds.map((symbolId) => prefix + symbolId),
			})),
		})),
		...(set.branches
			? {
					branches: set.branches.map((branch) => ({
						...branch,
						id: prefix + branch.id,
						testReads: branch.testReads.map(qualifyRead),
						...(branch.symbolId ? { symbolId: prefix + branch.symbolId } : {}),
						...(branch.armRecords
							? {
									armRecords: branch.armRecords.map((arm) => ({
										...arm,
										events: (arm.events ?? []).map((event) => ({
											...event,
											symbolIds: (event.symbolIds ?? []).map(
												(symbolId) => prefix + symbolId,
											),
										})),
										domUpdates: (arm.domUpdates ?? []).map((update) => ({
											...qualifyLooseRead(update),
											...(update.symbolId
												? { symbolId: prefix + update.symbolId }
												: {}),
										})),
									})),
								}
							: {}),
					})),
				}
			: {}),
	};
}

/**
 * Teaches this app's settle path to re-spell a composed child's arm records in
 * page space. The bundler emits a call to it in the generated source/resume
 * module when, and only when, the page has component edges (the same gate that
 * emits its symbol routes), so a non-composing page never loads this module and
 * its settle path registers arm records untouched. The call is explicit because
 * `@markless/web` declares `sideEffects: false`.
 */
export function installMarklessComposedArmRecords(): void {
	installComposedArmRecordQualifier(composedBoundaryArmRecords);
}
