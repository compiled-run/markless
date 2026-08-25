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
 * attribute values read off the repeated item), and the record then carries both
 * halves: the wrapper markup in `rowTemplate`, the child identity here, and
 * `slotPath` naming the marker inside the wrapper the child's nodes replace.
 *
 * Refused when the edge projects children: rebuilding those needs the caller's
 * markup as well as the child's own. The child itself may live in another
 * module - the payload's component surface carries the import chain the row
 * render walks - so an imported child mints on the same terms as a local one.
 *
 * Also refused when the component's body carries a branch (`@if`/`@switch`) or a
 * boundary (`@try`): those anchor into a census the page counted once, at boot,
 * for the rows it served. A row born after resume has no counted anchors, so the
 * mint would index into another row's - which is why the runtime refuses such a
 * row loudly. Refusing here means the page never gets that far: it falls back to
 * today's no-growth behaviour instead. That question must be ANSWERED, not
 * assumed: a child whose census this module cannot reach is refused too.
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
	if (slot.kind !== 'child-component' || slot.projectionChunkId) return null;
	const wraps = input.rowElementCount > 0;
	if (wraps) {
		// The wrapper is minted from markup, so its own slots have to be ones that
		// markup plus the item can finish - and the child needs a marker to land on.
		if (slot.coordinate.kind !== 'comment-anchor') return null;
		if (!chunk.slots.every((candidate) => candidate === slot || mintableFromItem(candidate)))
			return null;
	} else if (chunk.slots.length !== 1) return null;
	const componentName = chunk.componentName;
	if (!componentName) return null;
	const edge = input.componentEdges.find((candidate) => candidate.id === slot.componentEdgeId);
	if (!edge || edge.parentComponentName !== componentName) return null;
	if (edge.children.childCount > 0) return null;
	if (!childIsConstructFree(input, edge, slot.childTemplateId, new Set())) return null;
	const itemProps = edge.props.filter((prop) => prop.source === input.itemName);
	return {
		componentEdgeId: slot.componentEdgeId,
		componentName,
		...(itemProps.length === 1 ? { itemPropName: itemProps[0]!.name } : {}),
		...(wraps ? { slotPath: slot.coordinate.path } : {}),
	};
}

/** The one slot shape a row template fills alone: a text or attribute read off the row's item. */
export function mintableFromItem(slot: SemanticMarkupSlot): boolean {
	return (
		(slot.kind === 'text' || slot.kind === 'attribute') && slot.residue.kind === 'repeat-item'
	);
}

/**
 * Whether one component the row reaches is PROVABLY free of the constructs whose
 * anchors the page counted only for the rows it served - a branch or an async
 * boundary - anywhere in what it renders.
 *
 * Provably is the whole point: a census this module cannot reach is a refusal,
 * never a pass. A child declared here is answered from this module's own chunks.
 * A child behind an import has no chunks here, so the answer comes from the
 * construct reach its module published PER COMPONENT - a fact about that
 * component's own tree, so a branching sibling of it says nothing about this row.
 */
function childIsConstructFree(
	input: ConstructReachInput,
	edge: SemanticComponentEdge,
	childTemplateId: string,
	seen: Set<string>,
): boolean {
	if (edge.importSource !== undefined) {
		// A known element count is the interface's own proof that none of the chunks
		// the child reaches is a repeat, an async arm or an omittable host: those
		// never resolve to a number, and a row rebuilt around one would place its
		// nodes against a count the served page never had.
		const entry = input.importedModuleInterfaces?.[edge.importSource]?.render.components.find(
			(candidate) => candidate.componentName === edge.childComponentName,
		);
		if (!entry || entry.elementCount === 'unknown') return false;
	}
	return childConstructReach(input, edge, childTemplateId, seen) === 'free';
}
