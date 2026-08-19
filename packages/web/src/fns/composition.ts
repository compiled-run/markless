import { marklessBoundSymbolId, marklessLiveBoundGraphRoute } from './bound-symbol.ts';
import { marklessInstanceScopedGraph, marklessMarkComposedSymbol } from './instance-scope.ts';
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
export type ComposeStateDraft = {
	cells?: ReadonlyArray<ComposeStateNode>;
	computed?: ReadonlyArray<ComposeStateComputed>;
	sharedDefinitions?: ReadonlyArray<unknown>;
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
	readonly [key: string]: unknown;
};

// One instance path qualifies a composed child's symbol ids AND its graph node
// ids. Keeping them the same string is what lets browser resume recover the
// instance a symbol belongs to from the symbol id it was loaded with; a child
// whose symbols do not carry the path cannot be graph-qualified either.
export function marklessComposedInstancePath(child: {
	readonly symbolPrefix?: string;
}): string {
	return child.symbolPrefix ?? '';
}

// Mirrors PROTOCOL_PAGE_SPACE_ID_PREFIXES, past any instance path a nested
// compose already applied; composed-page-space.test.ts keeps the two in step so
// the browser never imports the serializer's protocol module.
const PAGE_SPACE_ID = /^(?:c\d+:)*(?:shared|storage):/;

// Every id family a component owns is instance-local; a shared() graph and a
// persisted storage slot are page-space on purpose. The compiler refuses at
// build time to emit an id belonging to neither, so this stays a concatenation.
export function marklessComposedGraphNodeId(graphNodeId: string, instancePath: string): string {
	if (!instancePath || PAGE_SPACE_ID.test(graphNodeId)) return graphNodeId;
	return instancePath + graphNodeId;
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
}

export function marklessComposeState<T extends ComposeStateDraft>(
	state: T,
	children: ReadonlyArray<ComposeChild>,
) {
	const childStates = children
		.map((child) => child.output?.state)
		.filter((childState): childState is ComposeStateDraft => Boolean(childState));
	if (!childStates.length) return state;
	for (const child of children) {
		const output = child.output;
		if (!output?.state) continue;
		const instancePath = marklessComposedInstancePath(child);
		if (output.m) output.m(child.graphProps, instancePath);
		else marklessQualifyChildState(output.state, child.graphProps, instancePath);
	}
	marklessAssertComposableStateNames(state, childStates);
	const sharedDefinitions = [
		...(state.sharedDefinitions ?? []),
		...childStates.flatMap((childState) => childState.sharedDefinitions ?? []),
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
	const composed = (context: ResumeSymbolContext) =>
		symbol({
			...context,
			graph: {
				...marklessInstanceScopedGraph(context.graph, instancePath),
				read(graphNodeId: string, path: ReadonlyArray<string> = []) {
					const mapped = marklessCsrRemapChildGraph(
						{ graphNodeId, path },
						graphProps,
						instancePath,
					);
					return context.graph.read(
						mapped?.graphNodeId ?? graphNodeId,
						mapped?.path ?? path,
					);
				},
			},
		});
	return marklessMarkComposedSymbol(composed);
}

// Composed children whose symbols carry an instance path have already been
// qualified above, so their ids cannot collide. A child declared in the SAME
// module has no instance path (its symbols are indistinguishable at resume),
// so its ids still merge unqualified and a same-named state()/computed() would
// silently share one value. Refuse loudly for that case; shared definitions
// keep their cross-module ids on purpose.
export function marklessAssertComposableStateNames(
	state: ComposeStateDraft,
	childStates: ReadonlyArray<ComposeStateDraft>,
) {
	const seen = new Set(
		[...(state.cells ?? []), ...(state.computed ?? [])].map((node) => node.graphNodeId),
	);
	for (const childState of childStates) {
		for (const node of [...(childState.cells ?? []), ...(childState.computed ?? [])]) {
			const id = node.graphNodeId;
			// Only author-renamable state()/computed() names are diagnosable.
			// Live directValue cells seed mapped prop sources and are not declarations.
			// Shared definitions and props compose by design; compiler-synthesized
			// names carry extra ':' segments and are not author collisions.
			if (
				node.directValue !== undefined ||
				id.startsWith('shared:') ||
				id.startsWith('prop:') ||
				id.slice(id.indexOf(':') + 1).includes(':')
			)
				continue;
			if (seen.has(id)) {
				throw Object.assign(
					new Error(
						`MARKLESS_COMPOSED_STATE_COLLISION: Two components declared in the same module both declare state() or computed() named "${id.slice(id.indexOf(':') + 1)}". Components declared in the same module as the page share one state graph, so they would read and write the same value. Move one into its own module or rename it.`,
					),
					{
						code: 'MARKLESS_COMPOSED_STATE_COLLISION',
						graphNodeId: id,
						docsUrl: 'https://markless.dev/errors/MARKLESS_COMPOSED_STATE_COLLISION',
					},
				);
			}
			seen.add(id);
		}
	}
}

export function marklessCsrRemapChildGraph(
	record: ComposeGraphRead,
	graphProps: ComposeGraphProps,
	instancePath = '',
): ComposeGraphRead | null {
	const propName = marklessCompositionPropName(record.graphNodeId, record.path);
	if (propName === null)
		return instancePath
			? {
					...record,
					graphNodeId: marklessComposedGraphNodeId(record.graphNodeId, instancePath),
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
	return !!binding && binding.kind !== undefined && binding.kind !== 'graph-reference';
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
