import type { ProtocolRowTemplateSlotValue } from '@markless/serializer';
import type { SemanticComponentEdge, SemanticMarkupSlot } from '../artifacts.ts';
import { childConstructReach, type ConstructReachInput } from './construct-reach.ts';

export type RowComponentMint = {
	readonly componentEdgeId: string;
	readonly componentName: string;
	readonly itemPropName?: string;
	/**
	 * Where the child's nodes go inside the row's own markup, as the
	 * fragment-relative path of the marker they replace. Absent when the row IS
	 * the component and there is no wrapper to place it in.
	 */
	readonly slotPath?: ReadonlyArray<number>;
};

/**
 * The component a row roots, named by identity, for the mint that builds a row
 * the server never rendered.
 *
 * A component row carries no markup of its own: the client rebuilds it by
 * running the same one-edge render the server ran, so what it needs is the edge
 * to run and the component that owns it, not a copy of the output.
 *
 * Two row shapes reach that point. The row can BE the component - one slot, no
 * element of its own - or a row element can WRAP it, which is the checklist
 * idiom: `<li data-row={item.id}><Card ... /></li>`. A wrapper is admitted only
 * when the wrapper's own slots are ones the row template already mints (text or
 * attribute values off the repeated item or off the page's graph), and the record
 * then carries both
 * halves: the wrapper markup in `rowTemplate`, the child identity here, and
 * `slotPath` naming the marker inside the wrapper the child's nodes replace.
 *
 * A row that PROJECTS children mints when the projection is component parts and
 * the text between them (see `projectionIsMintable`): the parts render in the
 * row's own identity and compose beside the row's child. The child itself may
 * live in another module - the payload's component surface carries the import
 * chain the row render walks - so an imported child mints on the same terms as a
 * local one.
 *
 * Still refused when the component's body carries a boundary (`@try`): its
 * settle bookkeeping reads a census the page counted once, at boot, for the rows
 * it served, and a row born after resume has none of it - the mint would index
 * into another row's, which is why the runtime refuses such a row loudly.
 * Refusing here means the page never gets that far: it falls back to today's
 * no-growth behaviour instead. A branch is admitted: its anchors are a comment
 * pair the minted row counts in its own fragment, exactly as it counts its own
 * elements. That question must be ANSWERED, not assumed: a child whose tree this
 * module cannot reach is refused too, because the chunk it could not read might
 * have held a boundary.
 *
 * The public render plan pass asks the same question to decide whether a row
 * that cannot grow deserves a diagnostic, so the answer lives here once.
 */
export function resolveRowComponentMint(
	input: ConstructReachInput & {
		readonly rowChunkId: string;
		readonly rowElementCount: number;
		readonly itemName: string;
	},
): RowComponentMint | null {
	const chunk = input.chunks.find((candidate) => candidate.id === input.rowChunkId);
	if (!chunk) return null;
	const componentSlots = chunk.slots.filter((candidate) => candidate.kind === 'child-component');
	if (componentSlots.length !== 1) return null;
	const slot = componentSlots[0]!;
	if (slot.kind !== 'child-component') return null;
	const wraps = input.rowElementCount > 0;
	if (wraps) {
		// The wrapper is minted from markup, so its own slots have to be ones that
		// markup plus the item can finish - and the child needs a marker to land on.
		if (slot.coordinate.kind !== 'comment-anchor') return null;
		if (!chunk.slots.every((candidate) => candidate === slot || mintableSlotValue(candidate) !== null))
			return null;
	} else if (chunk.slots.length !== 1) return null;
	const componentName = chunk.componentName;
	if (!componentName) return null;
	const edge = input.componentEdges.find((candidate) => candidate.id === slot.componentEdgeId);
	if (!edge || edge.parentComponentName !== componentName) return null;
	if (edge.children.childCount > 0 && slot.projectionChunkId === undefined) return null;
	if (
		slot.projectionChunkId !== undefined &&
		!projectionIsMintable(input, slot.projectionChunkId, new Set())
	)
		return null;
	if (!childIsMintable(input, edge, slot.childTemplateId, new Set())) return null;
	const itemProps = edge.props.filter((prop) => prop.source === input.itemName);
	return {
		componentEdgeId: slot.componentEdgeId,
		componentName,
		...(itemProps.length === 1 ? { itemPropName: itemProps[0]!.name } : {}),
		...(wraps ? { slotPath: slot.coordinate.path } : {}),
	};
}

