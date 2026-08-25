import type { PrerenderDataDefinition, PrerenderDataSurface } from './evaluator.ts';

type ProjectionEdge = NonNullable<PrerenderDataDefinition['edges']>[number];

/**
 * One composed edge on the way from a component's own template down to the slot
 * that renders its `children`, with the surface and definition that DECLARED it
 * — the scope its props are written in.
 */
export type ChildrenProjectionLink = {
	readonly edge: ProjectionEdge;
	readonly surface: PrerenderDataSurface;
	readonly definition: PrerenderDataDefinition;
	readonly rootsWidget: boolean;
};

/**
 * The widget-scoped families a placed child ROOTS: the definitions whose cells
 * its own payload owns, so every rendered instance of it starts a widget
 * instance of its own. A part reads the innermost root that encloses it, which
 * is why a root nested in another root's projection ends the outer seed phase.
 */
export function widgetRootsOf(surface: PrerenderDataSurface, componentName: string): string[] {
	const child = childSurfaceOf(surface, componentName)?.components[componentName];
	const state = child?.state;
	if (!child || !state) return [];
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

/**
 * The widget families a rendered instance of a placed child STARTS: the families
 * its own payload roots, plus the families rooted by the composed roots its own
 * body wraps its `children` in. The CSR twin of the compiler's
 * `marklessWidgetRoots` marker, which splices the composed roots' families the
 * same way (`widgetRootMarkerLine`'s `composedRootSurfaceArgs`). A component
 * that composes a family root around its children owns no cell of that family,
 * yet every rendered instance of it starts an instance of it — so payload
 * ownership alone answers no where the render answers yes.
 */
export function renderedWidgetRootsOf(
	surface: PrerenderDataSurface,
	componentName: string,
): string[] {
	const composed = childrenProjectionChain(surface, componentName).flatMap((link) =>
		widgetRootsOf(link.surface, link.edge.childComponentName),
	);
	return [...new Set([...widgetRootsOf(surface, componentName), ...composed])];
}

// The surface that publishes a placed child: its own module when the child is
// declared there, otherwise the module it was imported from.
export function childSurfaceOf(
	surface: PrerenderDataSurface,
	componentName: string,
): PrerenderDataSurface | undefined {
	return surface.components[componentName] ? surface : surface.imports[componentName];
}

/**
 * Where a component's own `children` land inside ITS composition: the composed
 * children that enclose the projection, outermost first, truncated at the
 * innermost one that roots a widget. Composition placed those children there, so
 * the parts written into them belong to that root, not to the component the
 * consumer wrote. The CSR twin of the compiler's `marklessChildrenWidgetRoot`
 * marker: both read build-time chunk data, neither senses a rendered tree.
 */
export function childrenProjectionChain(
	surface: PrerenderDataSurface,
	componentName: string,
): ChildrenProjectionLink[] {
	const own = childSurfaceOf(surface, componentName);
	const definition = own?.components[componentName];
	if (!own || !definition) return [];
	const chunks = own.renderData.chunks.filter((chunk) => chunk.componentName === componentName);
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edges = definition.edges ?? [];
	const chain: ChildrenProjectionLink[] = [];
	let found: ChildrenProjectionLink[] = [];
	const walk = (chunkId: string): boolean => {
		const chunk = byId.get(chunkId);
		if (!chunk) return false;
		for (const slot of chunk.slots) {
			if (slot.kind === 'text' && isOwnChildrenResidue(slot.residue)) return true;
			if (slot.kind !== 'child-component' || !slot.projectionChunkId) continue;
			const edge = edges.find((candidate) => candidate.id === slot.componentEdgeId);
			if (!edge || edge.materialized) continue;
			const owner = chain[chain.length - 1];
			const ownerSurface = owner
				? childSurfaceOf(owner.surface, owner.edge.childComponentName)
				: own;
			const ownerDefinition = owner
				? ownerSurface?.components[owner.edge.childComponentName]
				: definition;
			if (!ownerSurface || !ownerDefinition) continue;
			chain.push({
				edge,
				surface: ownerSurface,
				definition: ownerDefinition,
				rootsWidget: widgetRootsOf(ownerSurface, edge.childComponentName).length > 0,
			});
			if (walk(slot.projectionChunkId)) {
				const rooted = chain.map((link) => link.rootsWidget).lastIndexOf(true);
				if (rooted >= 0) found = chain.slice(0, rooted + 1);
				return true;
			}
			chain.pop();
		}
		return false;
	};
	for (const chunk of chunks) if (chunk.kind === 'template' && walk(chunk.id)) break;
	return found;
}

/** That chain as the instance path it contributes, for the composition seam. */
export function childrenWidgetRootPath(
	surface: PrerenderDataSurface,
	componentName: string,
): string {
	return childrenProjectionChain(surface, componentName)
		.map((link) => link.edge.symbolPrefix)
		.join('');
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
