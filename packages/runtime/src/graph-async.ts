import type {
	AsyncComputedPlane,
	AsyncComputedPlaneInternals,
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from './graph.ts';
import { readPath } from './graph-core.ts';
import { isAsyncSnapshotMetaKey } from './graph-scheduler.ts';
import type { HeldInputsPlane } from './graph-held.ts';

// Kept answers: how many a source that outruns the slowest of its siblings may hold for a pinned value to still read.
const KEPT_ANSWERS_CAP = 4;

/** One input a key read, with the value it had when the run started. */
export type RuntimeAsyncInput = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	controller?: AbortController;
	gate: number;
	snapshot: RuntimeGraphAsyncSnapshot;
	version: number;
	/** The inputs the shown value was fetched with; only a held-inputs plane captures them. */
	valueInputs?: ReadonlyArray<RuntimeAsyncInput>;
	/** Answers a newer one superseded, newest first, each still addressable while a pinned value reads its inputs; bounded ring buffer (Kept answers). */
	priorAnswers?: ReadonlyArray<{ readonly value: unknown; readonly inputs: ReadonlyArray<RuntimeAsyncInput> }>;
	/** A reader read an input as `valueInputs` holds it, so the landing must reach that reader. */
	pinned?: boolean;
	/** The key a served value was fetched with; its snapshot carries none. */
	servedKey?: { readonly key: unknown };
	/** The key of the run on held inputs, in flight or landed, while its async inputs still refresh. */
	waitingFor?: { readonly key: unknown };
	/** A handler that writes one of this node's key inputs marked it busy before running; cleared on `endEntry`, or left for the real run to clear once it lands. */
	entryHold?: { readonly version: number; readonly previous: RuntimeGraphAsyncSnapshot };
};

/** What the async plane shares with the held-inputs plane. */
export type AsyncPlaneContext = AsyncComputedPlaneInternals & {
	readonly asyncComputedNodes: Map<string, RuntimeAsyncComputedNode>;
	readonly start: (
		node: RuntimeAsyncComputedNode,
		key: unknown,
		read?: RuntimeGraphRead,
		waiting?: boolean,
	) => void;
	/** Reads a node's snapshot or value without starting it. */
	readonly peek: (node: RuntimeAsyncComputedNode, path: ReadonlyArray<string>) => unknown;
	held?: HeldInputsPlane;
};

function createNode(asyncComputed: RuntimeGraphAsyncComputed): RuntimeAsyncComputedNode {
	const snapshot: RuntimeGraphAsyncSnapshot = asyncComputed.initialSnapshot ?? {
		status: 'idle',
		version: 0,
	};
	return {
		...asyncComputed,
		gate: snapshot.status === 'pending' ? 1 : 0,
		snapshot,
		version: snapshot.version,
	};
}

function peek(node: RuntimeAsyncComputedNode, path: ReadonlyArray<string>): unknown {
	const head = path[0];
	return head === undefined || isAsyncSnapshotMetaKey(head)
		? readPath(node.snapshot, path)
		: readPath((node.snapshot as { readonly value?: unknown }).value, path);
}

// The most recent fulfilled value and the key it was fetched for, carried through re-runs and failures.
function lastGood(
	snapshot: RuntimeGraphAsyncSnapshot,
): { readonly value: unknown; readonly valueKey: unknown } | undefined {
	if (snapshot.status === 'fulfilled') return { value: snapshot.value, valueKey: snapshot.key };
	if (snapshot.status !== 'idle' && 'valueKey' in snapshot)
		return { value: snapshot.value, valueKey: snapshot.valueKey };
}

