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
