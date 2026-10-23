import type {
	RuntimeGraphComputed,
	RuntimeGraphComputedDependencyNode,
	RuntimeGraphRead,
} from './graph.ts';
import { pathsIntersect, readPath } from './graph-core.ts';
import type { DirtyPath } from './graph-scheduler.ts';
import type { RuntimeAsyncComputedNode } from './graph-async.ts';

export type RuntimeComputedNode = Omit<RuntimeGraphComputed, 'compute'> & {
	readonly compute?: RuntimeGraphComputed['compute'];
	dirty: boolean;
	value: unknown;
};

/**
 * Told about a node that has just recomputed, together with the value it
 * published before. Supplied only when a derived-reconcile plane is installed;
 * see `graph-reconcile.ts`.
 */
type ReconcileComputed = (computed: RuntimeComputedNode, previous: unknown) => void;

/** Told about a node a dependency write just invalidated. */
type ReconcileInvalidate = (computed: RuntimeComputedNode) => void;

export function createRuntimeComputedNodes(
	computedInput:
		| ReadonlyArray<RuntimeGraphComputed | RuntimeGraphComputedDependencyNode>
		| undefined,
): Map<string, RuntimeComputedNode> {
	const computedNodes = new Map<string, RuntimeComputedNode>();
	for (const computed of computedInput ?? []) {
		computedNodes.set(computed.graphNodeId, {
			...computed,
			dirty: true,
			value: undefined,
		});
	}
	return computedNodes;
}

export function readComputedNode(
	computed: RuntimeComputedNode,
	readGraph: RuntimeGraphRead,
	path: ReadonlyArray<string>,
	reconcile?: ReconcileComputed,
): unknown {
	// Dependency-only nodes carry no compute; callers already gate on it.
	const { compute } = computed;
	if (computed.dirty && compute) {
		const previous = computed.value;
		computed.value = compute(readGraph);
		computed.dirty = false;
		// A plane, when installed, narrows the invalidation to the paths that
		// moved; without one the whole node was already dirtied.
		reconcile?.(computed, previous);
	}

	return readPath(computed.value, path);
}

type Dependent = readonly [
	node: RuntimeComputedNode | RuntimeAsyncComputedNode,
	path: ReadonlyArray<string>,
	isAsync: boolean,
];

/** Per source node, every computed then every async computed that reads it. */
export type RuntimeDependents = ReadonlyMap<string, ReadonlyArray<Dependent>>;

export function indexRuntimeDependents(
	computedNodes: ReadonlyMap<string, RuntimeComputedNode>,
	asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>,
): RuntimeDependents {
	const index = new Map<string, Dependent[]>();
	const add = (node: RuntimeComputedNode | RuntimeAsyncComputedNode, isAsync: boolean) => {
		for (const dependency of node.dependencies) {
			let readers = index.get(dependency.graphNodeId);
			if (!readers) index.set(dependency.graphNodeId, (readers = []));
			readers.push([node, dependency.path ?? [], isAsync]);
		}
	};
	for (const computed of computedNodes.values()) if (computed.compute) add(computed, false);
	for (const asyncComputed of asyncComputedNodes.values()) add(asyncComputed, true);
	return index;
}

export function markDirtyComputedDependencies(
	graphNodeId: string,
	path: ReadonlyArray<string>,
	dependents: RuntimeDependents,
	dirtyPaths: DirtyPath[],
	reconcile: { readonly invalidateComputed: ReconcileInvalidate } | undefined,
	invalidateAsyncComputed: (node: RuntimeAsyncComputedNode) => void,
): void {
	const visited = new Set<RuntimeComputedNode>();
	const invalidated = new Set<RuntimeAsyncComputedNode>();
	const mark = (sourceId: string, sourcePath?: ReadonlyArray<string>): void => {
		for (const [node, dependencyPath, isAsync] of dependents.get(sourceId) ?? []) {
			if (sourcePath && !pathsIntersect(sourcePath, dependencyPath)) continue;
			if (isAsync) invalidated.add(node as RuntimeAsyncComputedNode);
			else if (!visited.has(node as RuntimeComputedNode)) {
				const computed = node as RuntimeComputedNode;
				visited.add(computed);
				computed.dirty = true;
				// With a plane the changed paths are unknown until the node recomputes.
				if (reconcile) reconcile.invalidateComputed(computed);
				else dirtyPaths.push({ graphNodeId: computed.graphNodeId, path: [] });
				mark(computed.graphNodeId);
			}
		}
	};
	mark(graphNodeId, path);
	// After every computed is marked, so no runner reads a stale key.
	for (const asyncComputed of invalidated) invalidateAsyncComputed(asyncComputed);
}
