import {
	installSharedSeedPass,
	MARKLESS_WIDGET_INSTANCE_KEY,
	type SharedSeedPass,
} from '../prerender/shared-seed-slot.ts';
import type { PrerenderDataDefinition, PrerenderDataSurface } from '../prerender/evaluator.ts';

type SeedEdge = NonNullable<PrerenderDataDefinition['edges']>[number];
type SeedContext = Parameters<SharedSeedPass>[0];
type PrerenderReadSeed = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

// A seed is a per-instance initial value built from the child's own props, so
// running it needs those props and the factory initial, not the child's markup.
const seedProjectingChild: SharedSeedPass = async (
	context,
	definition,
	componentEdgeId,
	read,
	inherited,
) => {
	const edges = definition.edges ?? [];
	const rootEdge = edges.find((candidate) => candidate.id === componentEdgeId);
	if (!rootEdge || rootEdge.materialized) return inherited;
	// Static registration before descent: the projecting child's own instance
	// names the widget its parts belong to, so a part's minted element() id can
	// carry which rendered widget it is part of.
	const seeded = new Map(inherited ?? []).set(
		MARKLESS_WIDGET_INSTANCE_KEY,
		context.idPrefix + rootEdge.symbolPrefix,
	);
	// U-H: every part of this widget instance contributes before any part
	// renders, so a seed a part writes is what its siblings read whatever the
	// document order.
	for (const edge of [rootEdge, ...projectedEdges(context.surface, definition, componentEdgeId)])
		await applySharedSeeds(context, edge, read, seeded);
	return seeded;
};

// The component edges placed inside the projecting child, outermost first:
// its projection chunk's own child components, then the ones projected into
// those. A repeat, branch, or async arm is not walked - which of those renders
// is a render-time answer.
function projectedEdges(
	surface: PrerenderDataSurface,
	definition: PrerenderDataDefinition,
	componentEdgeId: string,
): SeedEdge[] {
	const chunks = surface.renderData.chunks.filter(
		(chunk) => chunk.componentName === definition.name,
	);
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const rootProjectionChunkId = chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'child-component' &&
			slot.componentEdgeId === componentEdgeId &&
			slot.projectionChunkId
				? [slot.projectionChunkId]
				: [],
		),
	)[0];
	if (rootProjectionChunkId === undefined) return [];
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
	walk(rootProjectionChunkId);
	const edges = definition.edges ?? [];
	return edgeIds.flatMap((edgeId) => {
		const edge = edges.find((candidate) => candidate.id === edgeId);
		return edge && !edge.materialized ? [edge] : [];
	});
}

async function applySharedSeeds(
	context: SeedContext,
	edge: SeedEdge,
	read: Parameters<SharedSeedPass>[3],
	seeded: Map<string, unknown>,
): Promise<void> {
	const surface = context.surface;
	const child = (
		surface.components[edge.childComponentName] ? surface : surface.imports[edge.childComponentName]
	)?.components[edge.childComponentName];
	const initials = child?.initialValues ?? [];
	const seeds = initials.filter(
		(initial) => child?.initialValueKinds?.[initial.graphNodeId] === 'shared-seed',
	);
	if (!child || seeds.length === 0) return;

	const childProps: Record<string, unknown> = {};
	for (const prop of edge.props) {
		if (prop.kind === 'graph-reference' && prop.graphNodeId) {
			childProps[prop.name] = read(prop.graphNodeId, prop.path ?? []);
		} else if (prop.kind === 'serializable' && 'value' in prop) {
			childProps[prop.name] = prop.value;
		}
	}
	const readSeed: PrerenderReadSeed = (graphNodeId, path = []) =>
		readPath(
			graphNodeId === child.propCellId || graphNodeId === 'prop:props'
				? childProps
				: graphNodeId.startsWith('prop:')
					? childProps[graphNodeId.slice(5)]
					: seeded.get(graphNodeId),
			path,
		);
	for (const initial of seeds) {
		if (initial.value.kind !== 'symbol-function') continue;
		const factory = initials.find(
			(candidate) =>
				candidate.graphNodeId === initial.graphNodeId && candidate.value.kind === 'constant',
		)?.value;
		if (!seeded.has(initial.graphNodeId) && factory?.kind === 'constant')
			seeded.set(initial.graphNodeId, structuredClone(factory.value));
		const loaded = await context.loadSymbol(
			edge.boundSymbols?.[initial.value.symbolId] ??
				context.symbolPrefix + edge.symbolPrefix + initial.value.symbolId,
		);
		if (typeof loaded !== 'function')
			throw new Error(`MARKLESS_PRERENDER_DATA_SYMBOL_MISSING: ${initial.value.symbolId}`);
		seeded.set(initial.graphNodeId, await loaded({ graph: { read: readSeed }, read: readSeed }));
	}
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;
	for (const segment of path) {
		if (current === null || current === undefined) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Teaches this app's CSR render path to run a projecting component's shared
 * seeds before the components projected into it render. The bundler emits a
 * call to it in the render-data module of every .tsrx whose compiler planned a
 * shared-seed symbol, so a build with no widget seeds never loads this module
 * and its render path renders projections unseeded. The call is explicit
 * because `@markless/web` declares `sideEffects: false`.
 */
export function installMarklessSharedSeedPass(): void {
	installSharedSeedPass(seedProjectingChild);
}
