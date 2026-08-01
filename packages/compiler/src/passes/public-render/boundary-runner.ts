import type { SemanticGraphArtifact } from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	runtimeGraphReadPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';

export type BoundaryRunnerRead = {
	readonly source: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export type BoundaryRunnerResolution = {
	readonly authored: BoundaryRunnerRead | null;
	readonly runnerGraphNodeId: string | null;
	readonly reads: ReadonlyArray<BoundaryRunnerRead>;
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
	const boundaryReads = [
		...semanticGraph.templateReads,
		...semanticGraph.keyedRepeats.map((repeat) => ({
			source: repeat.collectionSource,
			asyncBoundaryId: repeat.asyncBoundaryId,
		})),
		...semanticGraph.componentEdges.flatMap((edge) =>
			edge.props.flatMap((prop) =>
				prop.kind === 'graph-reference'
					? [{ source: prop.source, asyncBoundaryId: edge.asyncBoundaryId }]
					: [],
			),
		),
	];

	return new Map(
		semanticGraph.asyncBoundaries.map((boundary) => {
			const reads: BoundaryRunnerRead[] = [];
			const unresolvedSources: string[] = [];
			const seenGraphNodeIds = new Set<string>();
			for (const read of boundaryReads) {
				if (read.asyncBoundaryId !== boundary.id) continue;
				const resolved = resolveGraphPath(read.source, bindings, aliases);
				if (!resolved) {
					unresolvedSources.push(read.source);
					continue;
				}
				if (
					resolved.binding.kind !== 'computed' ||
					resolved.binding.asyncCapable !== true ||
					seenGraphNodeIds.has(resolved.binding.id)
				) {
					continue;
				}
				seenGraphNodeIds.add(resolved.binding.id);
				reads.push({
					source: read.source,
					graphNodeId: resolved.binding.id,
					path: runtimeGraphReadPath(resolved.binding, resolved.path),
				});
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
					unresolvedSources,
				},
			] as const;
		}),
	);
}
