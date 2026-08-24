import type { SsrDataResidue, SsrDataSlot } from '../ssr-data/renderer.ts';

// The direct-DOM renderer runs in the browser against real DOM. Chunk
// coordinates address elements, so the walk below hands back elements.
type DirectGraph = {
	readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	readonly flush: () => void;
	readonly isDirty?: (graphNodeId: string) => boolean;
};
type DirectSymbolContext = {
	readonly graph: DirectGraph;
	readonly event?: Event;
	readonly element?: Node | null;
	readonly getElementHandle: (handleIdOrName: string) => Element | undefined;
	readonly locals?: Readonly<Record<string, unknown>>;
	readonly behaviorInputs?: ReadonlyArray<unknown>;
};
type DirectSymbol = (context: DirectSymbolContext) => unknown;
type DirectLoadSymbol = (symbolId: string) => DirectSymbol | Promise<DirectSymbol>;
type DirectChunk = {
	readonly id: string;
	readonly statics: ReadonlyArray<string>;
	readonly slots: ReadonlyArray<SsrDataSlot>;
};
type DirectClonedChunk = { readonly chunk: DirectChunk; readonly content: DocumentFragment };
type DirectCloneChunk = (chunkId: string) => DirectClonedChunk;
type DirectEventRecord = {
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly hostPath: ReadonlyArray<number>;
	readonly symbolIds: ReadonlyArray<string>;
};
type DirectClassWrite = {
	readonly hostPath: ReadonlyArray<number>;
	readonly stateGraphNodeId: string;
	readonly statePath: ReadonlyArray<string>;
	readonly itemPath: ReadonlyArray<string>;
	readonly trueClass: string;
	readonly falseClass: string;
};
type DirectEventControl = {
	readonly hostPath: ReadonlyArray<number>;
	readonly eventName: string;
	readonly symbolId: string;
	readonly itemContext: { readonly itemName: string };
};
type DirectRepeat = {
	readonly repeatId: string;
	readonly parentPath: ReadonlyArray<number>;
	readonly itemName: string;
	readonly collectionGraphNodeId: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly keyPath: ReadonlyArray<string>;
	readonly rowChunkId: string;
	readonly emptyChunkId?: string;
	readonly classWrites: ReadonlyArray<DirectClassWrite>;
	readonly eventControls: ReadonlyArray<DirectEventControl>;
	readonly rowElementHandles?: ReadonlyArray<{
		readonly hostPath: ReadonlyArray<number>;
		readonly handleId: string;
		readonly name: string;
	}>;
	readonly rowBehaviors?: ReadonlyArray<{
		readonly hostPath: ReadonlyArray<number>;
		readonly symbolId: string;
		readonly inputPaths: ReadonlyArray<ReadonlyArray<string>>;
	}>;
};
type DirectRenderData = {
	readonly rootChunkId: string;
	readonly chunks: ReadonlyArray<DirectChunk>;
	readonly events: ReadonlyArray<DirectEventRecord>;
	readonly repeats: ReadonlyArray<DirectRepeat>;
};
type DirectTextTarget = { readonly node: Text; readonly residue: SsrDataResidue; item: unknown };
type DirectRowRecord = {
	c?: () => void;
	readonly root: Element;
	item: unknown;
	readonly textTargets: DirectTextTarget[];
	readonly classTargets: ReadonlyArray<Element | undefined>;
	readonly eventTargets: ReadonlyArray<Element | undefined>;
	readonly handleTargets: ReadonlyArray<Element | undefined>;
	readonly behaviorTargets: ReadonlyArray<Element | undefined>;
	removed: boolean;
	cleanups: Array<() => void>;
};
type DirectRepeatState = {
	readonly rows: Map<unknown, DirectRowRecord>;
	keys: ReadonlyArray<unknown>;
	classValues: ReadonlyArray<unknown>;
	classValue?: unknown;
};
// Row bookkeeping (delegation flag, per-row record) is stored on the element
// itself; DOM interfaces carry no index signature for those expandos.
type DirectExpandoElement = Record<string, unknown>;

