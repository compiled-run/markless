import type {
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from './graph.ts';
import { readPath } from './graph-core.ts';
import type { RuntimeComputedNode } from './graph-computed.ts';

export type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	blockedByDependency?: 'pending' | 'rejected';
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
	if (!input.node.pendingSnapshotNeedsRunner && input.node.snapshot.status !== 'idle') return;

	input.node.demanded = true;
	advanceAsyncComputed(input);
}

export function invalidateAsyncComputed(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	if (!input.node.demanded) return;

	advanceAsyncComputed(input);
}

function advanceAsyncComputed(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	const dependencyGate = gateAsyncComputedDependencies(input);
	if (dependencyGate.status === 'pending') {
		commitDependencyPending(input);
		return;
	}
	if (dependencyGate.status === 'rejected') {
		commitDependencyRejected(input, dependencyGate.error);
		return;
	}

	const nextKey = input.node.key(input.readGraph);
	if (
		input.node.blockedByDependency === undefined &&
		!input.node.pendingSnapshotNeedsRunner &&
		input.node.snapshot.status !== 'idle' &&
		Object.is(input.node.keyValue, nextKey)
	) {
		return;
	}

	startAsyncComputed({ ...input, key: nextKey });
}

function gateAsyncComputedDependencies(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
}):
	| { readonly status: 'ready' }
	| { readonly status: 'pending' }
	| { readonly status: 'rejected'; readonly error: unknown } {
	const asyncDependencies = collectAsyncComputedDependencies(input);
	const unsettled = asyncDependencies.filter(
		(dependency) =>
			dependency.snapshot.status === 'idle' || dependency.snapshot.status === 'pending',
	);

	// Start every missing upstream before publishing the downstream pending
	// result. Their existing commit -> dirty -> invalidate cascade retries this
	// key phase after they settle.
	for (const dependency of unsettled) input.demandAsyncComputed(dependency);
	if (unsettled.length > 0) return { status: 'pending' };

	const rejected = asyncDependencies.find(
		(dependency) => dependency.snapshot.status === 'rejected',
	);
	return rejected?.snapshot.status === 'rejected'
		? { status: 'rejected', error: rejected.snapshot.error }
		: { status: 'ready' };
}

function collectAsyncComputedDependencies(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
}): RuntimeAsyncComputedNode[] {
	// Sync computeds have no settlement state, so walk through them until the
	// gate reaches the async nodes whose snapshots can block this runner.
	const asyncDependencies: RuntimeAsyncComputedNode[] = [];
	const visited = new Set<string>([input.node.graphNodeId]);

	const visit = (graphNodeId: string): void => {
		if (visited.has(graphNodeId)) return;
		visited.add(graphNodeId);

		const asyncComputed = input.asyncComputedNodes.get(graphNodeId);
		if (asyncComputed) {
			asyncDependencies.push(asyncComputed);
			return;
		}

		const computed = input.computedNodes.get(graphNodeId);
		if (!computed) return;
		for (const dependency of computed.dependencies) visit(dependency.graphNodeId);
	};

	for (const dependency of input.node.dependencies) visit(dependency.graphNodeId);
	return asyncDependencies;
}

function commitDependencyPending(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	if (input.node.blockedByDependency === 'pending') return;

	input.node.controller?.abort();
	input.node.controller = undefined;
	input.node.blockedByDependency = 'pending';
	input.node.pendingSnapshotNeedsRunner = false;
	const version = input.node.version + 1;
	input.node.version = version;
	input.node.snapshot = {
		status: 'pending',
		version,
		key: input.node.keyValue,
		value: (input.node.snapshot as { readonly value?: unknown }).value,
	};
	input.markDirtyPath(input.node.graphNodeId, []);
	input.scheduleFlush();
}

function commitDependencyRejected(
	input: {
		readonly node: RuntimeAsyncComputedNode;
		readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
		readonly scheduleFlush: () => void;
	},
	error: unknown,
): void {
	if (
		input.node.blockedByDependency === 'rejected' &&
		input.node.snapshot.status === 'rejected' &&
		Object.is(input.node.snapshot.error, error)
	) {
		return;
	}

	input.node.controller?.abort();
	input.node.controller = undefined;
	input.node.blockedByDependency = 'rejected';
	input.node.pendingSnapshotNeedsRunner = false;
	const version = input.node.version + 1;
	input.node.version = version;
	input.node.snapshot = {
		status: 'rejected',
		version,
		key: input.node.keyValue,
		error,
	};
	input.markDirtyPath(input.node.graphNodeId, []);
	input.scheduleFlush();
}

function startAsyncComputed(input: {
	readonly node: RuntimeAsyncComputedNode;
	readonly key: unknown;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	input.node.controller?.abort();
	input.node.blockedByDependency = undefined;
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
