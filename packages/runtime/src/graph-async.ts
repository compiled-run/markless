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
	const head = path[0];
	if (head === undefined || ASYNC_SNAPSHOT_META_KEYS.has(head)) {
		return readPath(node.snapshot, path);
	}
	return readPath((node.snapshot as { readonly value?: unknown }).value, path);
}

export function demandAsyncComputed(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	// A payload-planned pending snapshot still needs its runner started on
	// first demand; otherwise only idle computeds start (startAsyncComputed
	// clears the needs-runner flag itself).
	if (!input.node.pendingSnapshotNeedsRunner && input.node.snapshot.status !== 'idle') return;

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
	// A re-run keeps the prior settled value addressable while pending (spec
	// D8 / Solid 2 `latest`): reads through the computed answer with it until
	// the new snapshot commits. Consecutive re-runs carry it forward; a first
	// run or a rejected prior carries undefined (reads answer undefined). The
	// literal reads the prior snapshot before the assignment replaces it.
	input.node.snapshot = {
		status: 'pending',
		version,
		key: input.key,
		value: (input.node.snapshot as { readonly value?: unknown }).value,
	};

	const commit = (snapshot: RuntimeGraphAsyncSnapshot): void => {
		if (input.node.version !== version || controller.signal.aborted) return;

		input.node.snapshot = snapshot;
		input.markDirtyPath(input.node.graphNodeId, []);
		input.scheduleFlush();
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

	input.markDirtyPath(input.node.graphNodeId, []);
	input.scheduleFlush();
}
