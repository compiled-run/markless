export function isMarklessPublicThenable(value) {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof value.then === 'function'
	);
}
export function attachMarklessPublicStaticEvents(root, graph, loadSymbolForEvent, staticEvents) {
	let debugRegistrations;
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
export function nodeAtPath(root, path) {
	let node = root;
	for (const index of path) {
		node = node?.childNodes?.[index];
		if (!node) return undefined;
	}
	return node;
}

// Parses each compiler-emitted chunk once, then does work only for declared
// slots and repeat rows. Static element structure is always created by the
// browser's template parser and cloneNode, never by a structural JS walk.
export function createMarklessDirectChunkRenderer(renderData) {
	const chunks = new Map(renderData.chunks.map((chunk) => [chunk.id, chunk]));
	const templates = new Map();

	function cloneChunk(chunkId) {
		const chunk = chunks.get(chunkId);
		if (!chunk) throw new Error(`Missing Markless render chunk ${chunkId}.`);
		let template = templates.get(chunkId);
		if (!template) {
			template = document.createElement('template');
			template.innerHTML = chunk.statics.join('');
			templates.set(chunkId, template);
		}
		return { chunk, content: template.content.cloneNode(true) };
	}

	return function renderMarklessDirectChunk(graph, loadSymbol) {
		const rootClone = cloneChunk(renderData.rootChunkId);
		const rootTextTargets = installChunkTextSlots(rootClone.content, rootClone.chunk, graph);
		const root = rootClone.content.firstElementChild;
		if (!root) throw new Error('Missing render root.');
		const symbolCache = new Map();
		const repeatStates = renderData.repeats.map(() => ({
			rows: new Map(),
			keys: [],
			classValues: [],
		}));

		const loadDirectSymbol = (symbolId) => {
			if (symbolCache.has(symbolId)) return symbolCache.get(symbolId);
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

function installChunkTextSlots(content, chunk, graph, item) {
	const targets = [];
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

function patchChunkTextSlots(targets, graph) {
	for (const target of targets) {
		target.node.nodeValue = stringifyMarklessPublicValue(
			readDirectChunkResidue(target.residue, graph, target.item),
		);
	}
}

function readDirectChunkResidue(residue, graph, item) {
	if (residue.kind === 'graph-read') return graph.read(residue.graphNodeId, residue.path);
	if (residue.kind === 'repeat-item') return readMarklessPublicPath(item, residue.path);
	return undefined;
}

function attachDirectChunkEvents(root, graph, loadSymbol, events, sync) {
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
	}
}

function syncDirectRepeat(root, graph, loadSymbol, repeat, state, repeatIndex, cloneChunk, sync) {
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
	const items = Array.isArray(collection) ? collection : Array.from(collection ?? []);
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
	const nextKeys = [];
	const seenKeys = new Set();
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

function createDirectRepeatRecord(repeat, item, cloned, graph) {
	const textTargets = installChunkTextSlots(cloned.content, cloned.chunk, graph, item);
	const root = cloned.content.firstElementChild;
	if (!root) throw new Error('Markless repeat chunk did not create a row element.');
	const record = {
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

function patchDirectRepeatRecord(repeat, record, classValues, initial) {
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

function patchDirectRepeatClasses(repeat, state, classValues) {
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

function markDirectRepeatEvents(repeat, record, repeatIndex) {
	repeat.eventControls.forEach((_event, eventIndex) => {
		const target = record.eventTargets[eventIndex];
		if (target) target[`__marklessDirectRepeat${repeatIndex}Event${eventIndex}`] = record;
	});
}

function attachDirectRepeatEvents(parent, graph, loadSymbol, repeat, state, repeatIndex, sync) {
	const marker = `__marklessDirectRepeat${repeatIndex}Delegated`;
	if (parent[marker] || !parent.addEventListener) return;
	parent[marker] = true;
	const eventNames = new Set(repeat.eventControls.map((event) => event.eventName));
	for (const eventName of eventNames) {
		parent.addEventListener(eventName, async (event) => {
			let target = event.target;
			while (target && target !== parent) {
				for (let eventIndex = 0; eventIndex < repeat.eventControls.length; eventIndex++) {
					const eventControl = repeat.eventControls[eventIndex];
					if (eventControl.eventName !== eventName) continue;
					const record = target[`__marklessDirectRepeat${repeatIndex}Event${eventIndex}`];
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
					sync();
					graph.flush();
					return;
				}
				target = target.parentElement || target.parentNode;
			}
		});
	}
}

async function attachDirectRepeatBehaviors(repeat, record, graph, loadSymbol) {
	await Promise.resolve();
	if (record.removed) return;
	for (let index = 0; index < (repeat.rowBehaviors ?? []).length; index++) {
		const behavior = repeat.rowBehaviors[index];
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
			if (record.removed) cleanup();
			else record.cleanups.push(cleanup);
		}
	}
}

function clearDirectRepeat(parent, state) {
	parent.replaceChildren();
	for (const record of state.rows.values()) cleanupDirectRepeatRecord(record);
	state.rows.clear();
	state.keys = [];
	state.classValues = [];
}

function cleanupDirectRepeatRecord(record) {
	if (record.removed) return;
	record.removed = true;
	for (const cleanup of [...record.cleanups].reverse()) cleanup();
	record.cleanups = [];
}
export function readMarklessPublicPath(value, path) {
	let current = value;
	for (const key of path) current = current?.[key];
	return current;
}
export function writeMarklessPublicPath(value, path, nextValue) {
	if (path.length === 0) return nextValue;
	const root = value && typeof value === 'object' ? value : {};
	let current = root;
	for (const key of path.slice(0, -1)) {
		if (!current[key] || typeof current[key] !== 'object') current[key] = {};
		current = current[key];
	}
	current[path[path.length - 1]] = nextValue;
	return root;
}
export function writeMarklessPublicDirtyArrayIndexes(
	dirtyArrayIndexes,
	graphNodeId,
	previousValue,
	nextValue,
	path,
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
	const indexes = [];
	for (let index = 0; index < nextValue.length; index++)
		if (previousValue[index] !== nextValue[index]) indexes.push(index);
	dirtyArrayIndexes.set(graphNodeId, indexes);
}
export function stringifyMarklessPublicValue(value) {
	return value == null ? '' : String(value);
}
export function sameMarklessPublicKeys(previous, next) {
	if (previous.length !== next.length) return false;
	for (let index = 0; index < next.length; index++)
		if (previous[index] !== next[index]) return false;
	return true;
}
export function replaceMarklessPublicRows(parent, state, keys) {
	const fragment = document.createDocumentFragment();
	for (const key of keys) {
		const record = state.rows.get(key);
		if (record) fragment.appendChild(record.root);
	}
	parent.replaceChildren(fragment);
}
export function pruneMarklessPublicRows(state, keys) {
	const retainedKeys = new Set(keys);
	for (const [key, record] of state.rows)
		if (!retainedKeys.has(key)) {
			record.c?.();
			state.rows.delete(key);
		}
}
export function assertUniqueMarklessPublicRepeatKey(seenKeys, repeatId, itemName, keyPath, key) {
	if (seenKeys.has(key))
		throw duplicateMarklessPublicRepeatKeyError(repeatId, itemName, keyPath, key);
	seenKeys.add(key);
}
export function duplicateMarklessPublicRepeatKeyError(repeatId, itemName, keyPath, key) {
	const source = `${itemName}.${keyPath.join('.')}`;
	const keyText = JSON.stringify(key);
	const message = `MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key ${keyText} from ${source}.`;
	const error = new Error(message);
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
export function clearMarklessPublicRows(parent, state) {
	if (parent.replaceChildren) parent.replaceChildren();
	else parent.textContent = '';
	state.rows.clear();
	state.keys = [];
	state.classValues = [];
}
export function clearMarklessPublicSingleClassRows(parent, state) {
	if (parent.replaceChildren) parent.replaceChildren();
	else parent.textContent = '';
	state.rows.clear();
	state.keys = [];
	state.classValue = undefined;
}
export function removeMarklessPublicMissingKey(parent, state, nextKeys) {
	if (state.keys.length !== nextKeys.length + 1) return false;
	let missingKey;
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
export function swapMarklessPublicRows(parent, state, nextKeys) {
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
