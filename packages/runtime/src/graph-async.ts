import type {
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from './graph.ts';
import { readPath } from './graph-core.ts';

export type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	controller?: AbortController;
	demanded: boolean;
	keyValue: unknown;
	pendingSnapshotNeedsRunner: boolean;
	snapshot: RuntimeGraphAsyncSnapshot;
	version: number;
};

const ASYNC_SNAPSHOT_META_KEYS = new Set(['status', 'version', 'key', 'error', 'value']);

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
			demanded: initialSnapshot.status !== 'idle',
			keyValue: 'key' in initialSnapshot ? initialSnapshot.key : undefined,
			pendingSnapshotNeedsRunner: initialSnapshot.status === 'pending',
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
	const [head, ...rest] = path;
	if (head === undefined || ASYNC_SNAPSHOT_META_KEYS.has(head)) {
		return readPath(node.snapshot, path);
	}
	const snapshot = node.snapshot as { readonly value?: unknown };
	return readPath(snapshot.value, [head, ...rest]);
}

export function demandAsyncComputed(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	if (input.node.pendingSnapshotNeedsRunner) {
		input.node.pendingSnapshotNeedsRunner = false;
		input.node.demanded = true;
		startAsyncComputed({ ...input, key: input.node.key(input.readGraph) });
		return;
	}

	if (input.node.snapshot.status !== 'idle') return;

	input.node.demanded = true;
	startAsyncComputed({ ...input, key: input.node.key(input.readGraph) });
}

export function invalidateAsyncComputed(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	if (!input.node.demanded) return;

	const nextKey = input.node.key(input.readGraph);
	if (input.node.snapshot.status !== 'idle' && Object.is(input.node.keyValue, nextKey)) return;

	startAsyncComputed({ ...input, key: nextKey });
}

function startAsyncComputed(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly key: unknown;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	input.node.controller?.abort();
	input.node.pendingSnapshotNeedsRunner = false;

	const controller = new AbortController();
	const version = input.node.version + 1;
	input.node.controller = controller;
	input.node.keyValue = input.key;
	input.node.version = version;
	input.node.snapshot = { status: 'pending', version, key: input.key };

	const commitFulfilled = (value: unknown): void => {
		if (input.node.version !== version || controller.signal.aborted) return;

		input.node.snapshot = { status: 'fulfilled', version, key: input.key, value };
		input.markDirtyPath(input.node.graphNodeId, []);
		input.scheduleFlush();
	};
	const commitRejected = (error: unknown): void => {
		if (input.node.version !== version || controller.signal.aborted) return;

		input.node.snapshot = { status: 'rejected', version, key: input.key, error };
		input.markDirtyPath(input.node.graphNodeId, []);
		input.scheduleFlush();
	};

	try {
		Promise.resolve(
			input.node.run({ key: input.key, signal: controller.signal, read: input.readGraph }),
		).then(commitFulfilled, commitRejected);
	} catch (error) {
		commitRejected(error);
	}

	input.markDirtyPath(input.node.graphNodeId, []);
	input.scheduleFlush();
}
