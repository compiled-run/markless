import type { PrerenderDataDefinition, PrerenderDataSurface } from '../prerender/evaluator.ts';
import { childSurfaceOf } from '../prerender/children-projection.ts';

/**
 * The seed-map key prefix under which a widget's seed phase files one entry per
 * element() handle some part of this instance binds, restating
 * MARKLESS_ELEMENT_BOUND_KEY_PREFIX in @markless/compiler so the browser never
 * imports the compiler. A handle with no entry has no element in this widget, so
 * an IDREF naming it writes no attribute at all rather than an id naming nothing.
 */
export const MARKLESS_ELEMENT_BOUND_KEY_PREFIX = 'markless:element-bound|';

/**
 * Every shared() element() handle a rendered instance of a placed child binds:
 * what its own module published, plus what the children it places bind, since
 * rendering it renders them. The CSR twin of the compiled
 * `marklessElementHandles` marker, which splices imported children the same way.
 */
export function boundElementHandlesOf(
	surface: PrerenderDataSurface,
	componentName: string,
	seen: Set<string> = new Set(),
): string[] {
	if (seen.has(componentName)) return [];
	seen.add(componentName);
	const own = childSurfaceOf(surface, componentName);
	const definition = own?.components[componentName];
	if (!own || !definition) return [];
	return [
		...new Set([
			...(definition.boundElementHandles ?? []),
			...(definition.edges ?? []).flatMap((edge) =>
				boundElementHandlesOf(own, edge.childComponentName, seen),
			),
		]),
	];
}

/**
 * Every component edge a widget root's projection can reach, by any route: its
 * own child slots and the ones a branch arm, repeat row, or async arm holds.
 *
 * Deliberately wider than the seed walk. This one only reads which element()
 * handles a part could bind: hearing about a part that turns out not to render
 * leaves the IDREF present, exactly as it is today, while hearing about none
 * would drop a real relationship. The compiler's
 * `projectedHandleEdgeIdsUnder` walks the same shape for the server render.
 */
export function projectionHandleChildNames(
	surface: PrerenderDataSurface,
	definition: PrerenderDataDefinition,
	projectionChunkId: string,
): string[] {
	const chunks = surface.renderData.chunks.filter(
		(chunk) => chunk.componentName === definition.name,
	);
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edges = definition.edges ?? [];
	const names = new Set<string>();
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'branch') {
				for (const armChunkId of slot.armTemplateIds) walk(armChunkId);
				continue;
			}
			if (slot.kind === 'repeat') {
				walk(slot.rowTemplateId);
				if (slot.emptyTemplateId) walk(slot.emptyTemplateId);
				continue;
			}
			if (slot.kind === 'async') {
				for (const armChunkId of Object.values(slot.armTemplateIds))
					if (typeof armChunkId === 'string') walk(armChunkId);
				continue;
			}
			if (slot.kind !== 'child-component') continue;
			const edge = edges.find((candidate) => candidate.id === slot.componentEdgeId);
			if (edge) names.add(edge.childComponentName);
			if (slot.projectionChunkId) walk(slot.projectionChunkId);
		}
	};
	walk(projectionChunkId);
	return [...names];
}

/**
 * The widget instance's element()-handle roster, filed onto the seed map the
 * parts read. It runs where the seed phase runs - before any part renders - so
 * an IDREF written on the FIRST part can still be told whether the element it
 * names will exist. The server render files the same entries from the compiled
 * seed pass.
 */
export function fileBoundElementHandles(
	seeded: ReadonlyMap<string, unknown> | undefined,
	inherited: ReadonlyMap<string, unknown> | undefined,
	surface: PrerenderDataSurface,
	definition: PrerenderDataDefinition,
	slot: { readonly componentEdgeId: string; readonly projectionChunkId?: string },
): ReadonlyMap<string, unknown> | undefined {
	if (!slot.projectionChunkId) return seeded;
	const rootEdge = (definition.edges ?? []).find(
		(candidate) => candidate.id === slot.componentEdgeId,
	);
	const handles = [
		...new Set(
			[
				...(rootEdge ? [rootEdge.childComponentName] : []),
				...projectionHandleChildNames(surface, definition, slot.projectionChunkId),
			].flatMap((componentName) => boundElementHandlesOf(surface, componentName)),
		),
	];
	if (handles.length === 0) return seeded;
	const filed = new Map(seeded ?? inherited ?? []);
	for (const handle of handles) filed.set(MARKLESS_ELEMENT_BOUND_KEY_PREFIX + handle, true);
	return filed;
}
