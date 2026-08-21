import type { PublicRenderModuleInput } from '../../artifacts.ts';

type SharedSeedSymbol = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly componentName?: string;
	readonly source: string;
};

/**
 * The component edges placed inside one projecting child, outermost first: its
 * projection chunk's own child components, then the ones projected into those.
 * These are the parts of the widget that child roots, and they seed the same
 * shared instance it does, so its seed pass must run theirs before any of them
 * renders. Chunks reached through a repeat, branch, or async arm are not walked:
 * which of those renders is a render-time answer, not a build-time one.
 */
export function projectedEdgeIdsUnder(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	projectionChunkId: string,
): string[] {
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edgeIds: string[] = [];
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind !== 'child-component') continue;
			edgeIds.push(slot.componentEdgeId);
			if (slot.projectionChunkId) walk(slot.projectionChunkId);
		}
	};
	walk(projectionChunkId);
	return edgeIds;
}

/** The shared-instance seeds one component's body writes from its own props. */
export function componentSharedSeeds(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<SharedSeedSymbol> {
	return input.symbolResolver.symbols.flatMap((symbol) =>
		symbol.kind === 'shared-seed' && symbol.componentName === componentName
			? [
					{
						graphNodeId: symbol.graphNodeId,
						path: symbol.path ?? [],
						componentName: symbol.componentName,
						source: symbol.source,
					},
				]
			: [],
	);
}

/**
 * The seed pass a projecting component answers before the components projected
 * into it render: it fills the caller's map from its own props and returns
 * without rendering, so a projected part reads the seeded value.
 */
export function sharedSeedPassLines(
	seeds: ReadonlyArray<SharedSeedSymbol>,
	staticValuesName: string,
): string[] {
	if (seeds.length === 0) return [];
	const nodeIds = [...new Set(seeds.map((seed) => seed.graphNodeId))];
	return [
		'	if (marklessSsrRenderContext?.marklessSharedSeeds) {',
		'		const marklessSsrSeeds = marklessSsrRenderContext.marklessSharedSeeds;',
		...nodeIds.map((graphNodeId) => {
			const id = JSON.stringify(graphNodeId);
			return `		if (!marklessSsrSeeds.has(${id})) marklessSsrSeeds.set(${id}, ${staticValuesName}.get(${id}));`;
		}),
		// An assignment always assigns, so an omitted prop with no destructuring
		// default seeds undefined the way plain JavaScript would.
		...seeds.map((seed) => {
			const id = JSON.stringify(seed.graphNodeId);
			return `		{ const marklessSharedSeed = (${seed.source}); marklessSsrSeeds.set(${id}, ${sharedSeedValueSource(
				`marklessSsrSeeds.get(${id})`,
				seed.path,
				'marklessSharedSeed',
			)}); }`;
		}),
		'		return;',
		'	}',
	];
}

/**
 * How a composing module learns that an imported component seeds: the seed pass
 * is the one call a parent makes before rendering the projected children, and a
 * component without seeds must never be rendered twice to find that out.
 */
export function sharedSeedMarkerLine(
	seeds: ReadonlyArray<SharedSeedSymbol>,
	functionName: string,
): string | null {
	return seeds.length > 0 ? `${functionName}.marklessSeedsShared = true;` : null;
}

/** A component that reads a widget-scoped shared instance renders from the seeds its widget root wrote. */
export function sharedSeedConsumeLine(
	input: PublicRenderModuleInput,
	componentName: string,
	valuesName: string,
): string | null {
	const widgetScoped = new Set(
		input.semanticGraph.sharedDefinitions.flatMap((definition) =>
			definition.scope === 'widget' ? [definition.id] : [],
		),
	);
	const readsWidgetInstance = (input.semanticGraph.sharedInstances ?? []).some(
		(instance) =>
			instance.componentName === componentName && widgetScoped.has(instance.definitionId),
	);
	return readsWidgetInstance
		? `	for (const [marklessSeedId, marklessSeedValue] of marklessSsrRenderContext?.sharedSeeds ?? []) ${valuesName}.set(marklessSeedId, marklessSeedValue);`
		: null;
}

// The seed replaces the node's whole value, so a property assignment returns the
// current value with that property merged in.
function sharedSeedValueSource(
	readSource: string,
	path: ReadonlyArray<string>,
	valueSource: string,
): string {
	const [head, ...rest] = path;
	if (head === undefined) return valueSource;
	const nested = sharedSeedValueSource(`${readSource}?.[${JSON.stringify(head)}]`, rest, valueSource);
	return `{ ...${readSource}, [${JSON.stringify(head)}]: ${nested} }`;
}