/** Async computeds as an installable plane: a graph without one carries none of this module. */
export function createAsyncComputedPlane(internals: AsyncComputedPlaneInternals): AsyncComputedPlane {
	const nodes = new Map<string, RuntimeAsyncComputedNode>();
	for (const asyncComputed of internals.asyncComputed ?? [])
		nodes.set(asyncComputed.graphNodeId, createNode(asyncComputed));
	const { computedNodes, readGraph } = internals;
	const context: AsyncPlaneContext = {
		...internals,
		asyncComputedNodes: nodes,
		start: (node, key, read, waiting) => start(node, key, read, waiting),
		peek,
	};

	const publish = (
		node: RuntimeAsyncComputedNode,
		snapshot: RuntimeGraphAsyncSnapshot,
		landed = false,
	): void => {
		const previous = node.snapshot;
		node.snapshot = snapshot;
		// Readers held at the inputs the old value was fetched with move on even when the new value equals it.
		internals.landWithoutObservers(() => {
			if (landed && node.pinned) node.pinned = false;
			else if (internals.reconcile) return internals.reconcile.publishAsync(node, previous);
			internals.markDirtyPath(node.graphNodeId, []);
		});
		internals.scheduleFlush();
	};

	const pendingSnapshot = (
		node: RuntimeAsyncComputedNode,
		version: number,
		key: unknown,
	): RuntimeGraphAsyncSnapshot => {
		const kept = lastGood(node.snapshot);
		return {
			status: 'pending',
			version,
			key,
			value: (node.snapshot as { readonly value?: unknown }).value,
			...(kept && { valueKey: kept.valueKey }),
		};
	};

	const commitDependencyBlock = (
		node: RuntimeAsyncComputedNode,
		status: 'pending' | 'rejected',
		error: unknown,
	): void => {
		if (
			node.gate === 2 &&
			(status === 'pending' ||
				(node.snapshot.status === 'rejected' && Object.is(node.snapshot.error, error)))
		)
			return;

		node.controller?.abort();
		node.controller = undefined;
		node.gate = 2;
		node.waitingFor = undefined;
		const version = ++node.version;
		const key = (node.snapshot as { readonly key?: unknown }).key;
		publish(
			node,
			status === 'pending'
				? pendingSnapshot(node, version, key)
				: { status, version, key, error, ...lastGood(node.snapshot) },
		);
	};

	const start = (
		node: RuntimeAsyncComputedNode,
		key: unknown,
		read: RuntimeGraphRead = readGraph,
		waiting?: boolean,
	): void => {
		node.controller?.abort();
		node.gate = 0;
		node.waitingFor = undefined;
		const inputs = context.held?.capture(node, read);

		const controller = new AbortController();
		const version = ++node.version;
		node.controller = controller;
		// A re-run keeps the last good value addressable while pending and after a
		// failure (spec D8 / Solid 2 `latest`); a first run has none, so reads answer undefined.
		const kept = lastGood(node.snapshot);
		publish(node, pendingSnapshot(node, version, key));

		const land = (snapshot: RuntimeGraphAsyncSnapshot): void => {
			if (node.version !== version) return;
			const landed = snapshot.status !== 'rejected';
			if (landed) {
				if (inputs) {
					// A source a pinned value still reads keeps the answer it had for the inputs it was fetched with (Kept answers); bounded so a run of switches can't grow it without limit.
					if (node.valueInputs)
						node.priorAnswers = [
							{ value: (node.snapshot as { readonly value?: unknown }).value, inputs: node.valueInputs },
							...(node.priorAnswers ?? []),
						].slice(0, KEPT_ANSWERS_CAP);
					node.valueInputs = inputs;
				}
				node.servedKey = undefined;
				if (waiting) node.gate = 2;
			}
			publish(node, snapshot, landed);
		};
		const commitRejected = (error: unknown): void =>
			land({ status: 'rejected', version, key, error, ...kept });
		try {
			Promise.resolve(node.run({ key, signal: controller.signal, read })).then(
				(value) =>
					land(
						waiting
							? { status: 'pending', version, key, value, valueKey: key }
							: { status: 'fulfilled', version, key, value },
					),
				commitRejected,
			);
		} catch (error) {
			commitRejected(error);
		}
	};

	const advance = (node: RuntimeAsyncComputedNode): void => {
		// Sync computeds have no settlement state, so walk through them until the
		// gate reaches the async nodes whose snapshots can block this runner.
		const visited = new Set<string>([node.graphNodeId]);
		let blocked: RuntimeAsyncComputedNode | undefined;
		let shown = true;
		const visit = (graphNodeId: string): void => {
			if (visited.has(graphNodeId)) return;
			visited.add(graphNodeId);
			const dependency = nodes.get(graphNodeId);
			if (dependency) {
				if (dependency.snapshot.status === 'idle' || dependency.snapshot.status === 'pending') {
					blocked = dependency;
					if (!dependency.valueInputs) shown = false;
					demand(dependency);
				} else if (!blocked && dependency.snapshot.status === 'rejected') blocked = dependency;
				return;
			}
			for (const dependency of computedNodes.get(graphNodeId)?.dependencies ?? [])
				visit(dependency.graphNodeId);
		};
		for (const dependency of node.dependencies) visit(dependency.graphNodeId);
		if (
			blocked?.snapshot.status === 'pending' &&
			shown &&
			context.held?.startOnShownInputs(node)
		)
			return;
		if (blocked) {
			commitDependencyBlock(
				node,
				blocked.snapshot.status === 'rejected' ? 'rejected' : 'pending',
				(blocked.snapshot as { readonly error?: unknown }).error,
			);
			return;
		}

		const nextKey = node.key(readGraph);
		if (
			!node.gate &&
			node.snapshot.status !== 'idle' &&
			Object.is((node.snapshot as { readonly key?: unknown }).key, nextKey)
		)
			return;

		start(node, nextKey);
	};

	// A payload-planned pending snapshot still needs its runner started on
	// first demand; otherwise only idle computeds start.
	const demand = (node: RuntimeAsyncComputedNode): void => {
		if (node.gate === 1 || node.snapshot.status === 'idle') advance(node);
	};

	// Marks a settled node pending before the write that will really refresh it: the key is
	// unchanged, so `advance()` still runs the real fetch once the write lands, replacing this
	// snapshot with its own pending one at the same node and leaving the busy mark unbroken.
	const markEntry = (node: RuntimeAsyncComputedNode): void => {
		if (node.entryHold || node.snapshot.status === 'idle' || node.snapshot.status === 'pending')
			return;
		const previous = node.snapshot;
		const version = ++node.version;
		node.entryHold = { version, previous };
		publish(node, pendingSnapshot(node, version, (previous as { readonly key?: unknown }).key));
		// A handler reached through the runtime's capture-slot dispatch runs its whole body
		// under a held flush (resume-events.ts's `invokeSymbol`), so the scheduled flush above
		// would otherwise wait for that hold to release - by then `endEntry` may already have
		// restored the prior snapshot, and the mark was never observably shown. `flush()` itself
		// ignores a hold, so forcing it here makes the mark visible immediately either way.
		void internals.flush?.();
	};

	// The handler that set the hold is done: a real run already replaced it (`node.version`
	// moved on), so its own settle clears the mark; otherwise nothing reached the write, so the
	// hold is undone and the node answers exactly what it did before it was marked.
	const endEntry = (node: RuntimeAsyncComputedNode): void => {
		const hold = node.entryHold;
		if (!hold) return;
		node.entryHold = undefined;
		if (node.version !== hold.version) return;
		publish(node, hold.previous);
		void internals.flush?.();
	};

	return {
		nodes,
		read(node, path) {
			demand(node);
			return peek(node, path);
		},
		invalidate: (node) => void (node.snapshot.status !== 'idle' && advance(node)),
		markEntry(graphNodeId) {
			const node = nodes.get(graphNodeId);
			if (node) markEntry(node);
		},
		endEntry(graphNodeId) {
			const node = nodes.get(graphNodeId);
			if (node) endEntry(node);
		},
		define(asyncComputed) {
			const node = createNode(asyncComputed);
			nodes.set(node.graphNodeId, node);
			context.held?.seed(node);
		},
		rerun(graphNodeId) {
			const node = nodes.get(graphNodeId);
			if (node?.snapshot.status !== 'rejected') return false;
			// A reset re-runs a rejected value even though its key has not changed.
			node.gate = 1;
			advance(node);
			return true;
		},
		holdInputs(factory) {
			if (context.held) return;
			context.held = factory(context);
			for (const node of nodes.values()) context.held.seed(node);
		},
		shownRead: (dependencies) => context.held?.shownRead(dependencies),
	};
}