export function isMarklessPublicThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}
export function attachMarklessPublicStaticEvents(
	root: Element,
	graph: DirectGraph,
	loadSymbolForEvent: DirectLoadSymbol,
	staticEvents: ReadonlyArray<
		readonly [ReadonlyArray<number>, string, ReadonlyArray<string>]
	>,
) {
	let debugRegistrations: Array<Promise<void>> | undefined;
	for (const [path, eventName, symbolIds] of staticEvents) {
		const element = nodeAtPath(root, path);
		if (!element?.addEventListener) continue;
		element.addEventListener(eventName, async (event) => {
			for (const symbolId of symbolIds) {
				const loaded = loadSymbolForEvent(symbolId);
				const symbol = isMarklessPublicThenable(loaded) ? await loaded : loaded;
				const value = symbol({ graph, event, element, getElementHandle: () => undefined });
				if (isMarklessPublicThenable(value)) await value;
			}
			graph.flush();
		});
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__) {
			const rootRef = new WeakRef(root),
				elementRef = new WeakRef(element);
			(debugRegistrations ??= []).push(
				import('../debug-channel.ts')
					.then((debug) => {
						const liveRoot = rootRef.deref(),
							liveElement = elementRef.deref();
						if (!liveRoot || !liveElement) return;
						debug.__marklessDebugStartContainer(liveRoot, 'csr');
						debug.__marklessDebugRecordInteraction(liveRoot, liveElement, eventName, {
							kind: 'direct-csr',
							source: 'static-event',
						});
					})
					.catch(() => {}),
			);
		}
	}
	return typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
		? Promise.all(debugRegistrations ?? [])
		: undefined;
}
export function nodeAtPath(
	root: Node | null | undefined,
	path: ReadonlyArray<number>,
): Element | undefined {
	let node: Node | null | undefined = root;
	for (const index of path) {
		node = node?.childNodes?.[index];
		if (!node) return undefined;
	}
	// Chunk coordinates address element hosts; the text-slot path lands on a
	// placeholder node and uses only members Element shares with it.
	return node as Element | undefined;
}

// Parses each compiler-emitted chunk once, then does work only for declared
// slots and repeat rows. Static element structure is always created by the
// browser's template parser and cloneNode, never by a structural JS walk.
export function createMarklessDirectChunkRenderer(renderData: DirectRenderData) {
	const chunks = new Map<string, DirectChunk>(
		renderData.chunks.map((chunk) => [chunk.id, chunk]),
	);
	const templates = new Map<string, HTMLTemplateElement>();

	function cloneChunk(chunkId: string): DirectClonedChunk {
		const chunk = chunks.get(chunkId);
		if (!chunk) throw new Error(`Missing Markless render chunk ${chunkId}.`);
		let template = templates.get(chunkId);
		if (!template) {
			template = document.createElement('template');
			template.innerHTML = chunk.statics.join('');
			templates.set(chunkId, template);
		}
		return { chunk, content: template.content.cloneNode(true) as DocumentFragment };
	}

	return function renderMarklessDirectChunk(graph: DirectGraph, loadSymbol: DirectLoadSymbol) {
		const rootClone = cloneChunk(renderData.rootChunkId);
		const rootTextTargets = installChunkTextSlots(rootClone.content, rootClone.chunk, graph);
		const root = rootClone.content.firstElementChild;
		if (!root) throw new Error('Missing render root.');
		const symbolCache = new Map<string, DirectSymbol | Promise<DirectSymbol>>();
		const repeatStates: DirectRepeatState[] = renderData.repeats.map(() => ({
			rows: new Map(),
			keys: [],
			classValues: [],
		}));

		const loadDirectSymbol: DirectLoadSymbol = (symbolId) => {
			// The has() guard above is the presence check for this read.
			if (symbolCache.has(symbolId)) return symbolCache.get(symbolId)!;
			const loaded = loadSymbol(symbolId);
			symbolCache.set(symbolId, loaded);
			if (isMarklessPublicThenable(loaded)) {
				const pending = loaded.then((symbol) => {
					symbolCache.set(symbolId, symbol);
					return symbol;
				});
				symbolCache.set(symbolId, pending);
				return pending;
			}
			return loaded;
		};

		const sync = () => {
			patchChunkTextSlots(rootTextTargets, graph);
			for (let index = 0; index < renderData.repeats.length; index++) {
				syncDirectRepeat(
					root,
					graph,
					loadDirectSymbol,
					renderData.repeats[index],
					repeatStates[index],
					index,
					cloneChunk,
					sync,
				);
			}
		};

		attachDirectChunkEvents(root, graph, loadDirectSymbol, renderData.events, sync);
		sync();
		graph.flush();
		return root;
	};
}

