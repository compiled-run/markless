import type {
	ModuleGraphInterfaceArtifact,
	SemanticComponentEdge,
	SemanticMarkupArtifact,
	SemanticMarkupSlot,
} from '../artifacts.ts';

type MarkupChunks = SemanticMarkupArtifact['chunks'];

type ChildCensusInput = {
	readonly chunks: MarkupChunks;
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly componentNames: ReadonlyArray<string>;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
};

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
	input: ChildCensusInput & {
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
 * module interface it published.
 */
function childIsConstructFree(
	input: ChildCensusInput,
	edge: SemanticComponentEdge,
	childTemplateId: string,
	seen: Set<string>,
): boolean {
	if (edge.importSource === undefined) {
		return (
			input.componentNames.includes(edge.childComponentName) &&
			chunkTreeIsConstructFree(input, childTemplateId, seen)
		);
	}
	const moduleInterface = input.importedModuleInterfaces?.[edge.importSource];
	const entry = moduleInterface?.render.components.find(
		(candidate) => candidate.componentName === edge.childComponentName,
	);
	if (!moduleInterface || !entry) return false;
	// A known element count is the interface's own proof that every chunk the
	// child reaches was visible in its module and that none of them is a repeat,
	// an async arm or an omittable host: those never resolve to a number. Branch
	// arms can agree on one, and the interface never says which components the
	// child reaches, so no component of that module may carry arm chunks either.
	if (entry.elementCount === 'unknown') return false;
	return !moduleInterface.render.components.some((candidate) =>
		candidate.childChunks.some(
			(chunk) => chunk.kind === 'branch-arm' || chunk.kind === 'async-arm',
		),
	);
}

// A chunk this module holds, and everything it reaches, proven construct-free.
// A chunk id with no chunk behind it is unknowable, which is not a pass.
function chunkTreeIsConstructFree(
	input: ChildCensusInput,
	chunkId: string,
	seen: Set<string>,
): boolean {
	if (seen.has(chunkId)) return true;
	seen.add(chunkId);
	const chunk = input.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return false;
	for (const slot of chunk.slots) {
		if (slot.kind === 'branch' || slot.kind === 'async') return false;
		if (slot.kind === 'child-component') {
			if (slot.projectionChunkId && !chunkTreeIsConstructFree(input, slot.projectionChunkId, seen))
				return false;
			const childEdge = input.componentEdges.find(
				(candidate) => candidate.id === slot.componentEdgeId,
			);
			if (!childEdge || !childIsConstructFree(input, childEdge, slot.childTemplateId, seen))
				return false;
			continue;
		}
		const childChunkIds =
			slot.kind === 'repeat'
				? [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])]
				: slot.kind === 'dynamic-host'
					? [slot.childChunkId]
					: [];
		for (const childChunkId of childChunkIds) {
			if (!chunkTreeIsConstructFree(input, childChunkId, seen)) return false;
		}
	}
	return true;
}
