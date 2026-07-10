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
import { appendJournalResult, scheduleMicrotask, type DirtyPath } from './graph-scheduler.ts';
import { createSharedGraphPlane } from './graph-shared.ts';

declare const __MARKLESS_DEBUG_ENABLED__: boolean;

export type RuntimeGraphCell = {
	readonly graphNodeId: string;
	readonly value: unknown;
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
	readonly computed?: ReadonlyArray<RuntimeGraphComputed>;
	readonly asyncComputed?: ReadonlyArray<RuntimeGraphAsyncComputed>;
	readonly sharedDefinitions?: ProtocolStatePayload['sharedDefinitions'];
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

export type RuntimeGraph = {
	readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	readonly peekAsyncSnapshot: (graphNodeId: string) => RuntimeGraphAsyncSnapshot | undefined;
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
	readonly subscribeJournal: (listener: DomJournalListener) => () => void;
	readonly flush: () => Promise<void>;
	readonly takeJournal: () => DomJournalEntry[];
};

type RuntimeSharedDefinition = NonNullable<ProtocolStatePayload['sharedDefinitions']>[number];

export function createRuntimeGraph(input: RuntimeGraphInput): RuntimeGraph {
	const cells = new Map<string, unknown>();
	const computedNodes = createRuntimeComputedNodes(input.computed);
	const asyncComputedNodes = createRuntimeAsyncComputedNodes(input.asyncComputed);
	const subscriptions: RuntimeGraphSubscription[] = [];
	const journalListeners: DomJournalListener[] = [];
	const dirtyPaths: DirtyPath[] = [];
	const journal: DomJournalEntry[] = [];
	let flushScheduled = false;
	let flushing = false;
	let activeFlush: Promise<void> | undefined;

	for (const cell of input.cells) {
		cells.set(cell.graphNodeId, cell.value);
	}

	const readGraph: RuntimeGraphRead = (graphNodeId, path = []) => {
		const computed = computedNodes.get(graphNodeId);
		if (computed) {
			return readComputedNode(computed, readGraph, path);
		}

		const asyncComputed = asyncComputedNodes.get(graphNodeId);
		if (asyncComputed) {
			return readAsyncComputedNode(asyncComputed, path, () =>
				demandAsyncComputed(asyncComputed),
			);
		}

		return readPath(cells.get(graphNodeId), path);
	};

	const markDirtyPath = (graphNodeId: string, path: ReadonlyArray<string>): void => {
		dirtyPaths.push({ graphNodeId, path });
		markDirtyComputedDependencies({
			graphNodeId,
			path,
			computedNodes,
			asyncComputedNodes,
			dirtyPaths,
			invalidateAsyncComputed,
		});
	};

	const scheduleFlush = (): void => {
		if (flushScheduled || flushing) return;

		flushScheduled = true;
		scheduleMicrotask(() => {
			void flush();
		});
	};

	const demandAsyncComputed = (node: RuntimeAsyncComputedNode): void => {
		demandRuntimeAsyncComputed({ node, readGraph, markDirtyPath, scheduleFlush });
	};

	const invalidateAsyncComputed = (node: RuntimeAsyncComputedNode): void => {
		invalidateRuntimeAsyncComputed({ node, readGraph, markDirtyPath, scheduleFlush });
	};

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
				flushing = false;
			}

			await notifyJournalListeners();
		} finally {
			activeFlush = undefined;

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
			if (Object.is(readPath(current, path), write.value)) return;
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
	} as RuntimeGraph;
}
