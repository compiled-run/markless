import type {
	ModuleGraphInterfaceArtifact,
	RenderDataArtifact,
	SemanticComponentEdge,
	SemanticGraphArtifact,
	SemanticMarkupChunk,
	SemanticMarkupSlot,
} from '../artifacts.ts';

type ChildComponentSlot = Extract<SemanticMarkupSlot, { readonly kind: 'child-component' }>;

/** The interfaces of the modules this one imports, keyed by import specifier. */
export type ArmImportedInterfaces = Readonly<Record<string, ModuleGraphInterfaceArtifact>>;

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
	/**
	 * Where the child's markup lives: this module's own render data for a child
	 * written here, the imported module's published arm material for one that
	 * comes from another file.
	 */
	readonly chunks: ReadonlyArray<SemanticMarkupChunk>;
	/**
	 * An imported child's host ids are its own module's, so they name nothing in
	 * this module's records and are never addressed from this module's arms.
	 */
	readonly imported: boolean;
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
	interfaces?: ArmImportedInterfaces,
): ArmChildDescent | null {
	if (!semanticGraph || slot.projectionChunkId) return null;
	const edge = semanticGraph.componentEdges.find(
		(candidate) => candidate.id === slot.componentEdgeId,
	);
	if (!edge || edge.children.childCount > 0) return null;
	const material = edge.importSource
		? importedArmMaterial(interfaces, edge)
		: // A cell a child declares joins the page graph only when the child renders,
			// so an arm that was closed at first render has nothing for the flip to read.
			semanticGraph.graphBindings.some(
					(binding) =>
						binding.componentName === edge.childComponentName && binding.kind !== 'prop',
				)
			? null
			: { chunkId: slot.childTemplateId, chunks: renderData.chunks };
	if (!material) return null;
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
		// A function the caller passed wires the child's records through a bound
		// symbol minted for this edge whether or not the arm is open; markup that
		// tries to SHOW it refuses instead (see scopedPropPart).
		if (prop.kind === 'callback') {
			props.set(prop.name, { kind: 'unreadable' });
			continue;
		}
		return null;
	}
	if (!singleRootChunk(material.chunks, material.chunkId)) return null;
	return {
		chunkId: material.chunkId,
		props,
		chunks: material.chunks,
		imported: edge.importSource !== undefined,
	};
}

/**
 * The chunks an imported child's own module published for it, or null when that
 * module published none: a component that has to run to produce its content has
 * no arm material, and the caller refuses the flip in author words.
 */
function importedArmMaterial(
	interfaces: ArmImportedInterfaces | undefined,
	edge: SemanticComponentEdge,
): { readonly chunkId: string; readonly chunks: ReadonlyArray<SemanticMarkupChunk> } | null {
	const moduleInterface = edge.importSource ? interfaces?.[edge.importSource] : undefined;
	const component = moduleInterface?.render.components.find(
		(candidate) =>
			candidate.componentName === edge.childComponentName ||
			(edge.importedName !== undefined && candidate.exportName === edge.importedName),
	);
	return component?.armMaterial
		? { chunkId: component.rootChunkId, chunks: component.armMaterial.chunks }
		: null;
}

function singleRootChunk(
	chunks: ReadonlyArray<SemanticMarkupChunk>,
	chunkId: string,
): boolean {
	const chunk = chunks.find((candidate) => candidate.id === chunkId);
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
	interfaces?: ArmImportedInterfaces,
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
			const descent = armChildDescent(renderData, semanticGraph, slot, interfaces);
			// An imported child brings no record of this module's to address: its
			// module publishes arm material only for markup nothing here wired.
			if (!descent || descent.imported) continue;
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
