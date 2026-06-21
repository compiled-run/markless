import type { ProtocolStatePayload } from '@arcade/protocol';

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
	readonly subscribe: (subscription: RuntimeGraphSubscription) => void;
	readonly subscribeJournal: (listener: DomJournalListener) => () => void;
	readonly flush: () => Promise<void>;
	readonly takeJournal: () => DomJournalEntry[];
};

type DirtyPath = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

type RuntimeComputedNode = RuntimeGraphComputed & {
	dirty: boolean;
	value: unknown;
};

type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	controller?: AbortController;
	demanded: boolean;
	keyValue: unknown;
	pendingSnapshotNeedsRunner: boolean;
	snapshot: RuntimeGraphAsyncSnapshot;
	version: number;
};

type ArraySlotSnapshot = {
	readonly exists: boolean;
	readonly value: unknown;
};

type RuntimeSharedDefinition = NonNullable<ProtocolStatePayload['sharedDefinitions']>[number];
type RuntimeSharedReturnProperty = NonNullable<RuntimeSharedDefinition['returnProperties']>[number];

type CollectionMutationSnapshot =
	| {
			readonly type: 'size';
			readonly value: number;
	  }
	| {
			readonly type: 'array';
			readonly slots: ReadonlyArray<ArraySlotSnapshot>;
			readonly target: ReadonlyArray<unknown>;
	  }
	| {
			readonly type: 'set-add';
			readonly hadValue: boolean;
	  }
	| {
			readonly type: 'map-set';
			readonly hadKey: boolean;
			readonly valueChanged: boolean;
	  }
	| {
			readonly type: 'date';
			readonly time: number;
			readonly target: Date;
	  };

