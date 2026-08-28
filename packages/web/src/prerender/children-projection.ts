import { marklessSsrEscape } from '../fns/html.ts';
import { marklessCarrierRootsWidget, type MarklessWidgetSite } from '../fns/composition.ts';
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
export function widgetRootsOf(
	surface: PrerenderDataSurface,
	componentName: string,
	placement?: WidgetPlacement,
): string[] {
	const child = childSurfaceOf(surface, componentName)?.components[componentName];
	const state = child?.state;
	if (!child || !state) return [];
	// A module serving several components publishes one payload for all of them
	// and names each component's own nodes by position, so ownership is the
	// selection, never the whole payload.
	const owned = new Set(ownedCellIds(child));
	// A carrier holds an unseeded family's cells without rooting it, so ownership
	// alone would read every part of such a family as a widget root of its own.
	const carried = new Set(widgetFallbacksOf(surface, componentName) ?? []);
	return (state.sharedDefinitions ?? []).flatMap((definition) => {
		if (definition.scope !== 'widget') return [];
		if (![...owned].some((graphNodeId) => graphNodeId.startsWith(definition.id + '/'))) return [];
		if (!carried.has(definition.id)) return [definition.id];
		// A carrier still roots when the page it stands on gives it the standing
		// composition would: it encloses other parts of the family and nothing
		// designates the family above it. Without a placement the standing is
		// unknown, and the answer stays the conservative no.
		return placement &&
			marklessCarrierRootsWidget(placementSites(placement, definition.id), {
				path: carrierPath(placement),
				designates: false,
				inRow: placement.inRow,
			})
			? [definition.id]
			: [];
	});
}

/** A component placed on a page, named in the surface that placed it. */
export type PlacedChild = {
	readonly surface: PrerenderDataSurface;
	readonly componentName: string;
};

/**
 * Where one placed child STANDS among the other children placed around it: the
 * placed children whose projections enclose it (innermost first), the ones its
 * own projection encloses at any depth, and whether it stands in a repeat row.
 * The build-time twin of the sibling instance paths composition reads.
 */
export type WidgetPlacement = {
	readonly enclosing: ReadonlyArray<PlacedChild>;
	readonly enclosed: ReadonlyArray<PlacedChild>;
	readonly inRow: boolean;
};

// The nesting spelled as paths whose prefix relation is the one composition
// reads off instance paths: one depth mark per enclosing child, and a distinct
// tail per enclosed one.
function carrierPath(placement: WidgetPlacement): string {
	return ':'.repeat(placement.enclosing.length + 1);
}

function placementSites(
	placement: WidgetPlacement,
	definitionId: string,
): ReadonlyArray<MarklessWidgetSite> {
	const depth = placement.enclosing.length;
	return [
		...placement.enclosing.map((placed, index) =>
			widgetSiteOf(placed, definitionId, ':'.repeat(depth - index)),
		),
		...placement.enclosed.map((placed, index) =>
			widgetSiteOf(placed, definitionId, `${carrierPath(placement)}@${index}`),
		),
	].flatMap((site) => (site ? [site] : []));
}

// A placed child is a site of this family only when its own payload owns the
// family's cells, which is the ownership test composition makes on a compose
// child's composed state.
function widgetSiteOf(
	placed: PlacedChild,
	definitionId: string,
	path: string,
): MarklessWidgetSite | undefined {
	const child = childSurfaceOf(placed.surface, placed.componentName)?.components[
		placed.componentName
	];
	if (!child) return undefined;
	if (!ownedCellIds(child).some((graphNodeId) => graphNodeId.startsWith(definitionId + '/')))
		return undefined;
	return {
		path,
		designates: !(widgetFallbacksOf(placed.surface, placed.componentName) ?? []).includes(
			definitionId,
		),
		inRow: false,
	};
}

/**
 * The widget families a placed child CARRIES the cells of without rooting: a
 * part of somebody else's widget, holding them only so a page that renders no
 * designated root still has them. The CSR twin of the SSR render output's
 * `widgetFallbacks` field.
 */
export function widgetFallbacksOf(
	surface: PrerenderDataSurface,
	componentName: string,
): ReadonlyArray<string> | undefined {
	return childSurfaceOf(surface, componentName)?.components[componentName]?.widgetFallbacks;
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
	placement?: WidgetPlacement,
): string[] {
	const composed = childrenProjectionChain(surface, componentName).flatMap((link) =>
		widgetRootsOf(link.surface, link.edge.childComponentName),
	);
	return [...new Set([...widgetRootsOf(surface, componentName, placement), ...composed])];
}

// The escaper's own table, read back off it, so the decode cannot drift from the
// escape it inverts. The CSR twin of the compiler's `projection-text.ts`.
const DECODED_BY_ENTITY = new Map(
	Array.from({ length: 128 }, (_, code) => String.fromCharCode(code))
		.map((character) => [marklessSsrEscape(character), character] as const)
		.filter(([entity, character]) => entity !== character),
);

const ENTITY_PATTERN = new RegExp([...DECODED_BY_ENTITY.keys()].join('|'), 'g');

/**
 * The text a projection's compiled statics render as: tags dropped, entities
 * decoded in one left-to-right pass, never chained replacements — authored
 * `&lt;` is `&amp;lt;` in the statics and must decode back to `&lt;`, not to
 * `<`. The CSR twin of the compiler's `projectionTextContent`.
 */
function projectionTextContent(statics: ReadonlyArray<string>): string {
	return statics
		.join('')
		.replaceAll(/<[^>]*>/g, '')
		.replaceAll(ENTITY_PATTERN, (entity) => DECODED_BY_ENTITY.get(entity) ?? entity);
}

/**
 * The text content one placed child's projection already has BEFORE it renders.
 * The seed pass runs ahead of the projection, so a part that seeds from
 * `children` normally sees undefined; a projection spelled entirely in the
 * chunk's statics — plain text, or markup carrying no expression — is known this
 * early. A slot is the line: it has no value until it renders, and returns
 * nothing. The CSR twin of the compiler's `staticProjectionChildren`, over the
 * same build-time chunks.
 */
export function staticProjectionChildren(
	surface: PrerenderDataSurface,
	componentEdgeId: string,
): string | undefined {
	const chunks = surface.renderData.chunks;
	const projectionChunkId = chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'child-component' &&
			slot.componentEdgeId === componentEdgeId &&
			slot.projectionChunkId
				? [slot.projectionChunkId]
				: [],
		),
	)[0];
	if (projectionChunkId === undefined) return undefined;
	const projection = chunks.find((chunk) => chunk.id === projectionChunkId);
	if (!projection || projection.slots.length > 0) return undefined;
	return projectionTextContent(projection.statics);
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
