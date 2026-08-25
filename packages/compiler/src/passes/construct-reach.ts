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
 * Which constructs one component's whole reachable tree carries, answered from
 * this module's chunks and the interfaces of the modules it imports.
 *
 * A chunk this compile cannot see, an edge it cannot resolve, or an imported
 * child whose own answer is unknown all make the whole answer unknown - never a
 * pass. Severity wins over silence, so a caller that wants to explain a refusal
 * gets the definite reason when there is one: a boundary found outright outranks
 * an unknown, and an unknown outranks branches, because the chunk nobody could
 * read might have held a boundary.
 */
export function componentConstructReach(
	input: ConstructReachInput,
	rootChunkId: string,
): ModuleGraphInterfaceConstructReach {
	return chunkTreeConstructReach(input, rootChunkId, new Set());
}

const REACH_RANK: Readonly<Record<ModuleGraphInterfaceConstructReach, number>> = {
	free: 0,
	branches: 1,
	unknown: 2,
	boundaries: 3,
};

function worseReach(
	left: ModuleGraphInterfaceConstructReach,
	right: ModuleGraphInterfaceConstructReach,
): ModuleGraphInterfaceConstructReach {
	return REACH_RANK[right] > REACH_RANK[left] ? right : left;
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
	let reach: ModuleGraphInterfaceConstructReach = 'free';
	for (const slot of chunk.slots) {
		if (slot.kind === 'async') return 'boundaries';
		// A branch is admissible on its own, but an arm of it can still hold a
		// boundary, so the arms are walked rather than short-circuited.
		if (slot.kind === 'branch') {
			reach = worseReach(reach, 'branches');
			for (const armChunkId of slot.armTemplateIds) {
				const arm = chunkTreeConstructReach(input, armChunkId, seen);
				if (arm === 'boundaries') return 'boundaries';
				reach = worseReach(reach, arm);
			}
			continue;
		}
		if (slot.kind === 'child-component') {
			if (slot.projectionChunkId) {
				const projected = chunkTreeConstructReach(input, slot.projectionChunkId, seen);
				if (projected === 'boundaries') return 'boundaries';
				reach = worseReach(reach, projected);
			}
			const childEdge = input.componentEdges.find(
				(candidate) => candidate.id === slot.componentEdgeId,
			);
			if (!childEdge) {
				reach = worseReach(reach, 'unknown');
				continue;
			}
			const child = childConstructReach(input, childEdge, slot.childTemplateId, seen);
			if (child === 'boundaries') return 'boundaries';
			reach = worseReach(reach, child);
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
			if (nested === 'boundaries') return 'boundaries';
			reach = worseReach(reach, nested);
		}
	}
	return reach;
}
