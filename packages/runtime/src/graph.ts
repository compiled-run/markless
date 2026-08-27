import type { ProtocolStatePayload } from '@markless/serializer';
import {
	deletePath,
	dirtyPathForGraphWrite,
	pathsIntersect,
	readPath,
	writePath,
} from './graph-core.ts';
import {
	applyCollectionCall,
	collectionCallMutated,
	collectionMutationSnapshot,
} from './graph-collections.ts';
import {
	createRuntimeAsyncComputedNodes,
	demandAsyncComputed as demandRuntimeAsyncComputed,
	invalidateAsyncComputed as invalidateRuntimeAsyncComputed,
	readAsyncComputedNode,
	type RuntimeAsyncComputedNode,
} from './graph-async.ts';
import {
	createRuntimeComputedNodes,
	markDirtyComputedDependencies,
	readComputedNode,
} from './graph-computed.ts';
import type {
	DerivedReconcilePlaneFactory,
	RuntimeGraphReconcileOptions,
} from './graph-reconcile.ts';
import { appendJournalResult, scheduleMicrotask, type DirtyPath } from './graph-scheduler.ts';
import { createSharedGraphPlane } from './graph-shared.ts';

declare const __MARKLESS_DEBUG_ENABLED__: boolean;

// Types only: importing the plane's runtime is the app's choice, and a graph
// that never installs it must not carry the module.
export type {
	DerivedReconcileInternals,
	DerivedReconcilePlane,
	DerivedReconcilePlaneFactory,
	DiffDerivedValueInput,
	RuntimeGraphReconcileKey,
	RuntimeGraphReconcileOptions,
	WriteTouchedRecord,
} from './graph-reconcile.ts';

export type RuntimeGraphCell = {
	readonly graphNodeId: string;
	readonly value: unknown;
	readonly readInitializer?: () => unknown;
};

export type RuntimeGraphRead = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

export type RuntimeGraphComputedDependency = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
};

export type RuntimeGraphComputed = {
	readonly graphNodeId: string;
	readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
	readonly compute: (read: RuntimeGraphRead) => unknown;
	/** How re-derived values reconcile against the node's previous value. */
	readonly reconcile?: RuntimeGraphReconcileOptions;
};

export type RuntimeGraphComputedDependencyNode = Omit<RuntimeGraphComputed, 'compute'> & {
	readonly compute?: never;
};

export type RuntimeGraphAsyncSnapshot =
	| {
			readonly status: 'idle';
			readonly version: 0;
	  }
	| {
			readonly status: 'pending';
			readonly version: number;
			readonly key: unknown;
			// A re-run carries the prior settled value so event-time reads keep
			// answering with it until the new snapshot commits (spec D8: "the
			// prior value is always addressable"; Solid 2 `latest` semantics).
			readonly value?: unknown;
	  }
	| {
			readonly status: 'fulfilled';
			readonly version: number;
			readonly key: unknown;
			readonly value: unknown;
	  }
	| {
			readonly status: 'rejected';
			readonly version: number;
			readonly key: unknown;
			readonly error: unknown;
	  };

export type RuntimeGraphAsyncComputed = {
	readonly graphNodeId: string;
	readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
	readonly initialSnapshot?: RuntimeGraphAsyncSnapshot;
	readonly key: (read: RuntimeGraphRead) => unknown;
	/** How a fulfilled value reconciles against the previously published one. */
	readonly reconcile?: RuntimeGraphReconcileOptions;
	readonly run: (input: {
		readonly key: unknown;
		readonly signal: AbortSignal;
		readonly read: RuntimeGraphRead;
	}) => unknown | Promise<unknown>;
};

export type DomJournalEntry =
	| {
			readonly type: 'setText';
			readonly locator: string;
			readonly value: unknown;
	  }
	| {
			readonly type: 'setAttr' | 'setProp';
			readonly locator: string;
			readonly name: string;
			readonly value: unknown;
	  }
	| {
			readonly type: 'insertRange';
			readonly locator: string;
			readonly fragment: unknown;
	  }
	| {
			readonly type: 'removeRange';
			readonly locator: string;
	  }
	| {
			readonly type: 'moveRange';
			readonly locator: string;
			readonly before: string;
	  }
	| {
			readonly type: 'runCleanup';
			readonly locator: string;
	  };

