import type {
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from './graph.ts';
import { readPath } from './graph-core.ts';
import type { RuntimeComputedNode } from './graph-computed.ts';

export type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	controller?: AbortController;
	gate: number;
	snapshot: RuntimeGraphAsyncSnapshot;
	version: number;
};

export const ASYNC_SNAPSHOT_META_KEYS = new Set(['status', 'version', 'key', 'error', 'value']);

/**
 * The async half of the derived-reconcile plane, when one is installed. Without
 * it a snapshot commit dirties the whole node.
 */
type AsyncReconcile = {
	readonly reconcile?: {
		readonly publishAsync: (
			node: RuntimeAsyncComputedNode,
			previous: RuntimeGraphAsyncSnapshot,
		) => void;
	};
};

export function createRuntimeAsyncComputedNodes(
	asyncComputedInput: ReadonlyArray<RuntimeGraphAsyncComputed> | undefined,
): Map<string, RuntimeAsyncComputedNode> {
	const asyncComputedNodes = new Map<string, RuntimeAsyncComputedNode>();
	for (const asyncComputed of asyncComputedInput ?? []) {
		const initialSnapshot: RuntimeGraphAsyncSnapshot = asyncComputed.initialSnapshot ?? {
			status: 'idle',
			version: 0,
		};
		asyncComputedNodes.set(asyncComputed.graphNodeId, {
			...asyncComputed,
			gate: initialSnapshot.status === 'pending' ? 1 : 0,
			snapshot: initialSnapshot,
			version: initialSnapshot.version,
		});
	}
	return asyncComputedNodes;
}

export function readAsyncComputedNode(
	node: RuntimeAsyncComputedNode,
	path: ReadonlyArray<string>,
	demand: () => void,
): unknown {
	demand();
	const head = path[0];
	if (head === undefined || ASYNC_SNAPSHOT_META_KEYS.has(head)) {
		return readPath(node.snapshot, path);
	}
	return readPath((node.snapshot as { readonly value?: unknown }).value, path);
}

export function demandAsyncComputed(input: AsyncReconcile & {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	// A payload-planned pending snapshot still needs its runner started on
	// first demand; otherwise only idle computeds start (startAsyncComputed
	// clears the needs-runner flag itself).
	if (input.node.gate !== 1 && input.node.snapshot.status !== 'idle') return;

	advanceAsyncComputed(input);
}

export function invalidateAsyncComputed(input: AsyncReconcile & {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	if (input.node.snapshot.status === 'idle') return;

	advanceAsyncComputed(input);
}

function advanceAsyncComputed(input: AsyncReconcile & {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	// Sync computeds have no settlement state, so walk through them until the
	// gate reaches the async nodes whose snapshots can block this runner.
	const visited = new Set<string>([input.node.graphNodeId]);
	let blocked: RuntimeAsyncComputedNode | undefined;
	const visit = (graphNodeId: string): void => {
		if (visited.has(graphNodeId)) return;
		visited.add(graphNodeId);
		const dependency = input.asyncComputedNodes.get(graphNodeId);
		if (dependency) {
			if (dependency.snapshot.status === 'idle' || dependency.snapshot.status === 'pending') {
				blocked = dependency;
				input.demandAsyncComputed(dependency);
			} else if (!blocked && dependency.snapshot.status === 'rejected') blocked = dependency;
			return;
		}
		for (const dependency of input.computedNodes.get(graphNodeId)?.dependencies ?? [])
			visit(dependency.graphNodeId);
	};
	for (const dependency of input.node.dependencies) visit(dependency.graphNodeId);
	if (blocked) {
		commitDependencyBlock(
			input,
			blocked.snapshot.status === 'rejected' ? 'rejected' : 'pending',
			(blocked.snapshot as { readonly error?: unknown }).error,
		);
		return;
	}

	const nextKey = input.node.key(input.readGraph);
	if (
		!input.node.gate &&
		input.node.snapshot.status !== 'idle' &&
		Object.is((input.node.snapshot as { readonly key?: unknown }).key, nextKey)
	) {
		return;
	}

	startAsyncComputed({ ...input, key: nextKey });
}

function commitDependencyBlock(
	input: AsyncReconcile & {
		readonly node: RuntimeAsyncComputedNode;
		readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
		readonly scheduleFlush: () => void;
	},
	status: 'pending' | 'rejected',
	error: unknown,
): void {
	if (
		input.node.gate === 2 &&
		(status === 'pending' ||
			(input.node.snapshot.status === 'rejected' &&
				Object.is(input.node.snapshot.error, error)))
	) {
		return;
	}

	input.node.controller?.abort();
	input.node.controller = undefined;
	input.node.gate = 2;
	const version = ++input.node.version;
	const key = (input.node.snapshot as { readonly key?: unknown }).key;
	publish(
		input,
		status === 'pending'
			? {
					status,
					version,
					key,
					value: (input.node.snapshot as { readonly value?: unknown }).value,
				}
			: {
					status,
					version,
					key,
					error,
				},
	);
}

function startAsyncComputed(input: AsyncReconcile & {
	readonly node: RuntimeAsyncComputedNode;
	readonly key: unknown;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	input.node.controller?.abort();
	input.node.gate = 0;

	const controller = new AbortController();
	const version = ++input.node.version;
	input.node.controller = controller;
	// A re-run keeps the prior settled value addressable while pending (spec
	// D8 / Solid 2 `latest`): reads through the computed answer with it until
	// the new snapshot commits. Consecutive re-runs carry it forward; a first
	// run or a rejected prior carries undefined (reads answer undefined). The
	// literal reads the prior snapshot before the assignment replaces it.
	publish(input, {
		status: 'pending',
		version,
		key: input.key,
		value: (input.node.snapshot as { readonly value?: unknown }).value,
	});

	const commit = (snapshot: RuntimeGraphAsyncSnapshot): void => {
		if (input.node.version !== version) return;

		publish(input, snapshot);
	};
	const commitRejected = (error: unknown): void =>
		commit({ status: 'rejected', version, key: input.key, error });

	try {
		Promise.resolve(
			input.node.run({ key: input.key, signal: controller.signal, read: input.readGraph }),
		).then(
			(value) => commit({ status: 'fulfilled', version, key: input.key, value }),
			commitRejected,
		);
	} catch (error) {
		commitRejected(error);
	}
}

function publish(
	input: AsyncReconcile & {
		readonly node: RuntimeAsyncComputedNode;
		readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
		readonly scheduleFlush: () => void;
	},
	snapshot: RuntimeGraphAsyncSnapshot,
): void {
	const previous = input.node.snapshot;
	input.node.snapshot = snapshot;
	if (input.reconcile) input.reconcile.publishAsync(input.node, previous);
	else input.markDirtyPath(input.node.graphNodeId, []);
	input.scheduleFlush();
}