function installChunkTextSlots(
	content: DocumentFragment,
	chunk: DirectChunk,
	graph: DirectGraph,
	item?: unknown,
) {
	const targets: DirectTextTarget[] = [];
	for (const slot of chunk.slots) {
		if (slot.kind !== 'text') continue;
		const anchor = nodeAtPath(content, slot.coordinate.path);
		if (!anchor) continue;
		const text = document.createTextNode('');
		anchor.replaceWith(text);
		targets.push({ node: text, residue: slot.residue, item });
	}
	patchChunkTextSlots(targets, graph);
	return targets;
}

function patchChunkTextSlots(targets: ReadonlyArray<DirectTextTarget>, graph: DirectGraph) {
	for (const target of targets) {
		target.node.nodeValue = stringifyMarklessPublicValue(
			readDirectChunkResidue(target.residue, graph, target.item),
		);
	}
}

function readDirectChunkResidue(residue: SsrDataResidue, graph: DirectGraph, item: unknown) {
	if (residue.kind === 'graph-read') return graph.read(residue.graphNodeId, residue.path);
	if (residue.kind === 'repeat-item') return readMarklessPublicPath(item, residue.path);
	return undefined;
}

function attachDirectChunkEvents(
	root: Element,
	graph: DirectGraph,
	loadSymbol: DirectLoadSymbol,
	events: ReadonlyArray<DirectEventRecord>,
	sync: () => void,
) {
	let debugRegistrations: Array<Promise<void>> | undefined;
	for (const eventRecord of events) {
		const element = nodeAtPath(root, eventRecord.hostPath);
		if (!element?.addEventListener) continue;
		element.addEventListener(eventRecord.eventName, async (event) => {
			for (const symbolId of eventRecord.symbolIds) {
				const loaded = loadSymbol(symbolId);
				const symbol = isMarklessPublicThenable(loaded) ? await loaded : loaded;
				const value = symbol({ graph, event, element, getElementHandle: () => undefined });
				if (isMarklessPublicThenable(value)) await value;
				sync();
			}
			graph.flush();
		});
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__) {
			const rootRef = new WeakRef(root),
				elementRef = new WeakRef(element);
			(debugRegistrations ??= []).push(
				import('../debug-channel.ts')
					.then((debug) => {
						const liveRoot = rootRef.deref(),
							liveElement = elementRef.deref();
						if (!liveRoot || !liveElement) return;
						debug.__marklessDebugStartContainer(liveRoot, 'csr');
						debug.__marklessDebugRecordInteraction(
							liveRoot,
							liveElement,
							eventRecord.eventName,
							{ kind: 'direct-csr', source: 'static-event' },
						);
					})
					.catch(() => {}),
			);
		}
	}
	return typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
		? Promise.all(debugRegistrations ?? [])
		: undefined;
}