export type DomJournalResult = DomJournalEntry | ReadonlyArray<DomJournalEntry>;

export type DomJournalListener = (entries: ReadonlyArray<DomJournalEntry>) => void | Promise<void>;

export type RuntimeGraphInput = {
	readonly cells: ReadonlyArray<RuntimeGraphCell>;
	readonly computed?: ReadonlyArray<RuntimeGraphComputed | RuntimeGraphComputedDependencyNode>;
	readonly asyncComputed?: ReadonlyArray<RuntimeGraphAsyncComputed>;
	readonly sharedDefinitions?: ProtocolStatePayload['sharedDefinitions'];
	/**
	 * Installs derived reconciliation, from
	 * `@markless/runtime/graph-reconcile`. Without it a computed invalidation
	 * dirties the whole node and an async commit dirties the whole snapshot.
	 */
	readonly reconcile?: DerivedReconcilePlaneFactory;
};

export type RuntimeGraphWrite = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeGraphSharedWrite = {
	readonly definitionId: string;
	readonly propertyName: string;
	readonly path?: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeGraphSharedPatchOperation = readonly [
	operation: 'set',
	path: ReadonlyArray<string>,
	value: unknown,
];

export type RuntimeGraphSharedPatch = {
	readonly id: string;
	readonly scope?: RuntimeSharedDefinition['scope'];
	readonly version: number;
	readonly patch: ReadonlyArray<RuntimeGraphSharedPatchOperation>;
};

export type RuntimeGraphUpdate = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly update: (value: unknown) => unknown;
	readonly returnValue?: 'previous' | 'next';
};

export type RuntimeGraphCall = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly method: string;
	readonly args?: ReadonlyArray<unknown>;
};

export type RuntimeGraphDelete = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export type RuntimeGraphSubscription = {
	readonly id: string;
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly run: (value: unknown) => DomJournalResult | void | Promise<DomJournalResult | void>;
};

/**
 * Told about a write the moment it lands, before the flush that write schedules.
 *
 * The flush is a microtask behind the statement that wrote, so a handler reading
 * back what its own write produced - a keyed repeat's rows most of all - reads
 * the pre-write answer. An observer runs synchronously inside the write instead,
 * so the next statement of the same handler sees the result.
 *
 * It runs for a write to `graphNodeId` under an intersecting path, and for a
 * write to anything `graphNodeId` derives from, so a computed-backed collection
 * is reached through the state write behind it. It never runs during a flush -
 * the flush's own subscription pass is the single answer there - and never
 * re-enters: a write made from inside an observer notifies nobody.
 *
 * `run` is handed no value and answers with none: it is a place to react, not a
 * second subscription channel, and reads whatever it needs off the graph. The
 * graph does not catch what it throws.
 */
export type RuntimeGraphWriteObserver = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	/**
	 * Work ALREADY in flight that this observer needs settled before it can
	 * answer a write synchronously - a demand-loaded module, above all. It starts
	 * nothing, so a caller awaiting it adds no fetch to the gesture; it only
	 * stops the gesture racing a load its own wiring began. `undefined` is
	 * nothing to wait for, and costs no microtask.
	 */
	readonly settle?: () => Promise<void> | undefined;
	readonly run: () => void;
};

