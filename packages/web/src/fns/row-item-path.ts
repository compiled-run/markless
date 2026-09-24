type RowItemPathContext = {
	readonly graph: { read(graphNodeId: string, path?: ReadonlyArray<string>): unknown };
	readonly locals?: Readonly<Record<string, unknown>>;
};

/**
 * The graph path of a keyed row's own element, for a write through the row item
 * (`row.done = true`). The item the row was dispatched with is found by identity,
 * then by its key, so a write lands on the element the row renders wherever the
 * collection has moved it since.
 */
export function marklessRowItemPath(
	context: RowItemPathContext,
	graphNodeId: string,
	collectionPath: ReadonlyArray<string>,
	itemName: string,
	keyPath: ReadonlyArray<string> | null,
	itemPath: ReadonlyArray<string>,
): string[] {
	const collection = context.graph.read(graphNodeId, collectionPath);
	const item = context.locals?.[itemName];
	const items = Array.isArray(collection) ? collection : [];
	let index = items.indexOf(item);
	if (index < 0 && keyPath && item != null) {
		const key = readPath(item, keyPath);
		index = items.findIndex((candidate) => readPath(candidate, keyPath) === key);
	}
	if (index < 0) {
		throw Object.assign(
			new Error(`The row item "${itemName}" is no longer in the list it was rendered from.`),
			{ code: 'MARKLESS_ROW_ITEM_MISSING', graphNodeId },
		);
	}
	return [...collectionPath, String(index), ...itemPath];
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = value;
	for (const segment of path) {
		if (cursor == null) return undefined;
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return cursor;
}