function syncDirectRepeat(
	root: Element,
	graph: DirectGraph,
	loadSymbol: DirectLoadSymbol,
	repeat: DirectRepeat,
	state: DirectRepeatState,
	repeatIndex: number,
	cloneChunk: DirectCloneChunk,
	sync: () => void,
) {
	const parent = nodeAtPath(root, repeat.parentPath);
	if (!parent?.replaceChildren) return;
	attachDirectRepeatEvents(parent, graph, loadSymbol, repeat, state, repeatIndex, sync);
	const collectionDirty = graph.isDirty?.(repeat.collectionGraphNodeId) ?? true;
	const nextClassValues = repeat.classWrites.map((write) =>
		graph.read(write.stateGraphNodeId, write.statePath),
	);
	const classDirty = repeat.classWrites.some((write) => graph.isDirty?.(write.stateGraphNodeId));
	if (!collectionDirty && state.keys.length > 0) {
		if (classDirty) patchDirectRepeatClasses(repeat, state, nextClassValues);
		state.classValues = nextClassValues;
		return;
	}

	const collection = graph.read(repeat.collectionGraphNodeId, repeat.collectionPath);
	const items: ReadonlyArray<unknown> = Array.isArray(collection)
		? collection
		: Array.from((collection ?? []) as Iterable<unknown>);
	if (items.length === 0) {
		clearDirectRepeat(parent, state);
		if (repeat.emptyChunkId) {
			const empty = cloneChunk(repeat.emptyChunkId);
			installChunkTextSlots(empty.content, empty.chunk, graph);
			parent.replaceChildren(empty.content);
		}
		return;
	}

	const hadRows = state.keys.length > 0;
	const nextKeys: unknown[] = [];
	const seenKeys = new Set<unknown>();
	const newRows = document.createDocumentFragment();
	let reusedRows = 0;
	let canAppend = hadRows && state.keys.length < items.length;
	for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
		const item = items[itemIndex];
		const key = readMarklessPublicPath(item, repeat.keyPath);
		assertUniqueMarklessPublicRepeatKey(
			seenKeys,
			repeat.repeatId,
			repeat.itemName,
			repeat.keyPath,
			key,
		);
		if (canAppend && itemIndex < state.keys.length && state.keys[itemIndex] !== key) {
			canAppend = false;
		}
		nextKeys.push(key);
		let record = state.rows.get(key);
		if (!record) {
			record = createDirectRepeatRecord(repeat, item, cloneChunk(repeat.rowChunkId), graph);
			state.rows.set(key, record);
			patchDirectRepeatRecord(repeat, record, nextClassValues, true);
			markDirectRepeatEvents(repeat, record, repeatIndex);
			attachDirectRepeatBehaviors(repeat, record, graph, loadSymbol);
			newRows.appendChild(record.root);
		} else {
			reusedRows++;
			if (record.item !== item) {
				record.item = item;
				for (const target of record.textTargets) target.item = item;
				patchChunkTextSlots(record.textTargets, graph);
				patchDirectRepeatRecord(repeat, record, nextClassValues, false);
			}
		}
	}

	if (!hadRows) {
		if (parent.childNodes?.length === 0 && parent.appendChild) parent.appendChild(newRows);
		else parent.replaceChildren(newRows);
	} else if (parent.childNodes?.length === 0) {
		replaceMarklessPublicRows(parent, state, nextKeys);
	} else if (canAppend) {
		parent.appendChild?.(newRows);
	} else if (reusedRows === 0) {
		parent.replaceChildren(newRows);
	} else if (
		!sameMarklessPublicKeys(state.keys, nextKeys) &&
		!removeMarklessPublicMissingKey(parent, state, nextKeys) &&
		!swapMarklessPublicRows(parent, state, nextKeys)
	) {
		replaceMarklessPublicRows(parent, state, nextKeys);
	}
	if (state.rows.size !== nextKeys.length) pruneMarklessPublicRows(state, nextKeys);
	if (hadRows && classDirty) patchDirectRepeatClasses(repeat, state, nextClassValues);
	state.classValues = nextClassValues;
	state.keys = nextKeys;
}

function createDirectRepeatRecord(
	repeat: DirectRepeat,
	item: unknown,
	cloned: DirectClonedChunk,
	graph: DirectGraph,
) {
	const textTargets = installChunkTextSlots(cloned.content, cloned.chunk, graph, item);
	const root = cloned.content.firstElementChild;
	if (!root) throw new Error('Markless repeat chunk did not create a row element.');
	// `c` is assigned right after so the cleanup closure can capture the record.
	const record: DirectRowRecord = {
		root,
		item,
		textTargets,
		classTargets: repeat.classWrites.map((write) => nodeAtPath(root, write.hostPath)),
		eventTargets: repeat.eventControls.map((event) => nodeAtPath(root, event.hostPath)),
		handleTargets: (repeat.rowElementHandles ?? []).map((handle) =>
			nodeAtPath(root, handle.hostPath),
		),
		behaviorTargets: (repeat.rowBehaviors ?? []).map((behavior) =>
			nodeAtPath(root, behavior.hostPath),
		),
		removed: false,
		cleanups: [],
	};
	record.c = () => cleanupDirectRepeatRecord(record);
	return record;
}

