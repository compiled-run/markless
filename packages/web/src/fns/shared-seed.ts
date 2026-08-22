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
	const base = context.idPrefix + (context.rowSegment ?? '') + rootEdge.symbolPrefix;
	const seeded = new Map(inherited ?? []).set(
		MARKLESS_WIDGET_INSTANCE_KEY,
		base + childrenWidgetRootPath(context.surface, rootEdge.childComponentName),
	);
	// U-H: every part of this widget instance contributes before any part
	// renders, so a seed a part writes is what its siblings read whatever the
	// document order.
	for (const edge of [
		rootEdge,
		...projectedEdges(context.surface, definition, componentEdgeId, read),
	])
		await applySharedSeeds(context, edge, read, seeded);
	return seeded;
};

/**
 * The widget-scoped families a placed child ROOTS: the definitions whose cells
 * its own payload owns, so every rendered instance of it starts a widget
 * instance of its own. A part reads the innermost root that encloses it, which
 * is why a root nested in another root's projection ends the outer seed phase.
 */
function widgetRootsOf(surface: PrerenderDataSurface, componentName: string): string[] {
	const child = (surface.components[componentName] ? surface : surface.imports[componentName])
		?.components[componentName];
	const state = child?.state;
	if (!state) return [];
	// A module serving several components publishes one payload for all of them
	// and names each component's own nodes by position, so ownership is the
	// selection, never the whole payload.
	const owned = new Set(ownedCellIds(child));
	return (state.sharedDefinitions ?? []).flatMap((definition) =>
		definition.scope === 'widget' &&
		[...owned].some((graphNodeId) => graphNodeId.startsWith(definition.id + '/'))
			? [definition.id]
			: [],
	);
}

// Where a component's own `children` land inside ITS composition: the instance
// path of the innermost composed child that both encloses the projection and
// roots a widget. Composition placed those children there, so the parts written
// into them belong to that root, not to the component the consumer wrote.
function childrenWidgetRootPath(surface: PrerenderDataSurface, componentName: string): string {
	const own = surface.components[componentName] ? surface : surface.imports[componentName];
	const definition = own?.components[componentName];
	if (!own || !definition) return '';
	const chunks = own.renderData.chunks.filter((chunk) => chunk.componentName === componentName);
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edges = definition.edges ?? [];
	let path = '';
	let found = '';
	const walk = (chunkId: string): boolean => {
		const chunk = byId.get(chunkId);
		if (!chunk) return false;
		for (const slot of chunk.slots) {
			if (slot.kind === 'text' && isOwnChildrenResidue(slot.residue)) return true;
			if (slot.kind !== 'child-component' || !slot.projectionChunkId) continue;
			const edge = edges.find((candidate) => candidate.id === slot.componentEdgeId);
			if (!edge) continue;
			const before = path;
			path += edge.symbolPrefix;
			if (walk(slot.projectionChunkId)) {
				if (widgetRootsOf(own, edge.childComponentName).length > 0) found = path;
				return true;
			}
			path = before;
		}
		return false;
	};
	for (const chunk of chunks) if (chunk.kind === 'template' && walk(chunk.id)) break;
	return found;
}

// The one slot that renders the component's own `children` prop, raw.
function isOwnChildrenResidue(residue: { readonly kind: string; readonly [key: string]: unknown }) {
	return (
		residue.kind === 'graph-read' &&
		residue.graphNodeId === 'prop:props' &&
		Array.isArray(residue.path) &&
		residue.path.length === 1 &&
		residue.path[0] === 'children'
	);
}

function ownedCellIds(definition: PrerenderDataDefinition): string[] {
	const cells = definition.state.cells ?? [];
	const indexes = definition.stateCellIndexes;
	const owned = definition.stateGraphNodeIds;
	if (indexes) return indexes.flatMap((index) => (cells[index] ? [cells[index]!.graphNodeId] : []));
	return cells.flatMap((cell) =>
		!owned || owned.length === 0 || owned.includes(cell.graphNodeId) ? [cell.graphNodeId] : [],
	);
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
		} else if (prop.source !== undefined && context.readEdgeProp) {
			childProps[prop.name] = context.readEdgeProp(prop);
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
		// The caller hands in a row-free symbolPrefix: the row rides the seed's
		// identity, never its symbol id, which routes match as a compile-time literal.
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
