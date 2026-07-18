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
	computed: RuntimeComputedNode & { readonly compute: RuntimeGraphComputed['compute'] },
	readGraph: RuntimeGraphRead,
	path: ReadonlyArray<string>,
): unknown {
	if (computed.dirty) {
		computed.value = computed.compute(readGraph);
		computed.dirty = false;
	}

	return readPath(computed.value, path);
}

export function markComputedDirty(input: {
	readonly graphNodeId: string;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly dirtyPaths: DirtyPath[];
	readonly invalidateAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly visited: Set<string>;
}): void {
	if (input.visited.has(input.graphNodeId)) return;
	input.visited.add(input.graphNodeId);

	const computed = input.computedNodes.get(input.graphNodeId);
	if (!computed?.compute) return;
	computed.dirty = true;

	input.dirtyPaths.push({ graphNodeId: input.graphNodeId, path: [] });

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