function patchDirectRepeatRecord(
	repeat: DirectRepeat,
	record: DirectRowRecord,
	classValues: ReadonlyArray<unknown>,
	initial: boolean,
) {
	repeat.classWrites.forEach((write, index) => {
		const target = record.classTargets[index];
		const stateValue = classValues[index];
		const itemValue = readMarklessPublicPath(record.item, write.itemPath);
		if (write.falseClass === '' && stateValue !== itemValue) return;
		const value = stateValue === itemValue ? write.trueClass : write.falseClass;
		if (!initial && target?.getAttribute?.('class') === value) return;
		target?.setAttribute?.('class', value);
	});
}

function patchDirectRepeatClasses(
	repeat: DirectRepeat,
	state: DirectRepeatState,
	classValues: ReadonlyArray<unknown>,
) {
	repeat.classWrites.forEach((write, index) => {
		const previous = state.classValues[index];
		const next = classValues[index];
		if (previous === next) return;
		for (const record of state.rows.values()) {
			const itemValue = readMarklessPublicPath(record.item, write.itemPath);
			if (itemValue !== previous && itemValue !== next) continue;
			const value = next === itemValue ? write.trueClass : write.falseClass;
			record.classTargets[index]?.setAttribute?.('class', value);
		}
	});
}

function markDirectRepeatEvents(
	repeat: DirectRepeat,
	record: DirectRowRecord,
	repeatIndex: number,
) {
	repeat.eventControls.forEach((_event, eventIndex) => {
		const target = record.eventTargets[eventIndex];
		if (target)
			(target as unknown as DirectExpandoElement)[
				`__marklessDirectRepeat${repeatIndex}Event${eventIndex}`
			] = record;
	});
}

function attachDirectRepeatEvents(
	parent: Element,
	graph: DirectGraph,
	loadSymbol: DirectLoadSymbol,
	repeat: DirectRepeat,
	state: DirectRepeatState,
	repeatIndex: number,
	sync: () => void,
) {
	const marker = `__marklessDirectRepeat${repeatIndex}Delegated`;
	if ((parent as unknown as DirectExpandoElement)[marker] || !parent.addEventListener) return;
	(parent as unknown as DirectExpandoElement)[marker] = true;
	const eventNames = new Set(repeat.eventControls.map((event) => event.eventName));
	for (const eventName of eventNames) {
		parent.addEventListener(eventName, async (event) => {
			// One row host's handler entries are one listener list, and this single
			// delegated listener is the only one the DOM sees: stopImmediatePropagation
			// leaves no flag to read here, so the call itself is what ends the list.
			let stopped = false;
			const host = event as unknown as Record<string, unknown>;
			const native = host.stopImmediatePropagation as (...args: unknown[]) => unknown;
			host.stopImmediatePropagation = (...args: unknown[]) => {
				stopped = true;
				return native.apply(event, args);
			};
			try {
				let target: Node | null = event.target as Node | null;
				while (target && target !== parent) {
					let ran = false;
					for (let eventIndex = 0; eventIndex < repeat.eventControls.length; eventIndex++) {
						const eventControl = repeat.eventControls[eventIndex];
						if (eventControl.eventName !== eventName) continue;
						const record = (target as unknown as DirectExpandoElement)[
							`__marklessDirectRepeat${repeatIndex}Event${eventIndex}`
						] as DirectRowRecord | undefined;
						if (!record || record.removed) continue;
						const loaded = loadSymbol(eventControl.symbolId);
						const symbol = isMarklessPublicThenable(loaded) ? await loaded : loaded;
						const value = symbol({
							graph,
							event,
							element: target,
							getElementHandle: () => undefined,
							locals: { [eventControl.itemContext.itemName]: record.item },
						});
						if (isMarklessPublicThenable(value)) await value;
						ran = true;
						if (stopped) break;
					}
					if (ran) {
						sync();
						graph.flush();
						return;
					}
					target = target.parentElement || target.parentNode;
				}
			} finally {
				host.stopImmediatePropagation = native;
			}
		});
	}
}