/**
 * Whether what a row PROJECTS into its component is content the mint can rebuild.
 *
 * The projection is the owner's own markup rendered inside the row, so anything
 * in it that needs a record - an element to locate, a value to refresh, an arm to
 * flip - would need that record filed against a row the page never counted. What
 * the mint CAN rebuild is a projection made of components: each one renders in
 * the row's own identity and composes its whole record set beside the row's, the
 * same crossing the row's own child already makes. So the shape admitted here is
 * component parts, a value the row template itself could fill, and the static
 * text between them; each part answers the same reach question the row's own
 * child answers. Such a value needs no record at all - the row render fills it
 * from the item it was handed and the live graph, as a row template does.
 */
function projectionIsMintable(
	input: ConstructReachInput,
	projectionChunkId: string,
	seen: Set<string>,
): boolean {
	if (seen.has(projectionChunkId)) return false;
	seen.add(projectionChunkId);
	const chunk = input.chunks.find((candidate) => candidate.id === projectionChunkId);
	if (!chunk || chunk.hosts.length > 0) return false;
	return chunk.slots.every((slot) => {
		if (mintableSlotValue(slot)) return true;
		if (slot.kind !== 'child-component') return false;
		if (
			slot.projectionChunkId !== undefined &&
			!projectionIsMintable(input, slot.projectionChunkId, seen)
		)
			return false;
		const edge = input.componentEdges.find(
			(candidate) => candidate.id === slot.componentEdgeId,
		);
		return edge !== undefined && childIsMintable(input, edge, slot.childTemplateId, new Set());
	});
}

/**
 * Where a row template would take this slot's value, or null for a slot no
 * template can fill.
 *
 * Two channels: a property of the repeated item, and a read of a graph node the
 * page already holds. What stays refused is a value only the render produces -
 * an authored expression, an element handle's id - which no record can name.
 */
export function mintableSlotValue(slot: SemanticMarkupSlot): ProtocolRowTemplateSlotValue | null {
	if (slot.kind !== 'text' && slot.kind !== 'attribute') return null;
	if (slot.residue.kind === 'repeat-item') return { itemPath: slot.residue.path };
	return slot.residue.kind === 'graph-read'
		? { graphNodeId: slot.residue.graphNodeId, graphPath: slot.residue.path }
		: null;
}

/**
 * Whether one component the row reaches is PROVABLY free of the constructs a
 * minted row cannot rebuild: an async boundary, whose settle bookkeeping the page
 * counted only for the rows it served, and a repeat or omittable host, whose node
 * count only the render knows.
 *
 * Provably is the whole point: a tree this module cannot reach is a refusal,
 * never a pass. A child declared here is answered from this module's own chunks.
 * A child behind an import has no chunks here, so the answer comes from the
 * construct reach its module published PER COMPONENT - a fact about that
 * component's own tree, so a boundary in a sibling of it says nothing about this
 * row.
 */
function childIsMintable(
	input: ConstructReachInput,
	edge: SemanticComponentEdge,
	childTemplateId: string,
	seen: Set<string>,
): boolean {
	if (edge.importSource !== undefined) {
		const entry = input.importedModuleInterfaces?.[edge.importSource]?.render.components.find(
			(candidate) => candidate.componentName === edge.childComponentName,
		);
		if (!entry) return false;
	}
	// The reach IS the proof: a repeat, an omittable host or an async arm each
	// answer with their own name, and the answer is transitive, so a construct
	// behind another import still reaches this question.
	const reach = childConstructReach(input, edge, childTemplateId, seen);
	return reach === 'free' || reach === 'branches';
}