export function createRuntimeGraph(input: RuntimeGraphInput): RuntimeGraph {
	const cells = new Map<string, unknown>();
	const computedNodes = new Map<string, RuntimeComputedNode>();
	const asyncComputedNodes = new Map<string, RuntimeAsyncComputedNode>();
	const sharedDefinitions = new Map<string, RuntimeSharedDefinition>();
	const sharedPatches: RuntimeGraphSharedPatch[] = [];
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

	for (const computed of input.computed ?? []) {
		computedNodes.set(computed.graphNodeId, {
			...computed,
			dirty: true,
			value: undefined,
		});
	}

	for (const asyncComputed of input.asyncComputed ?? []) {
		const initialSnapshot = asyncComputed.initialSnapshot ?? { status: 'idle', version: 0 };
		asyncComputedNodes.set(asyncComputed.graphNodeId, {
			...asyncComputed,
			demanded: initialSnapshot.status !== 'idle',
			keyValue: 'key' in initialSnapshot ? initialSnapshot.key : undefined,
			pendingSnapshotNeedsRunner: initialSnapshot.status === 'pending',
			snapshot: initialSnapshot,
			version: initialSnapshot.version,
		});
	}

	for (const definition of input.sharedDefinitions ?? []) {
		sharedDefinitions.set(definition.id, definition);
	}

	const readGraph: RuntimeGraphRead = (graphNodeId, path = []) => {
		const computed = computedNodes.get(graphNodeId);
		if (computed) {
			if (computed.dirty) {
				computed.value = computed.compute(readGraph);
				computed.dirty = false;
			}

			return readPath(computed.value, path);
		}

		const asyncComputed = asyncComputedNodes.get(graphNodeId);
		if (asyncComputed) {
			demandAsyncComputed(asyncComputed);
			return readPath(asyncComputed.snapshot, path);
		}

		return readPath(cells.get(graphNodeId), path);
	};

	const readShared = (
		definitionId: string,
		propertyName: string,
		path: ReadonlyArray<string> = [],
	): unknown => {
		const resolved = resolveSharedGraphPath(definitionId, propertyName, path);
		if (!resolved) return undefined;

		return readGraph(resolved.graphNodeId, resolved.graphPath);
	};

	const resolveSharedGraphPath = (
		definitionId: string,
		propertyName: string,
		path: ReadonlyArray<string>,
	):
		| {
				readonly definition: RuntimeSharedDefinition;
				readonly graphNodeId: string;
				readonly graphPath: ReadonlyArray<string>;
				readonly exposedPath: ReadonlyArray<string>;
		  }
		| undefined => {
		const definition = sharedDefinitions.get(definitionId);
		if (!definition) return undefined;

		const property = findLastSharedReturnProperty(definition.returnProperties, propertyName);
		if (!property || property.kind !== 'graph') return undefined;

		return {
			definition,
			graphNodeId: property.graphNodeId,
			graphPath: [...property.path, ...path],
			exposedPath: [property.name, ...path],
		};
	};

	const setSharedDefinitionVersion = (
		definition: RuntimeSharedDefinition,
		version: number,
	): RuntimeSharedDefinition => {
		const nextDefinition = {
			...definition,
			version,
		};
		sharedDefinitions.set(definition.id, nextDefinition);
		return nextDefinition;
	};

	const nextSharedDefinitionVersion = (
		definition: RuntimeSharedDefinition,
	): RuntimeSharedDefinition => setSharedDefinitionVersion(definition, definition.version + 1);

	const applySharedPatch = (patch: RuntimeGraphSharedPatch): boolean => {
		const definition = sharedDefinitions.get(patch.id);
		if (!definition) return false;
		if (patch.version <= definition.version) return false;
		if (patch.scope && definition.scope && patch.scope !== definition.scope) return false;
		if (patch.patch.length === 0) return false;

		const resolvedPatches: Array<{
			readonly graphNodeId: string;
			readonly graphPath: ReadonlyArray<string>;
			readonly value: unknown;
		}> = [];

		for (const [operation, exposedPath, value] of patch.patch) {
			if (operation !== 'set') return false;
			const [propertyName, ...path] = exposedPath;
			if (!propertyName) return false;

			const resolved = resolveSharedGraphPath(patch.id, propertyName, path);
			if (!resolved) return false;
			resolvedPatches.push({
				graphNodeId: resolved.graphNodeId,
				graphPath: resolved.graphPath,
				value,
			});
		}

		for (const resolved of resolvedPatches) {
			const current = cells.get(resolved.graphNodeId);
			cells.set(resolved.graphNodeId, writePath(current, resolved.graphPath, resolved.value));
			markDirtyPath(
				resolved.graphNodeId,
				dirtyPathForGraphWrite(current, resolved.graphPath),
			);
		}

		setSharedDefinitionVersion(definition, patch.version);
		scheduleFlush();
		return true;
	};

	const markComputedDirty = (graphNodeId: string, visited: Set<string>): void => {
		if (visited.has(graphNodeId)) return;
		visited.add(graphNodeId);

		const computed = computedNodes.get(graphNodeId);
		if (computed) computed.dirty = true;

		dirtyPaths.push({ graphNodeId, path: [] });

		for (const dependent of computedNodes.values()) {
			const dirty = dependent.dependencies.some(
				(dependency) => dependency.graphNodeId === graphNodeId,
			);
			if (dirty) markComputedDirty(dependent.graphNodeId, visited);
		}

		for (const dependent of asyncComputedNodes.values()) {
			const dirty = dependent.dependencies.some(
				(dependency) => dependency.graphNodeId === graphNodeId,
			);
			if (dirty) invalidateAsyncComputed(dependent);
		}
	};

	const markDirtyPath = (graphNodeId: string, path: ReadonlyArray<string>): void => {
		dirtyPaths.push({ graphNodeId, path });

		for (const computed of computedNodes.values()) {
			const dirty = computed.dependencies.some(
				(dependency) =>
					dependency.graphNodeId === graphNodeId &&
					pathsIntersect(path, dependency.path ?? []),
			);
			if (dirty) markComputedDirty(computed.graphNodeId, new Set());
		}

		for (const asyncComputed of asyncComputedNodes.values()) {
			const dirty = asyncComputed.dependencies.some(
				(dependency) =>
					dependency.graphNodeId === graphNodeId &&
					pathsIntersect(path, dependency.path ?? []),
			);
			if (dirty) invalidateAsyncComputed(asyncComputed);
		}
	};

	const scheduleFlush = (): void => {
		if (flushScheduled || flushing) return;

		flushScheduled = true;
		scheduleMicrotask(() => {
			void flush();
		});
	};

	const demandAsyncComputed = (node: RuntimeAsyncComputedNode): void => {
		if (node.pendingSnapshotNeedsRunner) {
			node.pendingSnapshotNeedsRunner = false;
			node.demanded = true;
			startAsyncComputed(node, node.key(readGraph));
			return;
		}

		if (node.snapshot.status !== 'idle') return;

		node.demanded = true;
		startAsyncComputed(node, node.key(readGraph));
	};

	const invalidateAsyncComputed = (node: RuntimeAsyncComputedNode): void => {
		if (!node.demanded) return;

		const nextKey = node.key(readGraph);
		if (node.snapshot.status !== 'idle' && Object.is(node.keyValue, nextKey)) return;

		startAsyncComputed(node, nextKey);
	};

	const startAsyncComputed = (node: RuntimeAsyncComputedNode, key: unknown): void => {
		node.controller?.abort();
		node.pendingSnapshotNeedsRunner = false;

		const controller = new AbortController();
		const version = node.version + 1;
		node.controller = controller;
		node.keyValue = key;
		node.version = version;
		node.snapshot = { status: 'pending', version, key };

		const commitFulfilled = (value: unknown): void => {
			if (node.version !== version || controller.signal.aborted) return;

			node.snapshot = { status: 'fulfilled', version, key, value };
			markDirtyPath(node.graphNodeId, []);
			scheduleFlush();
		};
		const commitRejected = (error: unknown): void => {
			if (node.version !== version || controller.signal.aborted) return;

			node.snapshot = { status: 'rejected', version, key, error };
			markDirtyPath(node.graphNodeId, []);
			scheduleFlush();
		};

		try {
			Promise.resolve(node.run({ key, signal: controller.signal, read: readGraph })).then(
				commitFulfilled,
				commitRejected,
			);
		} catch (error) {
			commitRejected(error);
		}

		markDirtyPath(node.graphNodeId, []);
		scheduleFlush();
	};

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
		readShared,
		writeShared(write) {
			const target = resolveSharedGraphPath(
				write.definitionId,
				write.propertyName,
				write.path ?? [],
			);
			if (!target) return false;

			const current = cells.get(target.graphNodeId);
			cells.set(target.graphNodeId, writePath(current, target.graphPath, write.value));
			const nextDefinition = nextSharedDefinitionVersion(target.definition);
			sharedPatches.push({
				id: nextDefinition.id,
				...(nextDefinition.scope ? { scope: nextDefinition.scope } : {}),
				version: nextDefinition.version,
				patch: [['set', target.exposedPath, write.value]],
			});
			markDirtyPath(target.graphNodeId, dirtyPathForGraphWrite(current, target.graphPath));
			scheduleFlush();
			return true;
		},
		getSharedDefinition(definitionId) {
			return sharedDefinitions.get(definitionId);
		},
		listSharedDefinitions() {
			return [...sharedDefinitions.values()];
		},
		takeSharedPatches() {
			return sharedPatches.splice(0);
		},
		applySharedPatch,
		write(write) {
			const path = write.path ?? [];
			const current = cells.get(write.graphNodeId);
			cells.set(write.graphNodeId, writePath(current, path, write.value));
			markDirtyPath(write.graphNodeId, dirtyPathForGraphWrite(current, path));
			scheduleFlush();
		},
		update(update) {
			const path = update.path ?? [];
			const currentValue = readPath(cells.get(update.graphNodeId), path);
			const nextValue = update.update(currentValue);
			const current = cells.get(update.graphNodeId);
			cells.set(update.graphNodeId, writePath(current, path, nextValue));
			markDirtyPath(update.graphNodeId, dirtyPathForGraphWrite(current, path));
			scheduleFlush();
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

function findLastSharedReturnProperty(
	properties: NonNullable<RuntimeSharedDefinition['returnProperties']> | undefined,
	propertyName: string,
): RuntimeSharedReturnProperty | undefined {
	if (!properties) return undefined;

	for (let index = properties.length - 1; index >= 0; index--) {
		const property = properties[index];
		if (property?.name === propertyName) return property;
	}

	return undefined;
}

function appendJournalResult(journal: DomJournalEntry[], result: DomJournalResult | void): void {
	if (!result) return;
	if (isDomJournalEntryArray(result)) {
		journal.push(...result);
		return;
	}

	journal.push(result);
}

function isDomJournalEntryArray(
	result: DomJournalResult,
): result is ReadonlyArray<DomJournalEntry> {
	return Array.isArray(result);
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;

	for (const segment of path) {
		if (current == null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}

	return current;
}

function writePath(value: unknown, path: ReadonlyArray<string>, nextValue: unknown): unknown {
	if (path.length === 0) return nextValue;

	const root = isObject(value) ? value : {};
	let current = root as Record<string, unknown>;

	for (const segment of path.slice(0, -1)) {
		const child = current[segment];
		if (!isObject(child)) {
			current[segment] = {};
		}
		current = current[segment] as Record<string, unknown>;
	}

	current[path[path.length - 1]] = nextValue;
	return root;
}

function dirtyPathForGraphWrite(
	value: unknown,
	path: ReadonlyArray<string>,
): ReadonlyArray<string> {
	if (path[path.length - 1] !== 'length') return path;

	const parentPath = path.slice(0, -1);
	const parent = readPath(value, parentPath);
	if (!Array.isArray(parent)) return path;

	return parentPath;
}

function deletePath(
	value: unknown,
	path: ReadonlyArray<string>,
): {
	readonly result: boolean;
	readonly mutated: boolean;
} {
	if (path.length === 0) {
		throw new TypeError('Cannot delete a graph node root. Delete a property path instead.');
	}

	let current = value;

	for (const segment of path.slice(0, -1)) {
		if (current == null) {
			throw new TypeError(`Cannot delete graph path "${path.join('.')}".`);
		}

		current = (current as Record<string, unknown>)[segment];
	}

	if (current == null) {
		throw new TypeError(`Cannot delete graph path "${path.join('.')}".`);
	}

	if (!isObject(current)) {
		return { result: true, mutated: false };
	}

	const key = path[path.length - 1];
	const hadProperty = Object.prototype.hasOwnProperty.call(current, key);
	const result = delete current[key];

	return { result, mutated: hadProperty && result };
}

function applyCollectionCall(
	target: unknown,
	method: string,
	args: ReadonlyArray<unknown>,
): unknown {
	if (!isSupportedCollectionTarget(target)) {
		throw new TypeError(
			`Cannot call collection method "${method}" because the graph path is not an Array, Map, Set, or Date.`,
		);
	}

	if (!isSupportedCollectionMethod(method)) {
		throw new TypeError(`Unsupported graph collection method "${method}".`);
	}

	const callable = (target as unknown as { readonly [key: string]: unknown })[method];
	if (typeof callable !== 'function') {
		throw new TypeError(`Unsupported graph collection method "${method}".`);
	}

	return Reflect.apply(callable, target, [...args]);
}

function collectionCallMutated(
	method: string,
	result: unknown,
	beforeMutation: CollectionMutationSnapshot | null,
): boolean {
	if (method === 'delete') return result === true;
	if (method === 'clear') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'pop') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'shift') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'push' || method === 'unshift') {
		return beforeMutation?.type !== 'size' || result !== beforeMutation.value;
	}
	if (arrayContentMutationMethod(method)) {
		return (
			beforeMutation?.type !== 'array' ||
			!arraySlotsEqual(beforeMutation.slots, beforeMutation.target)
		);
	}
	if (method === 'add') {
		return beforeMutation?.type !== 'set-add' || !beforeMutation.hadValue;
	}
	if (method === 'set') {
		return (
			beforeMutation?.type !== 'map-set' ||
			!beforeMutation.hadKey ||
			beforeMutation.valueChanged
		);
	}
	if (dateMutationMethod(method)) {
		return (
			beforeMutation?.type !== 'date' ||
			!Object.is(beforeMutation.time, beforeMutation.target.getTime())
		);
	}

	return true;
}

