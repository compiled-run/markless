import type {
	RenderDataArtifact,
	SemanticGraphArtifact,
	SemanticMarkupSlot,
} from '../artifacts.ts';

type ChildComponentSlot = Extract<SemanticMarkupSlot, { readonly kind: 'child-component' }>;

/** How a flip answers one prop the child's markup reads. */
export type ArmChildProp =
	| { readonly kind: 'constant'; readonly value: unknown }
	| {
			readonly kind: 'read';
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
	  }
	// A function the caller passed: it wires the child's records, and markup that
	// tries to show it refuses instead.
	| { readonly kind: 'unreadable' };

export type ArmChildDescent = {
	readonly chunkId: string;
	readonly props: ReadonlyMap<string, ArmChildProp>;
};

/**
 * The child template a flip can rebuild in place, or null when it cannot.
 *
 * Both the arm-parts emitter and the arm-record planner ask this one question,
 * so the markup a flip writes and the records it rewires always describe the
 * same DOM. A child qualifies when its markup lives in this module's render
 * data, its props are values the flip can recompute, and it contributes exactly
 * one top-level node (every coordinate inside it starts at index 0), which is
 * what keeps the composed host paths of its siblings stable.
 */
export function armChildDescent(
	renderData: RenderDataArtifact,
	semanticGraph: SemanticGraphArtifact | undefined,
	slot: ChildComponentSlot,
): ArmChildDescent | null {
	if (!semanticGraph || slot.projectionChunkId) return null;
	const edge = semanticGraph.componentEdges.find(
		(candidate) => candidate.id === slot.componentEdgeId,
	);
	if (!edge || edge.importSource || edge.children.childCount > 0) return null;
	// A cell a child declares joins the page graph only when the child renders,
	// so an arm that was closed at first render has nothing for the flip to read.
	if (
		semanticGraph.graphBindings.some(
			(binding) =>
				binding.componentName === edge.childComponentName && binding.kind !== 'prop',
		)
	)
		return null;
	const props = new Map<string, ArmChildProp>();
	for (const prop of edge.props) {
		if (prop.kind === 'graph-reference') {
			props.set(prop.name, { kind: 'read', graphNodeId: prop.graphNodeId, path: prop.path });
			continue;
		}
		if (prop.kind === 'serializable') {
			props.set(prop.name, { kind: 'constant', value: prop.value });
			continue;
		}
		// A function prop wires the child's records through a bound symbol the
		// capture pass mints only for a child that rendered, so a flip cannot.
		return null;
	}
	if (!singleRootChunk(renderData, slot.childTemplateId)) return null;
	return { chunkId: slot.childTemplateId, props };
}

function singleRootChunk(renderData: RenderDataArtifact, chunkId: string): boolean {
	const chunk = renderData.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk || chunk.hosts.length === 0) return false;
	return (
		chunk.hosts.every((host) => host.coordinate.path[0] === 0) &&
		chunk.slots.every((slot) => slot.coordinate.path[0] === 0)
	);
}

/**
 * Arm-relative host paths for everything an arm shows, including the markup of
 * the child components the flip rebuilds. `materializeBranchArmRecords` walks
 * these paths from the nodes between the branch anchors, so a child's hosts
 * must be addressed in the arm's coordinate space rather than the child's own.
 */
export type ArmHostPlacement = {
	readonly path: ReadonlyArray<number>;
	/** The props of the child this host belongs to; empty for the arm's own hosts. */
	readonly props: ReadonlyMap<string, ArmChildProp>;
};

export function armHostPaths(
	renderData: RenderDataArtifact,
	semanticGraph: SemanticGraphArtifact | undefined,
	chunkId: string,
): ReadonlyMap<string, ArmHostPlacement> {
	const paths = new Map<string, ArmHostPlacement>();
	const noProps: ReadonlyMap<string, ArmChildProp> = new Map();
	collect(chunkId, [], noProps, new Set());
	return paths;

	function collect(
		id: string,
		offset: ReadonlyArray<number>,
		props: ReadonlyMap<string, ArmChildProp>,
		seen: Set<string>,
	): void {
		if (seen.has(id)) return;
		seen.add(id);
		const chunk = renderData.chunks.find((candidate) => candidate.id === id);
		if (!chunk) return;
		for (const host of chunk.hosts)
			paths.set(host.hostNodeId, { path: compose(offset, host.coordinate.path), props });
		for (const slot of chunk.slots) {
			if (slot.kind !== 'child-component') continue;
			const descent = armChildDescent(renderData, semanticGraph, slot);
			if (!descent) continue;
			collect(descent.chunkId, compose(offset, slot.coordinate.path), descent.props, seen);
		}
	}
}

/**
 * The live read behind a child's prop read, so a record inside a rebuilt child
 * subscribes to the caller's node instead of the child-local `prop:` id that
 * only exists while the child is rendering.
 */
export function armChildRead(
	props: ReadonlyMap<string, ArmChildProp>,
	graphNodeId: string,
	path: ReadonlyArray<string>,
): { readonly graphNodeId: string; readonly path: ReadonlyArray<string> } | null {
	if (props.size === 0 || !graphNodeId.startsWith('prop:')) return null;
	const name = graphNodeId === 'prop:props' ? path[0] : graphNodeId.slice('prop:'.length);
	const rest = graphNodeId === 'prop:props' ? path.slice(1) : path;
	if (name === undefined) return null;
	const prop = props.get(name);
	if (prop?.kind !== 'read') return null;
	return { graphNodeId: prop.graphNodeId, path: [...prop.path, ...rest] };
}

// A single-root child starts at its parent slot's own position, so composing is
// appending the coordinate's tail to the position the child was spliced at.
function compose(
	offset: ReadonlyArray<number>,
	path: ReadonlyArray<number>,
): ReadonlyArray<number> {
	if (offset.length === 0) return path;
	const head = offset[offset.length - 1] ?? 0;
	return [...offset.slice(0, -1), head + (path[0] ?? 0), ...path.slice(1)];
}
