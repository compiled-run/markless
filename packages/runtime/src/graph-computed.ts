import type {
	RuntimeGraphComputed,
	RuntimeGraphComputedDependencyNode,
	RuntimeGraphRead,
} from './graph.ts';
import { pathsIntersect, readPath } from './graph-core.ts';
import { diffDerivedValue, type WriteTouchedRecord } from './graph-reconcile.ts';
import type { DirtyPath } from './graph-scheduler.ts';
import type { RuntimeAsyncComputedNode } from './graph-async.ts';

export type RuntimeComputedNode = Omit<RuntimeGraphComputed, 'compute'> & {
	readonly compute?: RuntimeGraphComputed['compute'];
	dirty: boolean;
	/**
	 * Set when a dependency invalidated this node, cleared when it recomputes.
	 * A first lazy read of a never-computed node is not an invalidation, so it
	 * reports no changed paths and wakes no subscriber.
	 */
	invalidated: boolean;
	/**
	 * Set when the node was still dirty when a flush ended, so the write-touched
	 * record that its next reconciliation would have needed is already gone.
	 * The next reconciliation reports the whole node instead of trusting
	 * reference identity.
	 */
	baselineStale: boolean;
	value: unknown;
};

/** The per-flush context a reconciled recompute commits into. */
export type ComputedReconcileContext = {
	readonly dirtyPaths: DirtyPath[];
	readonly touched: WriteTouchedRecord;
};

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
			invalidated: false,
			baselineStale: false,
			value: undefined,
		});
	}
	return computedNodes;
}

export function readComputedNode(
	computed: RuntimeComputedNode,
	readGraph: RuntimeGraphRead,
	path: ReadonlyArray<string>,
	reconcile?: ComputedReconcileContext,
): unknown {
	// Dependency-only nodes carry no compute; callers already gate on it.
	const { compute } = computed;
	if (computed.dirty && compute) {
		const previous = computed.value;
		const next = compute(readGraph);
		// Reconcile before the swap so the changed paths describe the move from
		// the committed value to this one, then swap before anything reads it.
		const changed =
			computed.invalidated && reconcile
				? diffDerivedValue({
						previous,
						next,
						keyed: computed.reconcile?.keyed,
						touched: reconcile.touched,
						baselineStale: computed.baselineStale,
					})
				: [];
		computed.value = next;
		computed.dirty = false;
		computed.invalidated = false;
		computed.baselineStale = false;
		// Pushed straight onto the dirty list: dependents were already flagged
		// when the dependency write invalidated this node.
		for (const changedPath of changed) {
			reconcile?.dirtyPaths.push({ graphNodeId: computed.graphNodeId, path: changedPath });
		}
	}

	return readPath(computed.value, path);
}

export function markComputedDirty(input: {
	readonly graphNodeId: string;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly dirtyPaths: DirtyPath[];
	readonly dirtyComputedIds: Set<string>;
	readonly invalidateAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly visited: Set<string>;
}): void {
	if (input.visited.has(input.graphNodeId)) return;
	input.visited.add(input.graphNodeId);

	const computed = input.computedNodes.get(input.graphNodeId);
	if (!computed?.compute) return;
	computed.dirty = true;
	computed.invalidated = true;
	// The changed paths are unknown until the node recomputes, so the flush
	// recomputes subscribed dirty nodes and emits their reconciled paths
	// instead of invalidating the whole node here.
	input.dirtyComputedIds.add(input.graphNodeId);

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
	readonly dirtyComputedIds: Set<string>;
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
