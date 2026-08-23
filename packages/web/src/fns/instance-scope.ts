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
 * first, and every `rowFree` is non-empty, so an id carrying no instance path at
 * all - the parent's own page-space nodes, which a capture slot reads - matches
 * nothing and is left exactly as spelled.
 */
export type MarklessRowScope = ReadonlyArray<{
	readonly rowFree: string;
	readonly withRows: string;
}>;

export function marklessRecordRowScope(hostNodeId: string): MarklessRowScope | undefined {
	const path = marklessInstancePath(hostNodeId);
	if (!path.includes('r:')) return undefined;
	const pairs: Array<{ rowFree: string; withRows: string }> = [];
	let rowFree = '';
	let withRows = '';
	for (const segment of path.match(INSTANCE_SEGMENT) ?? []) {
		withRows += segment;
		if (segment.startsWith('r:')) continue;
		rowFree += segment;
		pairs.push({ rowFree, withRows });
	}
	return pairs.length > 0 ? pairs.reverse() : undefined;
}

export function marklessRowScopedGraphNodeId(graphNodeId: string, scope: MarklessRowScope): string {
	for (const { rowFree, withRows } of scope)
		if (graphNodeId.startsWith(rowFree))
			return withRows + graphNodeId.slice(rowFree.length);
	return graphNodeId;
}

// A dispatched bound symbol reaches this graph twice over: the capture adapter
// reads the parent's nodes as the parent spells them, and the bound base reads
// its own instance's nodes already carrying the build-time edge prefix. Only the
// second kind is a row's, which is what the prefix match above decides. The tag
// keeps a re-entrant dispatch - a bound handler invoking a parent callback that
// runs through this same path - from inserting the row a second time.
type MarklessRowScopedGraph = RuntimeGraph & { readonly marklessRowScope?: string };

export function marklessRowScopedGraph(
	graph: RuntimeGraph,
	scope: MarklessRowScope,
): RuntimeGraph {
	const tag = scope.map((pair) => pair.withRows).join('|');
	if ((graph as MarklessRowScopedGraph).marklessRowScope === tag) return graph;
	const qualify = (graphNodeId: string) => marklessRowScopedGraphNodeId(graphNodeId, scope);
	return {
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
			graph: marklessInstanceScopedGraph(context.graph, instancePath),
			...(context.read
				? {
						read: (graphNodeId: string, path?: ReadonlyArray<string>) =>
							context.graph.read(
								marklessComposedGraphNodeId(graphNodeId, instancePath),
								path,
							),
					}
				: {}),
		});
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
	// along with the projection sites composition registered them under.
	for (const definition of graph.listSharedDefinitions?.() ?? [])
		if (definition.scope === 'widget') {
			const rootPath = marklessInstancePath(definition.id);
			widgetRootPaths.set(definition.id, rootPath);
			for (const projectionId of definition.projectionIds ?? [])
				widgetRootPaths.set(projectionId, rootPath);
		}
	// Page-space families (shared, storage) keep their page ids through every adapter.
	const qualify = (graphNodeId: string) => marklessComposedGraphNodeId(graphNodeId, instancePath);
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

// Widget-scoped shared() definitions are the one page-space family that is NOT
// page-wide: one graph per rendered widget. This answers, for an id a part
// spells, WHICH rendered widget's instance path holds its nodes. Composition
// registers as it merges children; resume registers from the payload. A page
// with no widget-scoped definition never fills it and never pays for the lookup.
const widgetRootPaths = new Map<string, string>();

export function marklessRegisterWidgetInstanceIds(ids: Iterable<string>): void {
	for (const id of ids) widgetRootPaths.set(id, marklessInstancePath(id));
}

// A part is a SIBLING of the root composition placed it in (`c0:p1:` beside
// `c0:c0:`), so the walk below cannot reach that root from the part's own path;
// the composing child declared where its children land and this is that answer.
export function marklessRegisterWidgetProjections(
	entries: Iterable<readonly [string, string]>,
): void {
	for (const [id, rootPath] of entries) widgetRootPaths.set(id, rootPath);
}

// The widget this child-local `shared:` id belongs to: the answer registered for
// the longest prefix of the reading instance's path.
function marklessWidgetRootPath(graphNodeId: string, instancePath: string): string {
	if (widgetRootPaths.size === 0) return '';
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
	return '';
}

// Every id family a component owns is instance-local; a page-scoped shared()
// graph and a persisted storage slot are page-space on purpose. The compiler
// refuses at build time to emit an id belonging to neither, so this stays a
// concatenation.
export function marklessComposedGraphNodeId(graphNodeId: string, instancePath: string): string {
	if (!instancePath) return graphNodeId;
	const pageSpace = PAGE_SPACE_ID.exec(graphNodeId);
	if (!pageSpace) return instancePath + graphNodeId;
	if (pageSpace[2] === 'storage') return graphNodeId;
	// Only a widget lookup writes a prefix onto a `shared:` id, so a prefixed one
	// names a widget root: composing it AGAIN is another rendered widget.
	return pageSpace[1]
		? instancePath + graphNodeId
		: marklessWidgetRootPath(graphNodeId, instancePath) + graphNodeId;
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
	const prefixHost = <T extends { readonly hostNodeId: string }>(record: T): T => ({
		...record,
		hostNodeId: prefix + record.hostNodeId,
	});
	const qualifyRead = <T extends { readonly graphNodeId: string }>(read: T): T => ({
		...read,
		graphNodeId: marklessComposedGraphNodeId(read.graphNodeId, instancePath),
	});
	// Arm-scoped branch records ride the protocol's untyped record bag.
	const qualifyLooseRead = (record: Record<string, unknown>): Record<string, unknown> =>
		typeof record.graphNodeId === 'string'
			? { ...record, graphNodeId: marklessComposedGraphNodeId(record.graphNodeId, instancePath) }
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
		elementHandles: set.elementHandles.map(prefixHost),
		keyedRepeats: set.keyedRepeats?.map((repeat) => ({
			...repeat,
			id: prefix + repeat.id,
			parentHostNodeId: prefix + repeat.parentHostNodeId,
			...(repeat.collectionGraphNodeId
				? {
						collectionGraphNodeId: marklessComposedGraphNodeId(
							repeat.collectionGraphNodeId,
							instancePath,
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