function collectionMutationSnapshot(
	target: unknown,
	method: string,
	args: ReadonlyArray<unknown>,
): CollectionMutationSnapshot | null {
	if (method === 'add' && target instanceof Set) {
		return { type: 'set-add', hadValue: target.has(args[0]) };
	}
	if (method === 'set' && target instanceof Map) {
		const hadKey = target.has(args[0]);
		return {
			type: 'map-set',
			hadKey,
			valueChanged: !hadKey || !Object.is(target.get(args[0]), args[1]),
		};
	}
	if (target instanceof Date && dateMutationMethod(method)) {
		return { type: 'date', time: target.getTime(), target };
	}
	if (arrayContentMutationMethod(method) && Array.isArray(target))
		return { type: 'array', slots: arraySlotSnapshot(target), target };

	if (Array.isArray(target)) return { type: 'size', value: target.length };
	if (target instanceof Map || target instanceof Set) return { type: 'size', value: target.size };

	return null;
}

function isSupportedCollectionMethod(name: string): boolean {
	return (
		name === 'add' ||
		name === 'clear' ||
		name === 'copyWithin' ||
		name === 'delete' ||
		name === 'fill' ||
		name === 'pop' ||
		name === 'push' ||
		name === 'reverse' ||
		name === 'set' ||
		name === 'shift' ||
		name === 'sort' ||
		name === 'splice' ||
		name === 'unshift' ||
		dateMutationMethod(name)
	);
}