async function attachDirectRepeatBehaviors(
	repeat: DirectRepeat,
	record: DirectRowRecord,
	graph: DirectGraph,
	loadSymbol: DirectLoadSymbol,
) {
	await Promise.resolve();
	if (record.removed) return;
	const rowBehaviors = repeat.rowBehaviors ?? [];
	for (let index = 0; index < rowBehaviors.length; index++) {
		const behavior = rowBehaviors[index];
		const loaded = loadSymbol(behavior.symbolId);
		const symbol = isMarklessPublicThenable(loaded) ? await loaded : loaded;
		if (record.removed) return;
		const cleanup = await symbol({
			graph,
			element: record.behaviorTargets[index],
			getElementHandle: (id) => {
				const handleIndex = (repeat.rowElementHandles ?? []).findIndex(
					(handle) => handle.handleId === id || handle.name === id,
				);
				return record.handleTargets[handleIndex];
			},
			behaviorInputs: behavior.inputPaths.map((path) =>
				readMarklessPublicPath(record.item, path),
			),
		});
		if (typeof cleanup === 'function') {
			if (record.removed) (cleanup as () => void)();
			else record.cleanups.push(cleanup as () => void);
		}
	}
}

function clearDirectRepeat(parent: Element, state: DirectRepeatState) {
	parent.replaceChildren();
	for (const record of state.rows.values()) cleanupDirectRepeatRecord(record);
	state.rows.clear();
	state.keys = [];
	state.classValues = [];
}

