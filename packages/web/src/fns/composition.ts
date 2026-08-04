import { marklessBoundSymbolId, marklessLiveBoundGraphRoute } from './bound-symbol.ts';

export function marklessComposeState(state, children) {
	const childStates = children.map((child) => child.output?.state).filter(Boolean);
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

export function marklessCsrRemapGraphOutput(output, graphProps) {
	// A composed prop is the source node's committed mount value. Seed that
	// node before the page graph is built so a downstream-first write can read it.
	const props = output.state.cells.find((cell) =>
		cell.graphNodeId.startsWith('prop:'),
	)?.directValue;
	if (props)
		for (const prop of graphProps ?? [])
			if (
				marklessLiveBoundGraphRoute(prop)?.path.length === 0 &&
				props[prop.name] !== undefined
			)
				output.state.cells.push({
					graphNodeId: prop.graphNodeId,
					directValue: props[prop.name],
				});
	output.state.computed = output.state.computed.map((computed) => ({
		...computed,
		...(computed.dependencies && {
			dependencies: computed.dependencies.map(
				(dependency) => marklessCsrRemapChildGraph(dependency, graphProps) ?? dependency,
			),
		}),
	}));
	const loadSymbol = output.loadSymbol;
	if (!loadSymbol || !graphProps?.length) return;
	output.loadSymbol = (symbolId) =>
		Promise.resolve(loadSymbol(symbolId)).then(
			(symbol) => (context) =>
				symbol({
					...context,
					graph: {
						...context.graph,
						read(graphNodeId, path = []) {
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
export function marklessAssertComposableStateNames(state, childStates) {
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

export function marklessCsrRemapChildGraph(record, graphProps) {
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

export function marklessCsrChildReadIsStatic(record, graphProps) {
	const propName = marklessCompositionPropName(record.graphNodeId, record.path);
	if (propName === null) return false;
	const binding = (graphProps ?? []).find((prop) => prop.name === propName);
	return !!binding && binding.kind !== undefined && binding.kind !== 'graph-reference';
}

function marklessCompositionPropName(graphNodeId, path) {
	return graphNodeId === 'prop:props'
		? path[0]
		: graphNodeId.startsWith('prop:')
			? graphNodeId.slice(5)
			: null;
}

function marklessCompositionGraphProp(graphProps, propName) {
	const binding = (graphProps ?? []).find((prop) => prop.name === propName);
	return binding?.kind === undefined || binding.kind === 'graph-reference' ? binding : null;
}

export function marklessCsrRemapChildKeyedRepeat(repeat, graphProps, hostPrefix = '') {
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

export function marklessCsrRemapChildDomUpdate(update, graphProps, hostPrefix = '') {
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
