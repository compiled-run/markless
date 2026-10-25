import type { SemanticGraphArtifact } from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	runtimeGraphReadPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';

export const TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX = 'computed:templateExpression:';

export type BoundaryRunnerRead = {
	readonly source: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export type BoundaryRunnerResolution = {
	readonly authored: BoundaryRunnerRead | null;
	readonly runnerGraphNodeId: string | null;
	readonly reads: ReadonlyArray<BoundaryRunnerRead>;
	// Joined template values the settled block reads, computed once its gate settles.
	readonly derivedGraphNodeIds: ReadonlyArray<string>;
	readonly unresolvedSources: ReadonlyArray<string>;
};

// Async boundary runner identity is a semantic-graph fact. Emitters must not
// infer it from payload or protocol lists, which intentionally have different
// ordering after the protocol expands dependency closures.
export function resolveBoundaryRunners(
	semanticGraph: SemanticGraphArtifact,
): ReadonlyMap<string, BoundaryRunnerResolution> {
	const bindings = graphBindingMap(semanticGraph);
	const bindingsById = new Map(
		semanticGraph.graphBindings.map((binding) => [binding.id, binding]),
	);
	const aliases = semanticAliasMap(semanticGraph);
	const boundaryReads: ReadonlyArray<{
		readonly source: string;
		readonly asyncBoundaryId?: string | undefined;
		readonly computedGraphNodeId?: string | undefined;
		// The edge already names the node, so a same-named local elsewhere in the module cannot shadow it.
		readonly graphNodeId?: string;
		readonly path?: ReadonlyArray<string>;
	}> = [
		...semanticGraph.templateReads,
		...semanticGraph.keyedRepeats.map((repeat) => ({
			source: repeat.collectionSource,
			asyncBoundaryId: repeat.asyncBoundaryId,
		})),
		...semanticGraph.componentEdges.flatMap((edge) =>
			edge.props.flatMap((prop) =>
				prop.kind === 'graph-reference'
					? [
							{
								source: prop.source,
								asyncBoundaryId: edge.asyncBoundaryId,
								graphNodeId: prop.graphNodeId,
								path: prop.path,
							},
						]
					: [],
			),
		),
	];

	return new Map(
		semanticGraph.asyncBoundaries.map((boundary) => {
			const reads: BoundaryRunnerRead[] = [];
			const unresolvedSources: string[] = [];
			const seenGraphNodeIds = new Set<string>();
			const derivedGraphNodeIds = new Set<string>();
			for (const read of boundaryReads) {
				if (read.asyncBoundaryId !== boundary.id) continue;
				const composite = read.computedGraphNodeId
					? bindingsById.get(read.computedGraphNodeId)
					: undefined;
				const named = read.graphNodeId ? bindingsById.get(read.graphNodeId) : undefined;
				const resolved = composite
					? { binding: composite, path: [] }
					: named
						? { binding: named, path: read.path ?? [] }
						: resolveGraphPath(read.source, bindings, aliases);
				if (!resolved) {
					unresolvedSources.push(read.source);
					continue;
				}
				if (resolved.binding.kind !== 'computed' || resolved.binding.asyncCapable !== true)
					continue;
				const asyncInputs = (resolved.binding.dependencies ?? []).flatMap((dependency) => {
					const binding = bindingsById.get(dependency.graphNodeId);
					return binding?.kind === 'computed' && binding.asyncCapable === true
						? [{ binding, read: dependency }]
						: [];
				});
				// A template value that also reads state is gated by its async inputs alone, so a
				// write to that state updates it in place instead of settling the block again.
				const derived =
					resolved.binding.id.startsWith(TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX) &&
					asyncInputs.length < (resolved.binding.dependencies ?? []).length;
				if (derived) derivedGraphNodeIds.add(resolved.binding.id);
				const gates = derived
					? asyncInputs
					: [
							{
								binding: resolved.binding,
								read: { source: read.source, path: resolved.path },
							},
						];
				for (const gate of gates) {
					if (seenGraphNodeIds.has(gate.binding.id)) continue;
					seenGraphNodeIds.add(gate.binding.id);
					reads.push({
						source: gate.read.source,
						graphNodeId: gate.binding.id,
						path: runtimeGraphReadPath(gate.binding, gate.read.path),
					});
				}
			}

			// A directly authored sync computed is the boundary's settle node. Its
			// dependency closure may contain several async computeds, but protocol-view
			// already expands that closure for gating; choosing one ancestor here would
			// lose the authored value the settled arm actually reads.
			const authoredSyncGates = reads.filter(
				(read) => bindingsById.get(read.graphNodeId)?.async !== true,
			);
			const authored =
				authoredSyncGates.length === 1
					? (authoredSyncGates[0] ?? null)
					: reads.length === 1
						? (reads[0] ?? null)
						: null;
			return [
				boundary.id,
				{
					authored,
					runnerGraphNodeId: authored?.graphNodeId ?? null,
					reads,
					derivedGraphNodeIds: [...derivedGraphNodeIds],
					unresolvedSources,
				},
			] as const;
		}),
	);
}