export type RuntimeGraph = {
	readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	/** Available only in debug-enabled builds (`__MARKLESS_DEBUG_ENABLED__`). */
	readonly peekAsyncSnapshot?: (graphNodeId: string) => RuntimeGraphAsyncSnapshot | undefined;
	readonly readShared: (
		definitionId: string,
		propertyName: string,
		path?: ReadonlyArray<string>,
	) => unknown;
	readonly writeShared: (write: RuntimeGraphSharedWrite) => boolean;
	readonly getSharedDefinition: (
		definitionId: string,
	) => NonNullable<ProtocolStatePayload['sharedDefinitions']>[number] | undefined;
	readonly listSharedDefinitions: () => NonNullable<ProtocolStatePayload['sharedDefinitions']>;
	readonly takeSharedPatches: () => RuntimeGraphSharedPatch[];
	readonly applySharedPatch: (patch: RuntimeGraphSharedPatch) => boolean;
	readonly write: (write: RuntimeGraphWrite) => void;
	readonly update: (update: RuntimeGraphUpdate) => unknown;
	readonly call: (call: RuntimeGraphCall) => unknown;
	readonly delete: (deletion: RuntimeGraphDelete) => boolean;
	readonly subscribe: (subscription: RuntimeGraphSubscription) => () => void;
	/**
	 * Optional so a facade over a subset of this contract stays a `RuntimeGraph`;
	 * a caller without it gets the flush-time answer it always had.
	 */
	readonly subscribeWrite?: (observer: RuntimeGraphWriteObserver) => () => void;
	/**
	 * Settles what the write observers are already loading, so a write made after
	 * it is answered synchronously. `undefined` when nothing is in flight.
	 */
	readonly settleWriteObservers?: () => Promise<void> | undefined;
	readonly subscribeJournal: (listener: DomJournalListener) => () => void;
	readonly flush: () => Promise<void>;
	readonly takeJournal: () => DomJournalEntry[];
};

type RuntimeSharedDefinition = NonNullable<ProtocolStatePayload['sharedDefinitions']>[number];

