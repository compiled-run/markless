import { marklessBoundSymbolId, marklessLiveBoundGraphRoute } from './bound-symbol.ts';
import {
	marklessComposedGraphNodeId,
	marklessGraphWidgetRegistry,
	marklessInstancePath,
	marklessInstanceScopedElementHandle,
	marklessInstanceScopedGraph,
	marklessMarkComposedSymbol,
	marklessNoteWidgetRoot,
	marklessWidgetScope,
} from './instance-scope.ts';
import type { MarklessWidgetRegistry } from './instance-scope.ts';
import type { ResumeSymbol, ResumeSymbolContext } from '../resume-types.ts';

// Composition works on the DRAFT payload the compiled render modules build:
// mutable, partially populated, and carrying producer fields composition itself
// never reads. Each type below names only the fields composition touches and
// lets the rest ride through.
export type ComposeGraphRead = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly [key: string]: unknown;
};
export type ComposeGraphProp = {
	readonly name: string;
	readonly kind?: string;
	readonly graphNodeId?: string;
	readonly path?: ReadonlyArray<string>;
	readonly [key: string]: unknown;
};
export type ComposeGraphProps = ReadonlyArray<ComposeGraphProp> | null | undefined;
export type ComposeDomUpdate = ComposeGraphRead & {
	readonly hostNodeId: string;
	readonly symbolId?: string;
	readonly target?: { readonly kind?: string; readonly name?: string };
};
export type ComposeKeyedRepeat = {
	readonly id: string;
	readonly collectionGraphNodeId?: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly [key: string]: unknown;
};
export type ComposeStateNode = {
	readonly graphNodeId: string;
	readonly directValue?: unknown;
	readonly [key: string]: unknown;
};
export type ComposeStateComputed = ComposeStateNode & {
	readonly deriveSymbolId?: string;
	readonly dependencies?: ReadonlyArray<ComposeGraphRead>;
};
// "This shared node follows these prop reads": the child module's own seed, so a
// write on the composing instance re-runs it.
export type ComposeSharedSeed = {
	readonly graphNodeId: string;
	readonly deriveSymbolId: string;
	readonly dependencies: ReadonlyArray<
		ComposeGraphRead & { readonly reads: ComposeGraphRead }
	>;
};
export type ComposeSharedDefinition = {
	readonly id: string;
	readonly scope?: string;
	readonly graphNodeIds?: ReadonlyArray<string>;
	readonly projectionIds?: ReadonlyArray<string>;
	readonly returnProperties?: ReadonlyArray<{
		readonly kind: string;
		readonly graphNodeId?: string;
		readonly [key: string]: unknown;
	}>;
	readonly [key: string]: unknown;
};
export type ComposeStateDraft = {
	cells?: ReadonlyArray<ComposeStateNode>;
	computed?: ReadonlyArray<ComposeStateComputed>;
	sharedSeeds?: ReadonlyArray<ComposeSharedSeed>;
	sharedDefinitions?: ReadonlyArray<ComposeSharedDefinition>;
	readonly [key: string]: unknown;
};
export type ComposeLoadSymbol = (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>;
export type ComposeChildOutput = {
	state?: ComposeStateDraft;
	loadSymbol?: ComposeLoadSymbol;
	// `m` remaps the child's own graph output against the parent's prop routes
	// and qualifies its remaining graph node ids with the instance path.
	readonly m?: (graphProps: ComposeGraphProps, instancePath?: string) => void;
	readonly [key: string]: unknown;
};
export type ComposeChild = {
	readonly hostPrefix: string;
	readonly symbolPrefix?: string;
	readonly boundSymbols?: Readonly<Record<string, string>>;
	readonly graphProps?: ComposeGraphProps;
	readonly output?: ComposeChildOutput;
	/** Build-time: the child-relative path of the composed widget root its children land in. */
	readonly childrenWidgetRoot?: string;
	readonly [key: string]: unknown;
};

// One instance path qualifies a composed child's symbol ids AND its graph node
// ids. Keeping them the same string is what lets browser resume recover the
// instance a symbol belongs to from the symbol id it was loaded with; a child
// whose symbols do not carry the path cannot be graph-qualified either.
export function marklessComposedInstancePath(child: {
	readonly symbolPrefix?: string;
}): string {
	return marklessInstancePath(child.symbolPrefix);
}

export { marklessComposedGraphNodeId };

// Per-render widget registries, filed against the objects one render's compose
// tree already threads along: the children array a level composes, and the
// composed state that level returns, which the level above finds on its child.
// They live here rather than beside the lookups they feed because only a server
// composes twice at once — the browser's own chunk carries the lookups.
const renderRegistries = new WeakMap<object, MarklessWidgetRegistry>();

function heldRegistry(carrier: unknown): MarklessWidgetRegistry | undefined {
	return carrier && typeof carrier === 'object'
		? renderRegistries.get(carrier as object)
		: undefined;
}

/**
 * The registry one compose level works against: the union of what its children
 * carry, minted once per children array so the level's view compose and its
 * state compose reach the same answer.
 */
export function marklessComposeWidgetRegistry(
	children: ReadonlyArray<{ readonly output?: { readonly state?: unknown } }>,
): MarklessWidgetRegistry {
	const held = renderRegistries.get(children);
	if (held) return held;
	const registry: MarklessWidgetRegistry = { rootPaths: new Map(), rowRooted: new Set() };
	for (const child of children) {
		const from = heldRegistry(child.output?.state);
		if (!from) continue;
		for (const [id, rootPath] of from.rootPaths) registry.rootPaths.set(id, rootPath);
		for (const definitionId of from.rowRooted) registry.rowRooted.add(definitionId);
	}
	renderRegistries.set(children, registry);
	return registry;
}

/**
 * The registry a composed state carries, for a reader that holds the draft but
 * not the graph it will become. Composition's own answer, before serving.
 */
export function marklessComposedWidgetRegistry(from: unknown): MarklessWidgetRegistry | undefined {
	return heldRegistry(from);
}

/** Hands the registry a composed state carries to whatever record replaces it. */
export function marklessCarryWidgetRegistry<T extends object>(from: unknown, to: T): T {
	const held = heldRegistry(from);
	if (held) renderRegistries.set(to, held);
	return to;
}

/** Files this level's registry on the state it returns, for the level above. */
function marklessAttachWidgetRegistry<T extends object>(
	state: T,
	registry: MarklessWidgetRegistry,
): T {
	renderRegistries.set(state, registry);
	return state;
}

/**
 * Runs one compose against one render's registry.
 *
 * Composition is synchronous from the first registration to the last lookup, so
 * no other render can reach the scope between the two assignments; the await
 * points a second `renderToString` interleaves at are all OUTSIDE this call.
 */
export function marklessWithWidgetRegistry<T>(
	registry: MarklessWidgetRegistry,
	compose: () => T,
): T {
	const previous = marklessWidgetScope.active;
	const composing = marklessWidgetScope.composing;
	marklessWidgetScope.active = registry;
	// A dispatch reaching a graph mid-compose must not re-aim the field this
	// compose is reading through; nested composes restore the flag they found.
	marklessWidgetScope.composing = true;
	try {
		return compose();
	} finally {
		marklessWidgetScope.active = previous;
		marklessWidgetScope.composing = composing;
	}
}

// The render's own registry is what every lookup inside this compose reads, so
// the renders beside it cannot answer for it. Nothing is written through to a
// realm-wide map: the readers that ask AFTER a compose - resume, a dispatched
// bound symbol, a callback slot - ask the registry filed against the page graph
// this render produced, and fill it from the widget definitions it serves.
function marklessRegisterWidgetRoot(id: string, rootPath: string): void {
	marklessNoteWidgetRoot(marklessWidgetScope.active, id, rootPath);
}

function marklessRegisterWidgetInstanceIds(ids: Iterable<string>): void {
	for (const id of ids) marklessRegisterWidgetRoot(id, marklessInstancePath(id));
}

// A part is a SIBLING of the root composition placed it in (`c0:p1:` beside
// `c0:c0:`), so the root walk cannot reach that root from the part's own path;
// the composing child declared where its children land and this is that answer.
function marklessRegisterWidgetProjections(
	entries: Iterable<readonly [string, string]>,
): void {
	for (const [id, rootPath] of entries) marklessRegisterWidgetRoot(id, rootPath);
}

// Rewrites a child state draft from child-local ids into page-space ids: prop
// reads with a live parent route become that route, everything else takes the
// instance path.
export function marklessQualifyChildState(
	state: ComposeStateDraft,
	graphProps: ComposeGraphProps,
	instancePath: string,
) {
	state.cells = (state.cells ?? []).map((cell) => ({
		...cell,
		graphNodeId: marklessComposedGraphNodeId(cell.graphNodeId, instancePath),
	}));
	state.computed = (state.computed ?? []).map((computed) => ({
		...computed,
		graphNodeId: marklessComposedGraphNodeId(computed.graphNodeId, instancePath),
		...(computed.dependencies && {
			dependencies: computed.dependencies.map(
				(dependency) =>
					marklessCsrRemapChildGraph(dependency, graphProps, instancePath) ?? dependency,
			),
		}),
	}));
	if (state.sharedSeeds)
		state.sharedSeeds = state.sharedSeeds.flatMap((seed) => {
			// A prop with no live route was never passed live, so the child already
			// rendered its final value and this seed has nothing to follow.
			const dependencies = seed.dependencies.flatMap((dependency) => {
				const mapped = marklessCsrRemapChildGraph(dependency, graphProps, instancePath);
				// The route moved onto the parent's node; the read the seed's own
				// symbol makes only takes this instance path.
				const reads = {
					...dependency.reads,
					graphNodeId: marklessComposedGraphNodeId(
						dependency.reads.graphNodeId,
						instancePath,
					),
				};
				return mapped ? [{ ...mapped, reads }] : [];
			});
			return dependencies.length
				? [
						{
							...seed,
							graphNodeId: marklessComposedGraphNodeId(seed.graphNodeId, instancePath),
							dependencies,
						},
					]
				: [];
		});
}

// A `widget`-scoped definition is one graph per rendered widget. EVERY composed
// instance that owns the definition's cells is a widget root — the compiler
// gives those cells to the component that roots the family, so a
// root/trigger/content family contributes one owner per rendered widget, and a
// root nested in another root's projection contributes its own. Every other
// piece of the widget finds its root by INNERMOST instance-path prefix, which is
// what makes a nested root's parts read the nested root.
export function marklessRegisterComposedWidgets(children: ReadonlyArray<ComposeChild>): void {
	const roots: string[] = [];
	const projections: Array<readonly [string, string]> = [];
	for (const child of children) {
		const instancePath = marklessComposedInstancePath(child);
		if (!instancePath) continue;
		for (const definition of child.output?.state?.sharedDefinitions ?? []) {
			if (definition.scope !== 'widget') continue;
			if (
				!(child.output?.state?.cells ?? []).some((cell) =>
					cell.graphNodeId.startsWith(definition.id + '/'),
				)
			)
				continue;
			roots.push(instancePath + definition.id);
			// The same widget, registered again under the projection site a part sits at.
			const rootPath = instancePath + marklessInstancePath(definition.id);
			for (const projectionId of marklessProjectionIds(definition, child.childrenWidgetRoot))
				projections.push([instancePath + projectionId, rootPath]);
		}
	}
	marklessRegisterWidgetInstanceIds(roots);
	marklessRegisterWidgetProjections(projections);
}

// The child-local ids a projected part spells this definition under: what deeper
// composes recorded, plus this compose's own when the child declared the chain.
function marklessProjectionIds(
	definition: ComposeSharedDefinition,
	childrenWidgetRoot: string | undefined,
): string[] {
	return [
		...(definition.projectionIds ?? []),
		...(childrenWidgetRoot && definition.id.startsWith(childrenWidgetRoot)
			? [definition.id.slice(childrenWidgetRoot.length)]
			: []),
	];
}

function marklessComposedSharedDefinition(
	definition: ComposeSharedDefinition,
	instancePath: string,
	childrenWidgetRoot: string | undefined,
): ComposeSharedDefinition {
	if (definition.scope !== 'widget' || !instancePath) return definition;
	const projectionIds = marklessProjectionIds(definition, childrenWidgetRoot).map(
		(projectionId) => instancePath + projectionId,
	);
	return {
		...definition,
		id: marklessComposedGraphNodeId(definition.id, instancePath),
		// Resume registers these; a part loaded by its path alone has no other road.
		...(projectionIds.length ? { projectionIds } : {}),
		...(definition.graphNodeIds
			? {
					graphNodeIds: definition.graphNodeIds.map((graphNodeId) =>
						marklessComposedGraphNodeId(graphNodeId, instancePath),
					),
				}
			: {}),
		...(definition.returnProperties
			? {
					returnProperties: definition.returnProperties.map((property) =>
						typeof property.graphNodeId === 'string'
							? {
									...property,
									graphNodeId: marklessComposedGraphNodeId(
										property.graphNodeId,
										instancePath,
									),
								}
							: property,
					),
				}
			: {}),
	};
}

// A projected part and the child that ROOTS the widget derive the same composed
// definition id, and only the rooting child carries the projection sites resume
// needs. Keeping whichever record came first therefore drops the projection
// bridge whenever a part is placed first, so records that collapse are merged:
// the sites union, and the rooting record supplies every other field.
function marklessMergedSharedDefinitions(
	definitions: ReadonlyArray<ComposeSharedDefinition>,
): ComposeSharedDefinition[] {
	const byId = new Map<string, ComposeSharedDefinition>();
	const sitesById = new Map<string, Set<string>>();
	for (const definition of definitions) {
		const held = byId.get(definition.id);
		// Records that all root describe the same composed widget, so they agree
		// on everything the projection sites are not.
		if (!held || (!held.projectionIds?.length && definition.projectionIds?.length))
			byId.set(definition.id, definition);
		const sites = sitesById.get(definition.id) ?? new Set<string>();
		for (const projectionId of definition.projectionIds ?? []) sites.add(projectionId);
		sitesById.set(definition.id, sites);
	}
	return [...byId].map(([id, definition]) => {
		const sites = sitesById.get(id);
		// Sorted so the served definition never depends on child order; every
		// reader registers these against a widget root rather than walking them.
		return sites?.size ? { ...definition, projectionIds: [...sites].sort() } : definition;
	});
}

/**
 * Composes one level against ONE render's widget registry.
 *
 * The registry is this level's children's, unioned - so the roots the levels
 * below registered are all here, and the roots a render running beside this one
 * registered are not. The composed state carries it out, which is how the level
 * above finds it on its own child.
 */
export function marklessComposeState<T extends ComposeStateDraft>(
	state: T,
	children: ReadonlyArray<ComposeChild>,
) {
	const childStates = children
		.map((child) => child.output?.state)
		.filter((childState): childState is ComposeStateDraft => Boolean(childState));
	if (!childStates.length) return state;
	const registry = marklessComposeWidgetRegistry(children);
	return marklessWithWidgetRegistry(registry, () =>
		marklessAttachWidgetRegistry(marklessComposedState(state, children, childStates), registry),
	);
}

function marklessComposedState<T extends ComposeStateDraft>(
	state: T,
	children: ReadonlyArray<ComposeChild>,
	childStates: ReadonlyArray<ComposeStateDraft>,
) {
	marklessRegisterComposedWidgets(children);
	for (const child of children) {
		const output = child.output;
		if (!output?.state) continue;
		const instancePath = marklessComposedInstancePath(child);
		if (output.m) output.m(child.graphProps, instancePath);
		else marklessQualifyChildState(output.state, child.graphProps, instancePath);
	}
	const sharedDefinitions = marklessMergedSharedDefinitions([
		...(state.sharedDefinitions ?? []),
		...children.flatMap((child) =>
			(child.output?.state?.sharedDefinitions ?? []).map((definition) =>
				marklessComposedSharedDefinition(
					definition,
					marklessComposedInstancePath(child),
					child.childrenWidgetRoot,
				),
			),
		),
	]);
	const sharedSeeds = [
		...(state.sharedSeeds ?? []),
		...children.flatMap((child) =>
			(child.output?.state?.sharedSeeds ?? []).map((seed) => ({
				...seed,
				deriveSymbolId: marklessBoundSymbolId(child, seed.deriveSymbolId),
			})),
		),
	];
	return {
		...state,
		cells: [
			...(state.cells ?? []),
			...childStates.flatMap((childState) => childState.cells ?? []),
		],
		computed: [
			...(state.computed ?? []),
			...children.flatMap((child) =>
				(child.output?.state?.computed ?? []).map((computed) => ({
					...computed,
					...(computed.deriveSymbolId
						? { deriveSymbolId: marklessBoundSymbolId(child, computed.deriveSymbolId) }
						: {}),
				})),
			),
		],
		...(sharedDefinitions.length ? { sharedDefinitions } : {}),
		...(sharedSeeds.length ? { sharedSeeds } : {}),
	};
}

export function marklessCsrRemapGraphOutput(
	output: ComposeChildOutput & {
		state: ComposeStateDraft & { readonly cells: ReadonlyArray<ComposeStateNode> };
	},
	graphProps: ComposeGraphProps,
	instancePath = '',
) {
	marklessQualifyChildState(output.state, graphProps, instancePath);
	// A composed prop is the source node's committed mount value. Seed that
	// node before the page graph is built so a downstream-first write can read it.
	const props = output.state.cells.find((cell) =>
		cell.graphNodeId.startsWith(instancePath + 'prop:'),
	)?.directValue as Readonly<Record<string, unknown>> | undefined;
	if (props)
		for (const prop of graphProps ?? []) {
			const route = marklessLiveBoundGraphRoute(prop);
			// The draft cell list belongs to this render pass, so seeding writes in place.
			if (route?.path.length === 0 && props[prop.name] !== undefined)
				(output.state.cells as ComposeStateNode[]).push({
					graphNodeId: route.graphNodeId,
					directValue: props[prop.name],
				});
		}
	const loadSymbol = output.loadSymbol;
	if (!loadSymbol || !(graphProps?.length || instancePath)) return;
	output.loadSymbol = (symbolId: string) =>
		Promise.resolve(loadSymbol(symbolId)).then((symbol) =>
			marklessComposedSymbol(symbol, graphProps, instancePath),
		);
}

function marklessComposedSymbol(
	symbol: ResumeSymbol,
	graphProps: ComposeGraphProps,
	instancePath: string,
): ResumeSymbol {
	const composed = (context: ResumeSymbolContext) => {
		const graph = context.graph;
		// A CSR container activates its authored behaviors BEFORE it demand-loads
		// the runtime graph, so a behavior on a composed child's element arrives
		// with no graph at all. Composed symbols are marked precisely so the
		// instance-scope adapter skips them, which is why the guard defect 96
		// landed there does not cover this path. There is nothing to remap, and
		// the behavior still has to run: it gets the absent graph its caller
		// handed over. Only the element handles carry a scope it can honour.
		if (!graph)
			return symbol({
				...context,
				getElementHandle: marklessInstanceScopedElementHandle(
					context.getElementHandle,
					instancePath,
					graph,
				),
			});
		// This dispatch runs long after the compose that placed this child, so the
		// rendered widgets it asks about are the ones its own page graph carries.
		const registry = marklessGraphWidgetRegistry(graph);
		// One route for both read channels: `context.read` is the same child-local
		// id space `graph.read` is, so an unmapped one would read the page graph raw.
		const read = (graphNodeId: string, path: ReadonlyArray<string> = []) => {
			const mapped = marklessCsrRemapChildGraph(
				{ graphNodeId, path },
				graphProps,
				instancePath,
				registry,
			);
			return graph.read(mapped?.graphNodeId ?? graphNodeId, mapped?.path ?? path);
		};
		return symbol({
			...context,
			graph: {
				...marklessInstanceScopedGraph(graph, instancePath),
				read,
			},
			// A widget-scoped element() handle is one element per rendered widget,
			// so it resolves against this instance the way this instance's graph
			// nodes do.
			getElementHandle: marklessInstanceScopedElementHandle(
				context.getElementHandle,
				instancePath,
				context.graph,
			),
			...(context.read ? { read } : {}),
		});
	};
	return marklessMarkComposedSymbol(composed);
}

export function marklessCsrRemapChildGraph(
	record: ComposeGraphRead,
	graphProps: ComposeGraphProps,
	instancePath = '',
	registry?: MarklessWidgetRegistry,
): ComposeGraphRead | null {
	const propName = marklessCompositionPropName(record.graphNodeId, record.path);
	if (propName === null)
		return instancePath
			? {
					...record,
					graphNodeId: marklessComposedGraphNodeId(
						record.graphNodeId,
						instancePath,
						registry,
					),
				}
			: record;
	const binding = marklessCompositionGraphProp(graphProps, propName);
	const liveRoute = marklessLiveBoundGraphRoute(binding);
	return liveRoute
		? {
				graphNodeId: liveRoute.graphNodeId,
				path: [
					...liveRoute.path,
					...record.path.slice(+(record.graphNodeId === 'prop:props')),
				],
			}
		: null;
}

// Sync policy conditions read the graph by id, so a composed child's policy
// travels the same route its other reads do.
export function marklessComposedSyncPolicy<T>(
	policy: T,
	graphProps: ComposeGraphProps,
	instancePath: string,
): T {
	if (!policy || typeof policy !== 'object' || !(instancePath || graphProps?.length))
		return policy;
	const condition = policy as { readonly type?: string; readonly graphNodeId?: unknown };
	if (condition.type === 'graph-truthy' && typeof condition.graphNodeId === 'string') {
		const mapped = marklessCsrRemapChildGraph(
			{
				graphNodeId: condition.graphNodeId,
				path: (condition as { readonly path?: ReadonlyArray<string> }).path ?? [],
			},
			graphProps,
			instancePath,
		);
		return mapped
			? ({ ...condition, graphNodeId: mapped.graphNodeId, path: mapped.path } as T)
			: policy;
	}
	if (Array.isArray(policy))
		return policy.map((item) =>
			marklessComposedSyncPolicy(item, graphProps, instancePath),
		) as unknown as T;
	return Object.fromEntries(
		Object.entries(policy as Record<string, unknown>).map(([key, value]) => [
			key,
			marklessComposedSyncPolicy(value, graphProps, instancePath),
		]),
	) as T;
}

export function marklessCsrChildReadIsStatic(record: ComposeGraphRead, graphProps: ComposeGraphProps) {
	const propName = marklessCompositionPropName(record.graphNodeId, record.path);
	if (propName === null) return false;
	const binding = (graphProps ?? []).find((prop) => prop.name === propName);
	// A name the route table never lists was never passed, so the child read a
	// static undefined and rendered its final answer with it.
	if (!binding) return true;
	return binding.kind !== undefined && binding.kind !== 'graph-reference';
}

function marklessCompositionPropName(
	graphNodeId: string,
	path: ReadonlyArray<string>,
): string | null {
	return graphNodeId === 'prop:props'
		? path[0]
		: graphNodeId.startsWith('prop:')
			? graphNodeId.slice('prop:'.length)
			: null;
}

function marklessCompositionGraphProp(graphProps: ComposeGraphProps, propName: string) {
	const binding = (graphProps ?? []).find((prop) => prop.name === propName);
	return binding?.kind === undefined || binding.kind === 'graph-reference' ? binding : null;
}

export function marklessCsrRemapChildKeyedRepeat(
	repeat: ComposeKeyedRepeat,
	graphProps: ComposeGraphProps,
	hostPrefix = '',
	instancePath = '',
): ComposeGraphRead | null {
	const graphNodeId = repeat.collectionGraphNodeId;
	if (!graphNodeId) return null;
	const propName = marklessCompositionPropName(graphNodeId, repeat.collectionPath);
	if (propName === null)
		return {
			graphNodeId: marklessComposedGraphNodeId(graphNodeId, instancePath),
			path: repeat.collectionPath,
		};
	const binding = marklessCompositionGraphProp(graphProps, propName);
	if (binding === null) return null;
	const mapped = marklessCsrRemapChildGraph(
		{ graphNodeId, path: repeat.collectionPath },
		graphProps,
		instancePath,
	);
	if (mapped) return mapped;
	throw new Error('MARKLESS_COMPOSED_READ_UNMAPPED: ' + hostPrefix + repeat.id);
}

export function marklessCsrRemapChildDomUpdate(
	update: ComposeDomUpdate,
	graphProps: ComposeGraphProps,
	hostPrefix = '',
	instancePath = '',
): ComposeGraphRead | null {
	const propName = marklessCompositionPropName(update.graphNodeId, update.path);
	if (propName === null)
		return instancePath
			? {
					...update,
					graphNodeId: marklessComposedGraphNodeId(update.graphNodeId, instancePath),
				}
			: update;
	const binding = marklessCompositionGraphProp(graphProps, propName);
	if (binding === null) return null;
	// The route table lists every prop written at the invocation site, so a name
	// missing from it was never passed (or came through a static spread): the
	// child already rendered its final value and there is nothing live to wire.
	// Projected children reach the same conclusion by a different road.
	if (!binding) return null;
	const mapped = marklessCsrRemapChildGraph(update, graphProps);
	if (mapped) return mapped;

	const targetName = update.target?.name ? `:${update.target.name}` : '';
	const recordId = `dom-update:${update.hostNodeId}:${update.target?.kind ?? 'unknown'}${targetName}`;
	const hostNodeId = hostPrefix + update.hostNodeId;
	const symbolId = update.symbolId ?? '<missing>';
	throw Object.assign(
		new Error(
			`MARKLESS_COMPOSED_DOM_UPDATE_UNMAPPED: DOM update "${recordId}" on host "${hostNodeId}" with symbol "${symbolId}" reads prop "${propName}", but composition found no route.`,
		),
		{ code: 'MARKLESS_COMPOSED_DOM_UPDATE_UNMAPPED', recordId, hostNodeId, symbolId, propName },
	);
}
