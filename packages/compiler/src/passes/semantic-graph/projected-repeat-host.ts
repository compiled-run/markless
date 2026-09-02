import type {
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceProjection,
	SemanticBranchSite,
	SemanticComponentEdge,
	SemanticGraphArtifact,
	SemanticGraphDiagnostic,
	SemanticKeyedRepeat,
	SemanticMarkupChunk,
} from '../../artifacts.ts';
import { isRepeatChunkId } from './collect-markup.ts';
import { projectedRepeatHoleRepeatedDiagnostic } from './diagnostics.ts';
import { projectionPlacementFields } from './projection-placement.ts';

/** Retarget a projected `@for` to the child element that renders its rows. */
export function retargetProjectedRepeatHosts(input: {
	readonly graph: SemanticGraphArtifact;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): void {
	const repeats = input.graph.keyedRepeats as SemanticKeyedRepeat[];
	const diagnostics = input.graph.diagnostics as SemanticGraphDiagnostic[];
	for (let index = 0; index < repeats.length; index++) {
		const repeat = repeats[index]!;
		const placement = projectedRepeatPlacement(input, repeat.id);
		if (!placement) continue;
		if (placement.kind === 'repeated-hole') {
			diagnostics.push(
				projectedRepeatHoleRepeatedDiagnostic({
					childComponentName: placement.childComponentName,
					collectionSource: repeat.collectionSource,
					span: placement.span,
				}),
			);
			continue;
		}
		repeats[index] = {
			...repeat,
			parentHostNodeId: placement.parentHostNodeId,
			...(repeat.parentHostNodeId ? { ownerHostNodeId: repeat.parentHostNodeId } : {}),
			...(placement.elementsBefore > 0
				? { projectedElementsBefore: placement.elementsBefore }
				: {}),
		};
	}
	for (let index = repeats.length - 1; index >= 0; index--)
		if (repeats[index]!.parentHostNodeId === '') repeats.splice(index, 1);
}

type ProjectedRepeatPlacement =
	| {
			readonly kind: 'element';
			readonly parentHostNodeId: string;
			readonly elementsBefore: number;
	  }
	| {
			readonly kind: 'repeated-hole';
			readonly childComponentName: string;
			readonly span: SemanticComponentEdge['sourceSpan'];
	  };

function projectedRepeatPlacement(
	input: {
		readonly graph: SemanticGraphArtifact;
		readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	},
	repeatId: string,
): ProjectedRepeatPlacement | undefined {
	const chunks = input.graph.markup.chunks;
	const owner = chunks.find((chunk) =>
		chunk.slots.some((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId),
	);
	if (owner?.kind !== 'component-projection') return undefined;
	const anchor = owner.slots.find((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId);
	// A repeat under the projection's own element already names its parent.
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
	if (projection?.projectionChunkId && isRepeatChunkId(projection.projectionChunkId))
		return {
			kind: 'repeated-hole',
			childComponentName: edge.childComponentName,
			span: edge.sourceSpan,
		};
	if (!projection?.parentHostNodeId) return undefined;
	// A render-dependent prefix cannot provide a safe row offset.
	if (projection.elementsBeforeProjection === 'unknown') return undefined;
	return {
		kind: 'element',
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

// Imported and local children expose the same projection placement fact.
function childProjection(
	input: {
		readonly graph: SemanticGraphArtifact;
		readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
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
