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

export function markComputedDirty(input: {
	readonly graphNodeId: string;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly dirtyPaths: DirtyPath[];
	readonly reconcile?: { readonly invalidateComputed: ReconcileInvalidate };
	readonly invalidateAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly visited: Set<string>;
}): void {
	if (input.visited.has(input.graphNodeId)) return;
	input.visited.add(input.graphNodeId);

	const computed = input.computedNodes.get(input.graphNodeId);
	if (!computed?.compute) return;
	computed.dirty = true;
	// With a plane installed the changed paths are unknown until the node
	// recomputes, so the plane defers the invalidation rather than dirtying the
	// whole node here.
	if (input.reconcile) input.reconcile.invalidateComputed(computed);
	else input.dirtyPaths.push({ graphNodeId: input.graphNodeId, path: [] });

	for (const dependent of input.computedNodes.values()) {
		const dirty = dependent.dependencies.some(
			(dependency) => dependency.graphNodeId === input.graphNodeId,
		);
		if (dirty && dependent.compute) {
			markComputedDirty({
				...input,
				graphNodeId: dependent.graphNodeId,
			});
		}
	}

	for (const dependent of input.asyncComputedNodes.values()) {
		const dirty = dependent.dependencies.some(
			(dependency) => dependency.graphNodeId === input.graphNodeId,
		);
		if (dirty) input.invalidateAsyncComputed(dependent);
	}
}

export function markDirtyComputedDependencies(input: {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly dirtyPaths: DirtyPath[];
	readonly reconcile?: { readonly invalidateComputed: ReconcileInvalidate };
	readonly invalidateAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
}): void {
	for (const computed of input.computedNodes.values()) {
		const dirty = computed.dependencies.some(
			(dependency) =>
				dependency.graphNodeId === input.graphNodeId &&
				pathsIntersect(input.path, dependency.path ?? []),
		);
		if (dirty && computed.compute) {
			markComputedDirty({
				...input,
				graphNodeId: computed.graphNodeId,
				visited: new Set(),
			});
		}
	}

	for (const asyncComputed of input.asyncComputedNodes.values()) {
		const dirty = asyncComputed.dependencies.some(
			(dependency) =>
				dependency.graphNodeId === input.graphNodeId &&
				pathsIntersect(input.path, dependency.path ?? []),
		);
		if (dirty) input.invalidateAsyncComputed(asyncComputed);
	}
}
