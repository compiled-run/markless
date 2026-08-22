import {
	installSharedSeedPass,
	MARKLESS_WIDGET_INSTANCE_KEY,
	type SharedSeedPass,
} from '../prerender/shared-seed-slot.ts';
import type { PrerenderDataDefinition, PrerenderDataSurface } from '../prerender/evaluator.ts';
import {
	childrenProjectionChain,
	childrenWidgetRootPath,
	childSurfaceOf,
	type ChildrenProjectionLink,
	widgetRootsOf,
} from '../prerender/children-projection.ts';
import { marklessSsrSpreadProps } from './ssr.ts';

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
	const base = context.idPrefix + (context.rowSegment ?? '') + rootEdge.symbolPrefix;
	const chain = childrenProjectionChain(context.surface, rootEdge.childComponentName);
	const composedRoot = chain.map((link) => link.edge.symbolPrefix).join('');
	const seeded = new Map(inherited ?? []).set(MARKLESS_WIDGET_INSTANCE_KEY, base + composedRoot);
	await applySharedSeeds(context, context.surface, context.symbolPrefix, rootEdge, read, seeded);
	// The composed roots the child's own composition put this widget's parts
	// inside seed the same instance, so they run before any part does.
	await applyComposedChainSeeds(
		context,
		chain,
		rootEdge,
		context.symbolPrefix + rootEdge.symbolPrefix,
		edgeChildProps(context, rootEdge, read),
		seeded,
	);
	// U-H: every part of this widget instance contributes before any part
	// renders, so a seed a part writes is what its siblings read whatever the
	// document order.
	for (const edge of projectedEdges(context.surface, definition, componentEdgeId, read))
		await applySharedSeeds(context, context.surface, context.symbolPrefix, edge, read, seeded);
	return seeded;
};

/**
 * The composed roots between a placed child's own template and the slot that
 * renders its `children`, innermost last. Each link's seeds belong to the widget
 * instance the parts read, so they run in the LINK OWNER's scope: its props, and
 * the derives its module already emitted. A prop like `checked={group.allChecked}`
 * is a computed read, so the scope evaluates the same staged reads the render
 * would — no seed-time derive of its own.
 */
async function applyComposedChainSeeds(
	context: SeedContext,
	chain: ReadonlyArray<ChildrenProjectionLink>,
	rootEdge: SeedEdge,
	symbolPrefix: string,
	props: Record<string, unknown>,
	seeded: Map<string, unknown>,
): Promise<void> {
	let ownerProps = props;
	let ownerPrefix = symbolPrefix;
	let ownerEdge = rootEdge;
	for (const link of chain) {
		const read = await composedScopeRead(
			context,
			link.definition,
			ownerEdge,
			ownerPrefix,
			ownerProps,
			seeded,
		);
		await applySharedSeeds(context, link.surface, ownerPrefix, link.edge, read, seeded);
		ownerProps = edgeChildProps(context, link.edge, read);
		ownerPrefix += link.edge.symbolPrefix;
		ownerEdge = link.edge;
	}
}

/**
 * One composing component's own scope at seed time: its props answer directly,
 * and every value its module emitted an initial for is evaluated here, in the
 * order the module emitted them, exactly as the render evaluates them. A shared
 * instance the composing body already seeded answers from the seed map, so a
 * derive over it reads the seeded value rather than the factory placeholder.
 */
async function composedScopeRead(
	context: SeedContext,
	definition: PrerenderDataDefinition,
	edge: SeedEdge,
	symbolPrefix: string,
	props: Record<string, unknown>,
	seeded: ReadonlyMap<string, unknown>,
): Promise<PrerenderReadSeed> {
	const values = new Map<string, unknown>();
	const read: PrerenderReadSeed = (graphNodeId, path = []) =>
		readPath(
			graphNodeId === definition.propCellId || graphNodeId === 'prop:props'
				? props
				: graphNodeId.startsWith('prop:')
					? props[graphNodeId.slice(5)]
					: seeded.has(graphNodeId)
						? seeded.get(graphNodeId)
						: values.get(graphNodeId),
			path,
		);
	for (const initial of definition.initialValues ?? []) {
		// A shared seed is this widget's own value, already written by the seed pass.
		if (definition.initialValueKinds?.[initial.graphNodeId] === 'shared-seed') continue;
		if (initial.value.kind === 'constant') {
			values.set(initial.graphNodeId, structuredClone(initial.value.value));
			continue;
		}
		if (initial.value.kind !== 'symbol-function') continue;
		const loaded = await context.loadSymbol(
			edge.boundSymbols?.[initial.value.symbolId] ?? symbolPrefix + initial.value.symbolId,
		);
		// A derive this build did not publish leaves the node unseeded rather than
		// failing the render: the composed root still gets every prop that resolved.
		if (typeof loaded !== 'function') continue;
		values.set(
			initial.graphNodeId,
			loaded.length > 0 ? await loaded({ graph: { read }, read }) : await loaded(),
		);
	}
	return read;
}