export function createRuntimeGraph(input: RuntimeGraphInput): RuntimeGraph {
	const cells = new Map<string, unknown>();
	const readInitializers = new Map<string, () => unknown>();
	const computedNodes = createRuntimeComputedNodes(input.computed);
	const asyncComputedNodes = createRuntimeAsyncComputedNodes(input.asyncComputed);
	const subscriptions: RuntimeGraphSubscription[] = [];
	const writeObservers: RuntimeGraphWriteObserver[] = [];
	const journalListeners: DomJournalListener[] = [];
	const dirtyPaths: DirtyPath[] = [];
	const journal: DomJournalEntry[] = [];
	let flushScheduled = false;
	let flushing = false;
	let notifyingWrite = false;
	let activeFlush: Promise<void> | undefined;

	for (const cell of input.cells) {
		cells.set(cell.graphNodeId, cell.value);
		if (cell.readInitializer) readInitializers.set(cell.graphNodeId, cell.readInitializer);
	}

	const readGraph: RuntimeGraphRead = (graphNodeId, path = []) => {
		const computed = computedNodes.get(graphNodeId);
		if (computed?.compute) {
			return readComputedNode(computed, readGraph, path, plane?.reconcileComputed);
		}

		const asyncComputed = asyncComputedNodes.get(graphNodeId);
		if (asyncComputed) {
			return readAsyncComputedNode(asyncComputed, path, () =>
				demandAsyncComputed(asyncComputed),
			);
		}

		const initialize = readInitializers.get(graphNodeId);
		if (initialize) {
			readInitializers.delete(graphNodeId);
			const current = cells.get(graphNodeId);
			try {
				const value = initialize();
				if (!Object.is(current, value)) {
					cells.set(graphNodeId, value);
					markDirtyPath(graphNodeId, dirtyPathForGraphWrite(current, []));
					scheduleFlush();
				}
			} catch {}
		}

		return readPath(cells.get(graphNodeId), path);
	};

	const markDirtyPath = (graphNodeId: string, path: ReadonlyArray<string>): void => {
		dirtyPaths.push({ graphNodeId, path });
		plane?.recordWrite(graphNodeId, path);
		markDirtyComputedDependencies({
			graphNodeId,
			path,
			computedNodes,
			asyncComputedNodes,
			dirtyPaths,
			reconcile: plane,
			invalidateAsyncComputed,
		});
		// Last, so an observer that reads back finds every computed this write
		// invalidated already marked and answering afresh.
		notifyWriteObservers(graphNodeId, path);
	};

	/**
	 * Whether `graphNodeId` is derived, however deeply, from the written path.
	 *
	 * A computed collection carries no dependency of its own on the state a
	 * handler writes; the chain of `dependencies` is the only thing that says so,
	 * and with a reconcile plane installed the write dirties no path under the
	 * computed for a path test to find.
	 */
	const derivesFromWrite = (
		graphNodeId: string,
		write: DirtyPath,
		seen: Set<string>,
	): boolean => {
		if (seen.has(graphNodeId)) return false;
		seen.add(graphNodeId);
		const computed = computedNodes.get(graphNodeId);
		if (!computed) return false;
		for (const dependency of computed.dependencies) {
			if (
				dependency.graphNodeId === write.graphNodeId &&
				pathsIntersect(write.path, dependency.path ?? [])
			)
				return true;
			if (derivesFromWrite(dependency.graphNodeId, write, seen)) return true;
		}
		return false;
	};

	const notifyWriteObservers = (graphNodeId: string, path: ReadonlyArray<string>): void => {
		if (writeObservers.length === 0 || flushing || notifyingWrite) return;

		const write: DirtyPath = { graphNodeId, path };
		notifyingWrite = true;
		try {
			// A copy: an observer is free to release itself or another.
			for (const observer of writeObservers.slice()) {
				const reaches =
					observer.graphNodeId === graphNodeId
						? pathsIntersect(path, observer.path ?? [])
						: derivesFromWrite(observer.graphNodeId, write, new Set());
				if (reaches) observer.run();
			}
		} finally {
			notifyingWrite = false;
		}
	};

	const scheduleFlush = (): void => {
		if (flushScheduled || flushing) return;

		flushScheduled = true;
		scheduleMicrotask(() => {
			void flush();
		});
	};

	// The plane holds every piece of reconcile bookkeeping, so a graph without
	// one behaves as it did before reconciliation existed. It is built here
	// because it closes over the hooks declared above.
	const plane = input.reconcile?.({
		cells,
		computedNodes,
		subscriptions,
		dirtyPaths,
		readGraph,
		markDirtyPath,
		scheduleFlush,
	});

	const asyncComputedInput = () => ({
		computedNodes,
		asyncComputedNodes,
		demandAsyncComputed,
		readGraph,
		markDirtyPath,
		scheduleFlush,
		reconcile: plane,
	});
	const demandAsyncComputed = (node: RuntimeAsyncComputedNode): void =>
		demandRuntimeAsyncComputed({ node, ...asyncComputedInput() });

	const invalidateAsyncComputed = (node: RuntimeAsyncComputedNode): void =>
		invalidateRuntimeAsyncComputed({ node, ...asyncComputedInput() });

	const sharedGraph = createSharedGraphPlane({
		cells,
		sharedDefinitionsInput: input.sharedDefinitions,
		readGraph,
		markDirtyPath,
		scheduleFlush,
	});

	const flush = (): Promise<void> => {
		if (activeFlush) return activeFlush;

		activeFlush = runFlush();
		return activeFlush;
	};

	const runFlush = async (): Promise<void> => {
		flushScheduled = false;
		flushing = true;

		try {
			try {
				while (dirtyPaths.length > 0) {
					plane?.recomputeSubscribed();
					const pending = dirtyPaths.splice(0);
					const ranSubscriptions = new Set<string>();

					for (const subscription of subscriptions) {
						const subscriptionPath = subscription.path ?? [];
						const dirty = pending.some(
							(path) =>
								path.graphNodeId === subscription.graphNodeId &&
								pathsIntersect(path.path, subscriptionPath),
						);
						if (!dirty || ranSubscriptions.has(subscription.id)) continue;

						ranSubscriptions.add(subscription.id);
						const entries = await subscription.run(
							readGraph(subscription.graphNodeId, subscriptionPath),
						);
						appendJournalResult(journal, entries);
					}
				}
			} finally {
				plane?.settleBaselines();
				flushing = false;
			}

			await notifyJournalListeners();
		} finally {
			activeFlush = undefined;
			// A write landing while this pass is active arms flushScheduled, then
			// finds flush() short-circuit on activeFlush, so the flag outlives the
			// pass that would clear it and every later scheduleFlush no-ops. Clearing
			// it here keeps it truthful, so the re-arm below can wake: any write that
			// reached the graph is applied by a flush nobody had to call explicitly.
			flushScheduled = false;

			if (dirtyPaths.length > 0) {
				scheduleFlush();
			}
		}
	};

	const notifyJournalListeners = async (): Promise<void> => {
		if (journalListeners.length === 0 || journal.length === 0) return;

		const entries = journal.splice(0);
		for (const listener of journalListeners) {
			await listener(entries);
		}
	};

	return {
		read: readGraph,
		...(typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
			? {
					peekAsyncSnapshot: (graphNodeId: string) =>
						asyncComputedNodes.get(graphNodeId)?.snapshot,
				}
			: {}),
		readShared: sharedGraph.readShared,
		writeShared: sharedGraph.writeShared,
		getSharedDefinition: sharedGraph.getSharedDefinition,
		listSharedDefinitions: sharedGraph.listSharedDefinitions,
		takeSharedPatches: sharedGraph.takeSharedPatches,
		applySharedPatch: sharedGraph.applySharedPatch,
		write(write) {
			const path = write.path ?? [];
			const current = cells.get(write.graphNodeId);
			// Map presence separates an unseeded node from one holding undefined; computeds
			// carry no payload value, so their first derive to undefined must not read as a no-op.
			const seeded = cells.has(write.graphNodeId);
			if (seeded && plane?.commitDerived(write, path)) return;
			if (seeded && Object.is(readPath(current, path), write.value)) return;
			cells.set(write.graphNodeId, writePath(current, path, write.value));
			markDirtyPath(write.graphNodeId, dirtyPathForGraphWrite(current, path));
			scheduleFlush();
		},
		update(update) {
			const path = update.path ?? [];
			const currentValue = readPath(cells.get(update.graphNodeId), path);
			const nextValue = update.update(currentValue);
			if (!Object.is(currentValue, nextValue)) {
				const current = cells.get(update.graphNodeId);
				cells.set(update.graphNodeId, writePath(current, path, nextValue));
				markDirtyPath(update.graphNodeId, dirtyPathForGraphWrite(current, path));
				scheduleFlush();
			}
			if (update.returnValue === 'previous') return currentValue;
			if (update.returnValue === 'next') return nextValue;
		},
		call(call) {
			const path = call.path ?? [];
			const target = readPath(cells.get(call.graphNodeId), path);
			const beforeMutation = collectionMutationSnapshot(target, call.method, call.args ?? []);
			const result = applyCollectionCall(target, call.method, call.args ?? []);

			if (collectionCallMutated(call.method, result, beforeMutation)) {
				markDirtyPath(call.graphNodeId, path);
				scheduleFlush();
			}

			return result;
		},
		delete(deletion) {
			const outcome = deletePath(cells.get(deletion.graphNodeId), deletion.path);
			if (outcome.mutated) {
				markDirtyPath(deletion.graphNodeId, deletion.path);
				scheduleFlush();
			}

			return outcome.result;
		},
		subscribe(subscription) {
			subscriptions.push(subscription);
			// Disposal contract: removed scopes unsubscribe their graph wiring
			// (spec 01-tsrx-host-contract "branch scope disposal").
			return () => {
				const index = subscriptions.indexOf(subscription);
				if (index >= 0) subscriptions.splice(index, 1);
			};
		},
		subscribeWrite(observer) {
			writeObservers.push(observer);
			return () => {
				const index = writeObservers.indexOf(observer);
				if (index >= 0) writeObservers.splice(index, 1);
			};
		},
		settleWriteObservers() {
			let pending: Promise<unknown>[] | undefined;
			for (const observer of writeObservers) {
				const settling = observer.settle?.();
				// A failed load is the flush's to report, from the pass that needs it.
				if (settling) (pending ??= []).push(settling.catch(() => undefined));
			}
			return pending && Promise.all(pending).then(() => undefined);
		},
		subscribeJournal(listener) {
			journalListeners.push(listener);
			return () => {
				const index = journalListeners.indexOf(listener);
				if (index >= 0) journalListeners.splice(index, 1);
			};
		},
		flush,
		takeJournal() {
			return journal.splice(0);
		},
	};
}
