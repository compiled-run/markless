import type {
	ModuleGraphInterfaceArtifact,
	SemanticComponentEdge,
	SemanticMarkupChunk,
	SemanticMarkupSlot,
} from '../../artifacts.ts';

/**
 * Whether a component renders its `{children}` whenever it renders: a hole in
 * its root chunk, or in children it hands to a component that does the same.
 * A component this compile cannot see counts as not always.
 */
export type ChildrenAlwaysFacts = {
	readonly component: (componentName: string) => boolean;
	readonly projectedThrough: (componentEdgeId: string) => boolean;
};

type ChildSlot = Extract<SemanticMarkupSlot, { readonly kind: 'child-component' }>;

export function childrenAlwaysFacts(input: {
	readonly chunks: ReadonlyArray<SemanticMarkupChunk>;
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly componentNames: ReadonlySet<string>;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): ChildrenAlwaysFacts {
	const slotByEdge = new Map<string, { slot: ChildSlot; chunk: SemanticMarkupChunk }>();
	const slotByProjection = new Map<string, { slot: ChildSlot; chunk: SemanticMarkupChunk }>();
	for (const chunk of input.chunks)
		for (const slot of chunk.slots) {
			if (slot.kind !== 'child-component') continue;
			slotByEdge.set(slot.componentEdgeId, { slot, chunk });
			if (slot.projectionChunkId) slotByProjection.set(slot.projectionChunkId, { slot, chunk });
		}
	const edges = new Map(input.componentEdges.map((edge) => [edge.id, edge]));
	const memo = new Map<string, boolean>();

	const childAlways = (slot: ChildSlot): boolean => {
		const edge = edges.get(slot.componentEdgeId);
		if (edge?.importSource) {
			const imported = input.importedModuleInterfaces?.[edge.importSource]?.render.components.find(
				(candidate) =>
					candidate.componentName === edge.childComponentName ||
					(edge.importedName !== undefined && candidate.exportName === edge.importedName),
			);
			return imported?.childrenAlwaysRendered === true;
		}
		return input.componentNames.has(slot.childComponentName) && component(slot.childComponentName);
	};
	const climb = (chunk: SemanticMarkupChunk): boolean => {
		if (chunk.kind === 'template') return chunk.id === `template:${chunk.componentName}`;
		if (chunk.kind !== 'component-projection') return false;
		const parent = slotByProjection.get(chunk.id);
		return !!parent && childAlways(parent.slot) && climb(parent.chunk);
	};
	const component = (componentName: string): boolean => {
		const known = memo.get(componentName);
		if (known !== undefined) return known;
		// A component that reaches itself through its own children never settles, so it reads as not always.
		memo.set(componentName, false);
		const answer = input.chunks.some(
			(chunk) =>
				chunk.componentName === componentName &&
				chunk.slots.some(
					(slot) =>
						slot.kind === 'text' && slot.raw === true && slot.coordinate.kind === 'comment-anchor',
				) &&
				climb(chunk),
		);
		memo.set(componentName, answer);
		return answer;
	};
	return {
		component,
		projectedThrough(componentEdgeId) {
			const found = slotByEdge.get(componentEdgeId);
			return !!found && childAlways(found.slot) && climb(found.chunk);
		},
	};
}
