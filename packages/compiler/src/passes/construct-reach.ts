import type {
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceConstructReach,
	SemanticComponentEdge,
	SemanticMarkupArtifact,
} from '../artifacts.ts';

export type ConstructReachInput = {
	readonly chunks: SemanticMarkupArtifact['chunks'];
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly componentNames: ReadonlyArray<string>;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
};

/**
 * Whether one component's whole reachable tree carries a branch or an async
 * boundary, answered from this module's chunks and the interfaces of the
 * modules it imports.
 *
 * A chunk this compile cannot see, an edge it cannot resolve, or an imported
 * child whose own answer is unknown all make the whole answer unknown - never a
 * pass. A construct found outright wins over an unknown elsewhere, so a caller
 * that wants to explain the refusal gets the definite reason when there is one.
 */
export function componentConstructReach(
	input: ConstructReachInput,
	rootChunkId: string,
): ModuleGraphInterfaceConstructReach {
	return chunkTreeConstructReach(input, rootChunkId, new Set());
}

/** The answer for the component one edge reaches, local or behind an import. */
export function childConstructReach(
	input: ConstructReachInput,
	edge: SemanticComponentEdge,
	childTemplateId: string,
	seen: Set<string>,
): ModuleGraphInterfaceConstructReach {
	if (edge.importSource === undefined) {
		return input.componentNames.includes(edge.childComponentName)
			? chunkTreeConstructReach(input, childTemplateId, seen)
			: 'unknown';
	}
	const entry = input.importedModuleInterfaces?.[edge.importSource]?.render.components.find(
		(candidate) => candidate.componentName === edge.childComponentName,
	);
	return entry?.constructReach ?? 'unknown';
}

function chunkTreeConstructReach(
	input: ConstructReachInput,
	chunkId: string,
	seen: Set<string>,
): ModuleGraphInterfaceConstructReach {
	if (seen.has(chunkId)) return 'free';
	seen.add(chunkId);
	const chunk = input.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return 'unknown';
	let unknown = false;
	for (const slot of chunk.slots) {
		if (slot.kind === 'branch' || slot.kind === 'async') return 'constructs';
		if (slot.kind === 'child-component') {
			if (slot.projectionChunkId) {
				const projected = chunkTreeConstructReach(input, slot.projectionChunkId, seen);
				if (projected === 'constructs') return 'constructs';
				if (projected === 'unknown') unknown = true;
			}
			const childEdge = input.componentEdges.find(
				(candidate) => candidate.id === slot.componentEdgeId,
			);
			if (!childEdge) {
				unknown = true;
				continue;
			}
			const child = childConstructReach(input, childEdge, slot.childTemplateId, seen);
			if (child === 'constructs') return 'constructs';
			if (child === 'unknown') unknown = true;
			continue;
		}
		const childChunkIds =
			slot.kind === 'repeat'
				? [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])]
				: slot.kind === 'dynamic-host'
					? [slot.childChunkId]
					: [];
		for (const childChunkId of childChunkIds) {
			const nested = chunkTreeConstructReach(input, childChunkId, seen);
			if (nested === 'constructs') return 'constructs';
			if (nested === 'unknown') unknown = true;
		}
	}
	return unknown ? 'unknown' : 'free';
}
