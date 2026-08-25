import type { SemanticComponentEdge, SemanticMarkupArtifact } from '../artifacts.ts';

type MarkupChunks = SemanticMarkupArtifact['chunks'];

export type RowComponentMint = {
	readonly componentEdgeId: string;
	readonly componentName: string;
	readonly itemPropName?: string;
};

/**
 * The component a row roots, named by identity, for the mint that builds a row
 * the server never rendered.
 *
 * A component row carries no markup: the client rebuilds it by running the same
 * one-edge render the server ran, so what it needs is the edge to run and the
 * component that owns it, not a copy of the output.
 *
 * Refused unless the row is nothing BUT that component (one slot, no element of
 * its own), the child is declared in this same module, and the edge projects no
 * children. Cross-module and projected rows are later phases.
 *
 * Also refused when the component's body carries a branch (`@if`/`@switch`) or a
 * boundary (`@try`): those anchor into a census the page counted once, at boot,
 * for the rows it served. A row born after resume has no counted anchors, so the
 * mint would index into another row's - which is why the runtime refuses such a
 * row loudly. Refusing here means the page never gets that far: it falls back to
 * today's no-growth behaviour instead.
 *
 * The public render plan pass asks the same question to decide whether a row
 * that cannot grow deserves a diagnostic, so the answer lives here once.
 */
export function resolveRowComponentMint(input: {
	readonly chunks: MarkupChunks;
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly componentNames: ReadonlyArray<string>;
	readonly rowChunkId: string;
	readonly rowElementCount: number;
	readonly itemName: string;
}): RowComponentMint | null {
	const chunk = input.chunks.find((candidate) => candidate.id === input.rowChunkId);
	if (!chunk || chunk.slots.length !== 1 || input.rowElementCount > 0) return null;
	const slot = chunk.slots[0]!;
	if (slot.kind !== 'child-component' || slot.projectionChunkId) return null;
	const componentName = chunk.componentName;
	if (!componentName) return null;
	const edge = input.componentEdges.find((candidate) => candidate.id === slot.componentEdgeId);
	if (!edge || edge.parentComponentName !== componentName) return null;
	// Same module, no projection: the child has to be one this module declares,
	// reachable through this module's own render data.
	if (edge.importSource !== undefined || edge.children.childCount > 0) return null;
	if (!input.componentNames.includes(edge.childComponentName)) return null;
	if (chunkTreeHasConstruct(input.chunks, slot.childTemplateId)) return null;
	const itemProps = edge.props.filter((prop) => prop.source === input.itemName);
	return {
		componentEdgeId: slot.componentEdgeId,
		componentName,
		...(itemProps.length === 1 ? { itemPropName: itemProps[0]!.name } : {}),
	};
}

// Whether a chunk, or anything it reaches, holds a construct whose anchors the
// page counted only for the rows it served: a branch or an async boundary.
export function chunkTreeHasConstruct(
	chunks: MarkupChunks,
	chunkId: string,
	seen = new Set<string>(),
): boolean {
	if (seen.has(chunkId)) return false;
	seen.add(chunkId);
	const chunk = chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return false;
	for (const slot of chunk.slots) {
		if (slot.kind === 'branch' || slot.kind === 'async') return true;
		const childChunkIds =
			slot.kind === 'repeat'
				? [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])]
				: slot.kind === 'child-component'
					? [slot.childTemplateId, ...(slot.projectionChunkId ? [slot.projectionChunkId] : [])]
					: slot.kind === 'dynamic-host'
						? [slot.childChunkId]
						: [];
		for (const childChunkId of childChunkIds) {
			if (chunkTreeHasConstruct(chunks, childChunkId, seen)) return true;
		}
	}
	return false;
}
