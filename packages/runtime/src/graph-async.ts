import type {
	AsyncComputedPlane,
	AsyncComputedPlaneInternals,
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from './graph.ts';
import { pathsIntersect, readPath } from './graph-core.ts';
import { isAsyncSnapshotMetaKey } from './graph-scheduler.ts';
import type { HeldInputsPlane } from './graph-held.ts';

/** One input a key read, with the value it had when the run started. */
export type RuntimeAsyncInput = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeAsyncAnswer = { readonly value: unknown; readonly inputs: ReadonlyArray<RuntimeAsyncInput> };

export type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	controller?: AbortController;
	gate: number;
	snapshot: RuntimeGraphAsyncSnapshot;
	version: number;
	/** The inputs the shown value was fetched with; only a held-inputs plane captures them. */
	valueInputs?: ReadonlyArray<RuntimeAsyncInput>;
	/** Answers a newer one superseded, newest first, each kept only while a pinned value still reads it (Kept answers). */
	priorAnswers?: ReadonlyArray<RuntimeAsyncAnswer>;
	/** Async values some reader reads beside this one. */
	readWith?: Set<RuntimeAsyncComputedNode>;
	/** A reader read an input as `valueInputs` holds it, so the landing must reach that reader. */
	pinned?: boolean;
	/** The key a served value was fetched with; its snapshot carries none. */
	servedKey?: { readonly key: unknown };
	/** The key of the run on held inputs, in flight or landed, while its async inputs still refresh. */
	waitingFor?: { readonly key: unknown };
	/** A handler that writes one of this node's key inputs marked it busy before running; cleared on `endEntry`, or left for the real run to clear once it lands. */
	entryHold?: { readonly version: number; readonly previous: RuntimeGraphAsyncSnapshot };
	/** Set when the run that is in flight started outside a user action; carried onto every snapshot that run publishes. */
	quiet?: boolean;
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
	// Per source: the derived cells reading it, at which path; a stale cell maps to the write count since its derive.
	const derivedCells = new Map<string, Array<{ readonly graphNodeId: string; readonly path: ReadonlyArray<string> }>>();
	const staleDerives = new Map<string, number>();
	const add = (node: RuntimeAsyncComputedNode): void => {
		nodes.set(node.graphNodeId, node);
		for (const hop of node.syncHops ?? [])
			for (const { graphNodeId: source, path = [] } of hop.dependencies)
				derivedCells.set(source, [...(derivedCells.get(source) ?? []), { graphNodeId: hop.graphNodeId, path }]);
	};
	for (const asyncComputed of internals.asyncComputed ?? []) add(createNode(asyncComputed));
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
			...(node.quiet && { quiet: true }),
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
		fromWrite?: boolean,
	): void => {
		node.controller?.abort();
		node.gate = 0;
		node.waitingFor = undefined;
		const inputs = context.held?.capture(node, read);

		const controller = new AbortController();
		const version = ++node.version;
		node.controller = controller;
		// Read in the writing turn: only a write outside a user action, with no entry hold open, is quiet.
		node.quiet =
			!node.entryHold && !!fromWrite && (context.isUserAction ? !context.isUserAction() : false);
		// A re-run keeps the last good value addressable while pending and after a
		// failure (spec D8 / Solid 2 `latest`); a first run has none, so reads answer undefined.
		const kept = lastGood(node.snapshot);
		publish(node, pendingSnapshot(node, version, key));

		const land = (snapshot: Exclude<RuntimeGraphAsyncSnapshot, { readonly status: 'idle' }>): void => {
			if (node.version !== version) return;
			const landed = snapshot.status !== 'rejected';
			if (landed) {
				if (inputs) {
					const superseded = node.valueInputs && {
						value: (node.snapshot as { readonly value?: unknown }).value,
						inputs: node.valueInputs,
					};
					node.valueInputs = inputs;
					context.held?.keep(node, superseded);
				}
				node.servedKey = undefined;
				if (waiting) node.gate = 2;
			}
			publish(node, node.quiet ? { ...snapshot, quiet: true } : snapshot, landed);
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

	const advance = (node: RuntimeAsyncComputedNode, fromWrite?: boolean): void => {
		// Sync computeds have no settlement state, so walk through them until the
		// gate reaches the async nodes whose snapshots can block this runner.
		const visited = new Set<string>([node.graphNodeId]);
		let blocked: RuntimeAsyncComputedNode | undefined;
		let shown = true;
		let staleDerive = false;
		const visit = (graphNodeId: string): void => {
			if (visited.has(graphNodeId)) return;
			visited.add(graphNodeId);
			if (staleDerives.has(graphNodeId)) staleDerive = true;
			const dependency = nodes.get(graphNodeId);
			if (dependency) {
				if (dependency.snapshot.status === 'idle' || dependency.snapshot.status === 'pending') {
					blocked = dependency;
					if (!dependency.valueInputs) shown = false;
					demand(dependency, fromWrite);
				} else if (!blocked && dependency.snapshot.status === 'rejected') {
					blocked = dependency;
					if (!dependency.valueInputs) shown = false;
				}
				return;
			}
			for (const dependency of computedNodes.get(graphNodeId)?.dependencies ?? [])
				visit(dependency.graphNodeId);
		};
		for (const dependency of node.dependencies) visit(dependency.graphNodeId);
		for (const hop of node.syncHops ?? []) for (const graphNodeId of hop.asyncFrom) visit(graphNodeId);
		// A rejected blocker with a pinnable last-good value pins like a pending one (graph-held.ts `rejectedOnly`).
		if (blocked && shown && context.held?.startOnShownInputs(node)) return;
		// A sibling's failed refresh never rejects a reader whose pinned key did not move.
		if (blocked?.snapshot.status === 'rejected' && shown) return;
		if (!blocked && staleDerive) {
			commitDependencyBlock(node, 'pending', undefined);
			return;
		}
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

		start(node, nextKey, readGraph, undefined, fromWrite);
	};

	// A payload-planned pending snapshot still needs its runner started on
	// first demand; otherwise only idle computeds start.
	const demand = (node: RuntimeAsyncComputedNode, fromWrite?: boolean): void => {
		if (node.gate === 1 || node.snapshot.status === 'idle') advance(node, fromWrite);
	};

	// Same key, so the real run the write starts replaces this pending snapshot with no gap.
	const markEntry = (node: RuntimeAsyncComputedNode): void => {
		if (node.entryHold || node.snapshot.status === 'idle' || node.snapshot.status === 'pending')
			return;
		const previous = node.snapshot;
		const version = ++node.version;
		node.entryHold = { version, previous };
		node.quiet = false;
		publish(node, pendingSnapshot(node, version, (previous as { readonly key?: unknown }).key));
		// A callback prop runs under a held flush (resume-events.ts `invokeSymbol`); flush past it.
		void internals.flush?.();
	};

	const endEntry = (node: RuntimeAsyncComputedNode): void => {
		const hold = node.entryHold;
		if (!hold) return;
		// A cell-backed computed between the write and this key only recomputes in the next flush.
		if (node.version === hold.version && internals.hasPendingFlush?.()) {
			void internals.flush?.().then(() => {
				if (node.entryHold === hold) endEntry(node);
			});
			return;
		}
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
		invalidate: (node) => void (node.snapshot.status !== 'idle' && advance(node, true)),
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
			add(node);
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
		failHandler(graphNodeId, error) {
			const node = nodes.get(graphNodeId);
			if (!node) return;
			node.controller?.abort();
			node.controller = undefined;
			const version = ++node.version;
			const key = (node.snapshot as { readonly key?: unknown }).key;
			publish(node, { status: 'rejected', version, key, error, ...lastGood(node.snapshot) });
		},
		holdInputs(factory) {
			if (context.held) return;
			context.held = factory(context);
			for (const node of nodes.values()) context.held.seed(node);
		},
		shownRead: (dependencies) => context.held?.shownRead(dependencies),
		wrote(graphNodeId, path) {
			staleDerives.delete(graphNodeId);
			for (const cell of derivedCells.get(graphNodeId) ?? [])
				if (pathsIntersect(path, cell.path))
					staleDerives.set(cell.graphNodeId, (staleDerives.get(cell.graphNodeId) ?? 0) + 1);
		},
		startDerive(graphNodeId) {
			const stale = staleDerives.get(graphNodeId);
			return () => {
				if (stale === undefined || staleDerives.get(graphNodeId) !== stale) return;
				staleDerives.delete(graphNodeId);
				internals.markDirtyPath(graphNodeId, []);
			};
		},
	};
}