// The component edges placed inside the projecting child, outermost first: its
// projection chunk's own child components, then the ones projected into those.
// A branch arm IS walked, but only into the arm this render takes - the arm
// decides whether the part renders, never which widget it belongs to. A repeat
// row or an async arm is not walked: those have their own cardinality and
// lifecycle. A child that ROOTS one of this root's families is where the walk
// stops: it starts its own instance and runs its own seed phase.
function projectedEdges(
	surface: PrerenderDataSurface,
	definition: PrerenderDataDefinition,
	componentEdgeId: string,
	read: PrerenderReadSeed,
): SeedEdge[] {
	const chunks = surface.renderData.chunks.filter(
		(chunk) => chunk.componentName === definition.name,
	);
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edges = definition.edges ?? [];
	const rootEdge = edges.find((candidate) => candidate.id === componentEdgeId);
	const rootProjectionChunkId = chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'child-component' &&
			slot.componentEdgeId === componentEdgeId &&
			slot.projectionChunkId
				? [slot.projectionChunkId]
				: [],
		),
	)[0];
	if (rootProjectionChunkId === undefined || !rootEdge) return [];
	const families = widgetRootsOf(surface, rootEdge.childComponentName);
	const startsOwnInstance = (edgeId: string): boolean => {
		if (families.length === 0) return false;
		const edge = edges.find((candidate) => candidate.id === edgeId);
		return (
			edge !== undefined &&
			widgetRootsOf(surface, edge.childComponentName).some((definitionId) =>
				families.includes(definitionId),
			)
		);
	};
	const edgeIds: string[] = [];
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'branch') {
				const armChunkId = slot.armTemplateIds[takenArm(definition, slot.branchSiteId, read)];
				if (armChunkId) walk(armChunkId);
				continue;
			}
			if (slot.kind !== 'child-component') continue;
			if (startsOwnInstance(slot.componentEdgeId)) continue;
			edgeIds.push(slot.componentEdgeId);
			if (slot.projectionChunkId) walk(slot.projectionChunkId);
		}
	};
	walk(rootProjectionChunkId);
	return edgeIds.flatMap((edgeId) => {
		const edge = edges.find((candidate) => candidate.id === edgeId);
		return edge && !edge.materialized ? [edge] : [];
	});
}

// The same arm the renderer will take, asked before the arm renders. A branch
// with no recorded test read has no arm this pass can name, so nothing under it
// seeds and the render behaves as it did before arms carried seeds.
function takenArm(
	definition: PrerenderDataDefinition,
	branchSiteId: string,
	read: PrerenderReadSeed,
): number {
	const branch = (definition.branches ?? []).find(
		(candidate) => candidate.branchSiteId === branchSiteId,
	);
	const testRead = branch?.testReads?.[0];
	if (!testRead) return -1;
	const value = read(testRead.graphNodeId, testRead.path);
	const armTests = branch?.armTests;
	if (!armTests) return value ? 0 : 1;
	const match = armTests.findIndex((candidate) => candidate !== null && Object.is(candidate, value));
	return match >= 0 ? match : armTests.indexOf(null);
}

// What one component edge hands its child, read in the scope that declared it.
function edgeChildProps(
	context: SeedContext,
	edge: SeedEdge,
	read: PrerenderReadSeed,
): Record<string, unknown> {
	const childProps: Record<string, unknown> = {};
	for (const prop of edge.props) {
		if (prop.kind === 'spread' && prop.graphNodeId) {
			Object.assign(
				childProps,
				marklessSsrSpreadProps(read(prop.graphNodeId, prop.path ?? []), prop.excludeNames),
			);
		} else if (prop.kind === 'graph-reference' && prop.graphNodeId) {
			childProps[prop.name] = read(prop.graphNodeId, prop.path ?? []);
		} else if (prop.kind === 'serializable' && 'value' in prop) {
			childProps[prop.name] = prop.value;
		} else if (prop.source !== undefined && context.readEdgeProp) {
			childProps[prop.name] = context.readEdgeProp(prop);
		}
	}
	return childProps;
}

async function applySharedSeeds(
	context: SeedContext,
	surface: PrerenderDataSurface,
	symbolPrefix: string,
	edge: SeedEdge,
	read: PrerenderReadSeed,
	seeded: Map<string, unknown>,
): Promise<void> {
	const child = childSurfaceOf(surface, edge.childComponentName)?.components[
		edge.childComponentName
	];
	const initials = child?.initialValues ?? [];
	const seeds = initials.filter(
		(initial) => child?.initialValueKinds?.[initial.graphNodeId] === 'shared-seed',
	);
	if (!child || seeds.length === 0) return;

	const childProps = edgeChildProps(context, edge, read);
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
		// The caller hands in a row-free symbolPrefix: the row rides the seed's
		// identity, never its symbol id, which routes match as a compile-time literal.
		const loaded = await context.loadSymbol(
			edge.boundSymbols?.[initial.value.symbolId] ??
				symbolPrefix + edge.symbolPrefix + initial.value.symbolId,
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
	// The composition seam asks the same declared chain this pass descends, so the
	// widget a part resolves to is one answer given to both.
	seedProjectingChild.childrenWidgetRoot = childrenWidgetRootPath;
	installSharedSeedPass(seedProjectingChild);
}
