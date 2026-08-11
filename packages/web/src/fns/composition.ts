import { marklessBoundSymbolId, marklessLiveBoundGraphRoute } from './bound-symbol.ts';
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
	// `m` remaps the child's own graph output against the parent's prop routes.
	readonly m?: (graphProps: ComposeGraphProps) => void;
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

export function marklessComposeState<T extends ComposeStateDraft>(
	state: T,
	children: ReadonlyArray<ComposeChild>,
) {
	const childStates = children
		.map((child) => child.output?.state)
		.filter((childState): childState is ComposeStateDraft => Boolean(childState));
	if (!childStates.length) return state;
	marklessAssertComposableStateNames(state, childStates);
	for (const child of children) child.output?.m?.(child.graphProps);
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
) {
	// A composed prop is the source node's committed mount value. Seed that
	// node before the page graph is built so a downstream-first write can read it.
	const props = output.state.cells.find((cell) => cell.graphNodeId.startsWith('prop:'))
		?.directValue as Readonly<Record<string, unknown>> | undefined;
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
	output.state.computed = (output.state.computed ?? []).map((computed) => ({
		...computed,
		...(computed.dependencies && {
			dependencies: computed.dependencies.map(
				(dependency) => marklessCsrRemapChildGraph(dependency, graphProps) ?? dependency,
			),
		}),
	}));
	const loadSymbol = output.loadSymbol;
	if (!loadSymbol || !graphProps?.length) return;
	output.loadSymbol = (symbolId: string) =>
		Promise.resolve(loadSymbol(symbolId)).then(
			(symbol) => (context: ResumeSymbolContext) =>
				symbol({
					...context,
					graph: {
						...context.graph,
						read(graphNodeId: string, path: ReadonlyArray<string> = []) {
							const mapped = marklessCsrRemapChildGraph(
								{ graphNodeId, path },
								graphProps,
							);
							return context.graph.read(
								mapped?.graphNodeId ?? graphNodeId,
								mapped?.path ?? path,
							);
						},
					},
				}),
		);
}

// Graph node ids are NAME-based per module and compose merges child state
// into ONE page graph unprefixed: same-named state()/computed() in a page
// and a composed component would silently share one value (and one streaming
// runner). Refuse loudly until graph ids are instance-scoped; shared
// definitions keep their cross-module ids on purpose.
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
						`MARKLESS_COMPOSED_STATE_COLLISION: Two components on this page both declare state() or computed() named "${id.slice(id.indexOf(':') + 1)}". Composed components share one state graph, so they would read and write the same value. Rename one of them.`,
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
): ComposeGraphRead | null {
	const propName = marklessCompositionPropName(record.graphNodeId, record.path);
	if (propName === null) return record;
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
			? graphNodeId.slice(5)
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
): ComposeGraphRead | null {
	const graphNodeId = repeat.collectionGraphNodeId;
	if (!graphNodeId) return null;
	const propName = marklessCompositionPropName(graphNodeId, repeat.collectionPath);
	if (propName === null) return { graphNodeId, path: repeat.collectionPath };
	const binding = marklessCompositionGraphProp(graphProps, propName);
	if (binding === null) return null;
	const mapped = marklessCsrRemapChildGraph(
		{ graphNodeId, path: repeat.collectionPath },
		graphProps,
	);
	if (mapped) return mapped;
	throw new Error('MARKLESS_COMPOSED_READ_UNMAPPED: ' + hostPrefix + repeat.id);
}

export function marklessCsrRemapChildDomUpdate(
	update: ComposeDomUpdate,
	graphProps: ComposeGraphProps,
	hostPrefix = '',
): ComposeGraphRead | null {
	const propName = marklessCompositionPropName(update.graphNodeId, update.path);
	if (propName === null) return update;
	const binding = marklessCompositionGraphProp(graphProps, propName);
	if (binding === null) return null;
	// Projected children are rendered by the parent's chunk slots. A wrapper
	// component's synthetic `children` text record has no live graph route.
	if (!binding && propName === 'children') return null;
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
