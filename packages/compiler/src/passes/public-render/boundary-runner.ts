import type { SemanticGraphArtifact, SemanticGraphBinding } from '../../artifacts.ts';
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

export const ASYNC_GATE_GRAPH_NODE_PREFIX = 'computed:asyncGate:';

type BoundaryGateReads = {
	readonly reads: ReadonlyArray<BoundaryRunnerRead>;
	readonly derivedGraphNodeIds: ReadonlyArray<string>;
	readonly unresolvedSources: ReadonlyArray<string>;
};

// Async boundary runner identity is a semantic-graph fact. Emitters must not
// infer it from payload or protocol lists, which intentionally have different
// ordering after the protocol expands dependency closures.
export function resolveBoundaryRunners(
	semanticGraph: SemanticGraphArtifact,
): ReadonlyMap<string, BoundaryRunnerResolution> {
	const bindingsById = new Map(
		semanticGraph.graphBindings.map((binding) => [binding.id, binding]),
	);
	const gateReads = collectBoundaryGateReads(semanticGraph);
	return new Map(
		semanticGraph.asyncBoundaries.map((boundary) => {
			const { reads, derivedGraphNodeIds, unresolvedSources } = gateReads.get(boundary.id)!;
			const joined = boundary.gateGraphNodeId
				? bindingsById.get(boundary.gateGraphNodeId)
				: undefined;
			const authored: BoundaryRunnerRead | null = joined
				? { source: joined.name, graphNodeId: joined.id, path: [] }
				: (coveringGateRead(reads, bindingsById) ?? null);
			return [
				boundary.id,
				{
					authored,
					runnerGraphNodeId: authored?.graphNodeId ?? null,
					reads,
					derivedGraphNodeIds,
					unresolvedSources,
				},
			] as const;
		}),
	);
}

/**
 * A @try whose settled content reads several async values, directly or through
 * sync computeds, settles on one minted sync computed over all of them, so
 * every reader of the boundary gates on the complete async closure.
 */
export function mintAsyncBoundaryGates(
	semanticGraph: Omit<SemanticGraphArtifact, 'graphBindings' | 'asyncBoundaries'> & {
		graphBindings: SemanticGraphBinding[];
		asyncBoundaries: Array<SemanticGraphArtifact['asyncBoundaries'][number]>;
	},
): void {
	const bindingsById = new Map(
		semanticGraph.graphBindings.map((binding) => [binding.id, binding]),
	);
	const gateReads = collectBoundaryGateReads(semanticGraph);
	semanticGraph.asyncBoundaries = semanticGraph.asyncBoundaries.map((boundary) => {
		const { reads } = gateReads.get(boundary.id)!;
		if (reads.length < 2 || coveringGateRead(reads, bindingsById)) return boundary;
		const gates = reads.flatMap((read) => {
			const binding = bindingsById.get(read.graphNodeId);
			return binding ? [binding] : [];
		});
		const index = boundary.id.slice(boundary.id.lastIndexOf(':') + 1);
		const graphNodeId = `${ASYNC_GATE_GRAPH_NODE_PREFIX}${index}`;
		const componentName = gates.find((gate) => gate.componentName)?.componentName;
		semanticGraph.graphBindings.push({
			id: graphNodeId,
			name: `marklessAsyncGate${index}`,
			kind: 'computed',
			writable: false,
			async: false,
			asyncCapable: true,
			functionSource: `() => [${gates.map((gate) => gate.name).join(', ')}]`,
			dependencies: gates.map((gate) => ({
				source: gate.name,
				graphNodeId: gate.id,
				path: [],
			})),
			...(componentName ? { componentName } : {}),
		});
		return { ...boundary, gateGraphNodeId: graphNodeId };
	});
}

// One read settles the boundary alone when every other read is in its dependency closure.
function coveringGateRead(
	reads: ReadonlyArray<BoundaryRunnerRead>,
	bindingsById: ReadonlyMap<string, SemanticGraphBinding>,
): BoundaryRunnerRead | undefined {
	return reads.find((candidate) => {
		const closure = new Set<string>();
		const visit = (graphNodeId: string): void => {
			for (const dependency of bindingsById.get(graphNodeId)?.dependencies ?? []) {
				if (closure.has(dependency.graphNodeId)) continue;
				closure.add(dependency.graphNodeId);
				visit(dependency.graphNodeId);
			}
		};
		visit(candidate.graphNodeId);
		return reads.every(
			(read) => read === candidate || closure.has(read.graphNodeId),
		);
	});
}

function collectBoundaryGateReads(
	semanticGraph: SemanticGraphArtifact,
): ReadonlyMap<string, BoundaryGateReads> {
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

			return [
				boundary.id,
				{ reads, derivedGraphNodeIds: [...derivedGraphNodeIds], unresolvedSources },
			] as const;
		}),
	);
}

// The names a component's `@catch (name)` arms bind the rejection to; `error` stays bound as before.
export function componentCatchErrorNames(
	semanticGraph: SemanticGraphArtifact,
	componentName: string,
): ReadonlyArray<string> {
	return [
		...new Set([
			'error',
			...semanticGraph.asyncBoundaries.flatMap((boundary) =>
				boundary.componentName === componentName && boundary.errorName ? [boundary.errorName] : [],
			),
		]),
	];
}
