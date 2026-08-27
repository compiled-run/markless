import type {
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceProjection,
	SemanticBranchSite,
	SemanticComponentEdge,
	SemanticGraphArtifact,
	SemanticKeyedRepeat,
	SemanticMarkupChunk,
} from '../../artifacts.ts';
import { projectionPlacementFields } from './projection-placement.ts';

/**
 * Point a `@for` written inside a child's `{children}` at the element that child
 * wraps the hole in.
 *
 * The repeat's parent host is read off the markup the AUTHOR wrote, which is the
 * enclosing element of the `<Child>` tag, not of the rows. The child splices the
 * projection inside its own markup, so the rows the server paints and the rows a
 * client mints both belong to an element this module never wrote - and resume
 * looked the wrong one up, found no served row to key, and grew the list beside
 * the child instead of into it.
 *
 * The child publishes that element on its interface; the page-space spelling is
 * the child edge's own `c<n>:` prefix in front of it, the same prefix every
 * other record of that child takes. Retargeting needs BOTH that host and a
 * defended count of the elements the child renders in front of the hole, so a
 * projection whose interface leaves either unknown keeps the host it had.
 */
export function retargetProjectedRepeatHosts(input: {
	readonly graph: SemanticGraphArtifact;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): void {
	const repeats = input.graph.keyedRepeats as SemanticKeyedRepeat[];
	for (let index = 0; index < repeats.length; index++) {
		const repeat = repeats[index]!;
		const placement = projectedRepeatPlacement(input, repeat.id);
		if (!placement) continue;
		repeats[index] = {
			...repeat,
			parentHostNodeId: placement.parentHostNodeId,
			ownerHostNodeId: repeat.parentHostNodeId,
			...(placement.elementsBefore > 0
				? { projectedElementsBefore: placement.elementsBefore }
				: {}),
		};
	}
}

function projectedRepeatPlacement(
	input: {
		readonly graph: SemanticGraphArtifact;
		readonly importedModuleInterfaces?: Readonly<
			Record<string, ModuleGraphInterfaceArtifact>
		>;
	},
	repeatId: string,
): { readonly parentHostNodeId: string; readonly elementsBefore: number } | undefined {
	const chunks = input.graph.markup.chunks;
	const owner = chunks.find((chunk) =>
		chunk.slots.some((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId),
	);
	if (owner?.kind !== 'component-projection') return undefined;
	const anchor = owner.slots.find((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId);
	// A repeat under an element the author wrote inside the projection already
	// names that element; only one sitting at the projection's own root is homeless.
	if (anchor?.coordinate.kind !== 'comment-anchor' || anchor.coordinate.path.length !== 1)
		return undefined;

	const site = projectionSlotFor(chunks, owner.id);
	if (!site) return undefined;
	const edges = input.graph.componentEdges.filter(
		(edge) => edge.parentComponentName === owner.componentName,
	);
	const edgeIndex = edges.findIndex((edge) => edge.id === site.componentEdgeId);
	const edge = edges[edgeIndex];
	if (!edge) return undefined;

	const projection = childProjection(input, edge);
	if (!projection?.parentHostNodeId || projection.projectionInsideConstruct) return undefined;
	// The hole's own place inside that element decides where the rows begin, and a
	// side render time settles cannot be counted from here.
	if (projection.elementsBeforeProjection === 'unknown') return undefined;
	return {
		parentHostNodeId: `c${edgeIndex}:${projection.parentHostNodeId}`,
		elementsBefore: projection.elementsBeforeProjection,
	};
}

function projectionSlotFor(
	chunks: ReadonlyArray<SemanticMarkupChunk>,
	projectionChunkId: string,
): { readonly componentEdgeId: string } | undefined {
	for (const chunk of chunks)
		for (const slot of chunk.slots)
			if (slot.kind === 'child-component' && slot.projectionChunkId === projectionChunkId)
				return { componentEdgeId: slot.componentEdgeId };
	return undefined;
}

// A child behind an import answers from the interface its own module published;
// a child declared here answers from this module's chunks, through the one
// function that computes the fact either way.
function childProjection(
	input: {
		readonly graph: SemanticGraphArtifact;
		readonly importedModuleInterfaces?: Readonly<
			Record<string, ModuleGraphInterfaceArtifact>
		>;
	},
	edge: SemanticComponentEdge,
): ModuleGraphInterfaceProjection | undefined {
	if (edge.importSource !== undefined)
		return input.importedModuleInterfaces?.[edge.importSource]?.render.components.find(
			(candidate) => candidate.componentName === edge.childComponentName,
		)?.projection;
	const rootChunkId = `template:${edge.childComponentName}`;
	if (!input.graph.markup.chunks.some((chunk) => chunk.id === rootChunkId)) return undefined;
	return projectionPlacementFields({
		chunks: input.graph.markup.chunks,
		branchSites: input.graph.branchSites as ReadonlyArray<SemanticBranchSite>,
		componentName: edge.childComponentName,
		rootChunkId,
	}).projection;
}