function isSupportedCollectionTarget(
	target: unknown,
): target is unknown[] | Map<unknown, unknown> | Set<unknown> | Date {
	return (
		Array.isArray(target) ||
		target instanceof Map ||
		target instanceof Set ||
		target instanceof Date
	);
}

function arrayContentMutationMethod(method: string): boolean {
	return (
		method === 'copyWithin' ||
		method === 'fill' ||
		method === 'reverse' ||
		method === 'sort' ||
		method === 'splice'
	);
}

function dateMutationMethod(method: string): boolean {
	return (
		method === 'setDate' ||
		method === 'setFullYear' ||
		method === 'setHours' ||
		method === 'setMilliseconds' ||
		method === 'setMinutes' ||
		method === 'setMonth' ||
		method === 'setSeconds' ||
		method === 'setTime' ||
		method === 'setUTCDate' ||
		method === 'setUTCFullYear' ||
		method === 'setUTCHours' ||
		method === 'setUTCMilliseconds' ||
		method === 'setUTCMinutes' ||
		method === 'setUTCMonth' ||
		method === 'setUTCSeconds' ||
		method === 'setYear'
	);
}

function arraySlotSnapshot(target: ReadonlyArray<unknown>): ArraySlotSnapshot[] {
	return Array.from({ length: target.length }, (_, index) => ({
		exists: Object.prototype.hasOwnProperty.call(target, index),
		value: target[index],
	}));
}

function arraySlotsEqual(before: ReadonlyArray<ArraySlotSnapshot>, after: unknown): boolean {
	if (!Array.isArray(after)) return false;
	if (before.length !== after.length) return false;

	return before.every((slot, index) => {
		const exists = Object.prototype.hasOwnProperty.call(after, index);
		return slot.exists === exists && (!slot.exists || Object.is(slot.value, after[index]));
	});
}

function pathsIntersect(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
	return isPrefix(a, b) || isPrefix(b, a);
}

function isPrefix(prefix: ReadonlyArray<string>, value: ReadonlyArray<string>): boolean {
	if (prefix.length > value.length) return false;

	return prefix.every((segment, index) => value[index] === segment);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function scheduleMicrotask(callback: () => void): void {
	if (typeof queueMicrotask === 'function') {
		queueMicrotask(callback);
		return;
	}

	void Promise.resolve().then(callback);
}
