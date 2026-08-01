import type { SemanticGraphArtifact, SemanticGraphBinding } from '../../artifacts.ts';
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
			const seenGraphNodeIds = new Set<string>();
			for (const read of boundaryReads) {
				if (read.asyncBoundaryId !== boundary.id) continue;
				const resolved = resolveGraphPath(read.source, bindings, aliases);
				if (
					!resolved ||
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

			const authored = reads[0] ?? null;
			return [
				boundary.id,
				{
					authored,
					runnerGraphNodeId: authored
						? nearestAsyncRunner(authored.graphNodeId, bindingsById)
						: null,
					reads,
				},
			] as const;
		}),
	);
}

function nearestAsyncRunner(
	graphNodeId: string,
	bindingsById: ReadonlyMap<string, SemanticGraphBinding>,
): string | null {
	let candidates = [graphNodeId];
	const visited = new Set<string>();

	while (candidates.length > 0) {
		const asyncRunners = candidates.filter(
			(id) =>
				bindingsById.get(id)?.kind === 'computed' && bindingsById.get(id)?.async === true,
		);
		if (asyncRunners.length === 1) return asyncRunners[0] ?? null;
		if (asyncRunners.length > 1) return null;

		const next = new Set<string>();
		for (const id of candidates) {
			if (visited.has(id)) continue;
			visited.add(id);
			for (const dependency of bindingsById.get(id)?.dependencies ?? []) {
				const binding = bindingsById.get(dependency.graphNodeId);
				if (binding?.kind === 'computed' && binding.asyncCapable === true)
					next.add(binding.id);
			}
		}
		candidates = [...next];
	}

	return null;
}
