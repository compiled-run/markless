import { PROTOCOL_PROP_GRAPH_NODE_PREFIX, PROTOCOL_PROPS_GRAPH_NODE_ID } from '@markless/serializer';
import type { SemanticGraphArtifact } from '../artifacts.ts';

/** The props a graph value is computed from, `[]` for a constant, or null when state or anything else can move it. */
export function propsDeciding(
	graphNodeId: string,
	path: ReadonlyArray<string>,
	graph: Pick<SemanticGraphArtifact, 'graphBindings'>,
	seen = new Set<string>(),
): ReadonlyArray<string> | null {
	if (graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID) return path[0] === undefined ? null : [path[0]];
	if (graphNodeId.startsWith(PROTOCOL_PROP_GRAPH_NODE_PREFIX))
		return [graphNodeId.slice(PROTOCOL_PROP_GRAPH_NODE_PREFIX.length)];
	if (seen.has(graphNodeId)) return null;
	seen.add(graphNodeId);
	const binding = graph.graphBindings.find((candidate) => candidate.id === graphNodeId);
	if (binding?.kind !== 'computed' || binding.async) return null;
	const props = new Set<string>();
	for (const dependency of binding.dependencies ?? []) {
		const deciding = propsDeciding(dependency.graphNodeId, dependency.path, graph, seen);
		if (!deciding) return null;
		for (const prop of deciding) props.add(prop);
	}
	return [...props];
}

type Repeat = SemanticGraphArtifact['keyedRepeats'][number];
type RowGraph = Pick<SemanticGraphArtifact, 'graphBindings' | 'keyedRepeats'>;

/** The props a repeat's rows, and the rows enclosing them, are computed from; [] when constant, null when state can change them. */
export function rowsDecidedBy(repeat: Repeat, graph: RowGraph): ReadonlyArray<string> | null {
	const enclosing = repeat.enclosingRepeatId
		? graph.keyedRepeats.find((candidate) => candidate.id === repeat.enclosingRepeatId)
		: undefined;
	// A list with no graph node is never read again after load, so its rows never change.
	const own = repeat.collectionGraphNodeId
		? propsDeciding(repeat.collectionGraphNodeId, repeat.collectionPath, graph)
		: [];
	return enclosing ? joinDeciders(own, rowsDecidedBy(enclosing, graph)) : own;
}

export function joinDeciders(
	left: ReadonlyArray<string> | null,
	right: ReadonlyArray<string> | null,
): ReadonlyArray<string> | null {
	return left && right ? [...new Set([...left, ...right])] : null;
}