function cleanupDirectRepeatRecord(record: DirectRowRecord) {
	if (record.removed) return;
	record.removed = true;
	for (const cleanup of [...record.cleanups].reverse()) cleanup();
	record.cleanups = [];
}
export function readMarklessPublicPath(
	value: unknown,
	path: ReadonlyArray<string | number>,
): unknown {
	let current = value;
	for (const key of path)
		current = (current as Readonly<Record<string | number, unknown>> | null | undefined)?.[key];
	return current;
}
export function writeMarklessPublicPath(
	value: unknown,
	path: ReadonlyArray<string>,
	nextValue: unknown,
): unknown {
	if (path.length === 0) return nextValue;
	const root: Record<string, unknown> =
		value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	let current = root;
	for (const key of path.slice(0, -1)) {
		if (!current[key] || typeof current[key] !== 'object') current[key] = {};
		current = current[key] as Record<string, unknown>;
	}
	current[path[path.length - 1]] = nextValue;
	return root;
}
export function writeMarklessPublicDirtyArrayIndexes(
	dirtyArrayIndexes: Map<string, ReadonlyArray<number>>,
	graphNodeId: string,
	previousValue: unknown,
	nextValue: unknown,
	path: ReadonlyArray<string>,
) {
	if (
		path.length !== 0 ||
		!Array.isArray(previousValue) ||
		!Array.isArray(nextValue) ||
		previousValue.length !== nextValue.length
	) {
		dirtyArrayIndexes.delete(graphNodeId);
		return;
	}
	const indexes: number[] = [];
	for (let index = 0; index < nextValue.length; index++)
		if (previousValue[index] !== nextValue[index]) indexes.push(index);
	dirtyArrayIndexes.set(graphNodeId, indexes);
}
export function stringifyMarklessPublicValue(value: unknown) {
	return value == null ? '' : String(value);
}
export function sameMarklessPublicKeys(
	previous: ReadonlyArray<unknown>,
	next: ReadonlyArray<unknown>,
) {
	if (previous.length !== next.length) return false;
	for (let index = 0; index < next.length; index++)
		if (previous[index] !== next[index]) return false;
	return true;
}
export function replaceMarklessPublicRows(
	parent: Element,
	state: DirectRepeatState,
	keys: ReadonlyArray<unknown>,
) {
	const fragment = document.createDocumentFragment();
	for (const key of keys) {
		const record = state.rows.get(key);
		if (record) fragment.appendChild(record.root);
	}
	parent.replaceChildren(fragment);
}
export function pruneMarklessPublicRows(
	state: DirectRepeatState,
	keys: ReadonlyArray<unknown>,
) {
	const retainedKeys = new Set(keys);
	for (const [key, record] of state.rows)
		if (!retainedKeys.has(key)) {
			record.c?.();
			state.rows.delete(key);
		}
}
export function assertUniqueMarklessPublicRepeatKey(
	seenKeys: Set<unknown>,
	repeatId: string,
	itemName: string,
	keyPath: ReadonlyArray<string>,
	key: unknown,
) {
	if (seenKeys.has(key))
		throw duplicateMarklessPublicRepeatKeyError(repeatId, itemName, keyPath, key);
	seenKeys.add(key);
}
export function duplicateMarklessPublicRepeatKeyError(
	repeatId: string,
	itemName: string,
	keyPath: ReadonlyArray<string>,
	key: unknown,
) {
	const source = `${itemName}.${keyPath.join('.')}`;
	const keyText = JSON.stringify(key);
	const message = `MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key ${keyText} from ${source}.`;
	const error = new Error(message) as Error & Record<string, unknown>;
	Object.defineProperty(error, 'message', {
		value: message,
		enumerable: true,
		configurable: true,
	});
	error.name = 'KeyedRepeatRuntimeError';
	error.code = 'MARKLESS_REPEAT_KEY_DUPLICATE';
	error.severity = 'error';
	error.phase = 'runtime';
	error.repeatId = repeatId;
	error.keyPath = keyPath;
	error.collidingValue = key;
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE';
	return error;
}
export function clearMarklessPublicRows(parent: Element, state: DirectRepeatState) {
	if (parent.replaceChildren) parent.replaceChildren();
	else parent.textContent = '';
	state.rows.clear();
	state.keys = [];
	state.classValues = [];
}
export function clearMarklessPublicSingleClassRows(parent: Element, state: DirectRepeatState) {
	if (parent.replaceChildren) parent.replaceChildren();
	else parent.textContent = '';
	state.rows.clear();
	state.keys = [];
	state.classValue = undefined;
}
export function removeMarklessPublicMissingKey(
	parent: Element,
	state: DirectRepeatState,
	nextKeys: ReadonlyArray<unknown>,
) {
	if (state.keys.length !== nextKeys.length + 1) return false;
	let missingKey: unknown;
	let nextIndex = 0;
	for (const key of state.keys) {
		if (nextKeys[nextIndex] === key) {
			nextIndex++;
			continue;
		}
		if (missingKey !== undefined) return false;
		missingKey = key;
	}
	if (missingKey === undefined || nextIndex !== nextKeys.length) return false;
	const record = state.rows.get(missingKey);
	if (!record) return false;
	if (record.root.remove) record.root.remove();
	else parent.removeChild?.(record.root);
	record.c?.();
	state.rows.delete(missingKey);
	return true;
}
export function swapMarklessPublicRows(
	parent: Element,
	state: DirectRepeatState,
	nextKeys: ReadonlyArray<unknown>,
) {
	if (state.keys.length !== nextKeys.length) return false;
	let firstIndex = -1;
	let secondIndex = -1;
	for (let index = 0; index < nextKeys.length; index++) {
		if (state.keys[index] === nextKeys[index]) continue;
		if (firstIndex < 0) {
			firstIndex = index;
			continue;
		}
		if (secondIndex >= 0) return false;
		secondIndex = index;
	}
	if (secondIndex < 0) return false;
	if (
		state.keys[firstIndex] !== nextKeys[secondIndex] ||
		state.keys[secondIndex] !== nextKeys[firstIndex]
	)
		return false;
	const first = state.rows.get(state.keys[firstIndex]);
	const second = state.rows.get(state.keys[secondIndex]);
	if (!first || !second || !parent.insertBefore) return false;
	const afterSecond = second.root.nextSibling;
	parent.insertBefore(second.root, first.root);
	if (afterSecond) parent.insertBefore(first.root, afterSecond);
	else parent.appendChild?.(first.root);
	return true;
}
