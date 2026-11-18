import {
	marklessComposedGraphNodeId,
	marklessInstancePath,
	marklessInstanceSegments,
	marklessPageSpaceId,
	type MarklessWidgetRegistry,
} from './instance-scope.ts';

type RowBoundRow = {
	readonly instancePath?: string;
	readonly rowPieces?: ReadonlyArray<
		readonly [hostSegment: string, instanceSegment: string, rows: number]
	>;
};

/**
 * A bound row inside a keyed repeat, placed in the row the dispatching record sits in.
 *
 * The row's id names only its component edges; the record's host path names the
 * rows. Host ids spell each edge by its place among its parent's edges and
 * instance paths by module edge and projection, so the two are matched edge by
 * edge from the end, and a host path the row's edges do not describe leaves the
 * build-time path as it was.
 */
export function marklessRowBoundPath(
	bound: RowBoundRow,
	graph: { readonly marklessRowHostPath?: string } | undefined,
): string {
	const path = bound.instancePath ?? '';
	const host = graph?.marklessRowHostPath;
	if (!host || !bound.rowPieces) return path;
	const segments = marklessInstanceSegments(host);
	let at = segments.length;
	// Rows past the last edge belong to the part's own repeats.
	while (segments[at - 1]?.startsWith('r:')) at -= 1;
	let rowed = '';
	let spelled = 0;
	for (let index = bound.rowPieces.length - 1; index >= 0; index -= 1) {
		const [hostSegment, instanceSegment, rows] = bound.rowPieces[index]!;
		if (segments[--at] !== hostSegment) return path;
		let rowSegments = '';
		for (let row = 0; row < rows; row += 1) {
			const segment = segments[--at];
			if (!segment?.startsWith('r:')) return path;
			rowSegments = segment + rowSegments;
		}
		rowed = rowSegments + instanceSegment + rowed;
		spelled += instanceSegment.length;
	}
	return rowed + path.slice(spelled);
}

/**
 * The id a bound row's callback prop answers to, in the row the dispatch sits in.
 *
 * The callback was written by a component this row's edges pass through, so its
 * row-free path is a prefix of the row's own; the rows above that component's
 * edge are the ones its captures were rendered with.
 */
export function marklessRowBoundCallbackId(
	bound: RowBoundRow,
	graph:
		| { readonly marklessRowHostPath?: string; readonly marklessInstancePath?: string }
		| undefined,
	callbackSymbolId: string,
): string {
	const outer = graph?.marklessInstancePath ?? '';
	const callbackPath = marklessInstancePath(callbackSymbolId);
	// Rows ending the composer's own path are its @for rows, which own no nodes: the row item reaches the callback as a local.
	if (!callbackPath) return outer.replace(/(r:[^:]*:)+$/, '') + callbackSymbolId;
	const rowed = outer.includes('r:') ? '' : marklessRowBoundPath(bound, graph);
	if (!rowed.includes('r:')) return outer + callbackSymbolId;
	let rowFree = '';
	let withRows = '';
	for (const segment of marklessInstanceSegments(rowed)) {
		if (rowFree === callbackPath) break;
		withRows += segment;
		if (!segment.startsWith('r:')) rowFree += segment;
	}
	return rowFree === callbackPath
		? outer + withRows + callbackSymbolId.slice(callbackPath.length)
		: outer + callbackSymbolId;
}

/**
 * The graph a callback's own keyed bound row runs on: the dispatching record's
 * row host path cut back to the pieces that row was placed by, so it reads its
 * rows from the instance that wrote it rather than from the part that called it.
 */
export function marklessRowBoundCallbackGraph<T extends { readonly marklessRowHostPath?: string }>(
	bound: RowBoundRow,
	graph: T,
	pieces: number,
): T {
	const host = graph?.marklessRowHostPath;
	if (!host || !bound.rowPieces) return graph;
	const segments = marklessInstanceSegments(host);
	let at = segments.length;
	while (segments[at - 1]?.startsWith('r:')) at -= 1;
	for (let index = bound.rowPieces.length - 1; index >= pieces; index -= 1) {
		const [hostSegment, , rows] = bound.rowPieces[index]!;
		if (segments[--at] !== hostSegment) return graph;
		for (let row = 0; row < rows; row += 1)
			if (!segments[--at]?.startsWith('r:')) return graph;
	}
	return { ...graph, marklessRowHostPath: segments.slice(0, at).join('') };
}

type RowLocalRoute = {
	readonly rowPiece?: number;
	readonly rows?: ReadonlyArray<{
		readonly rowIndex: number;
		readonly keyPath: ReadonlyArray<string>;
		readonly indexKey?: true;
		readonly graphNodeId?: string;
		readonly collectionPath?: ReadonlyArray<string>;
		readonly itemPath?: ReadonlyArray<string>;
	}>;
};

/**
 * The item of a keyed row a bound row's edge sits in, found by the keys the
 * dispatching record's path spells for that edge's rows: the outermost row's
 * item from the graph, each inner row's from the item around it.
 */
export function marklessRowLocal(
	bound: RowBoundRow,
	graph: {
		readonly marklessRowHostPath?: string;
		read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
	},
	route: RowLocalRoute,
): unknown {
	const keys = rowKeysOf(bound, graph.marklessRowHostPath, route.rowPiece ?? -1);
	let item: unknown;
	for (const step of route.rows ?? []) {
		const key = keys?.[step.rowIndex];
		if (key === undefined) return undefined;
		const collection = step.graphNodeId
			? graph.read(step.graphNodeId, step.collectionPath ?? [])
			: valueAt(item, step.itemPath ?? []);
		const items = collection == null ? [] : Array.from(collection as Iterable<unknown>);
		item = step.indexKey
			? items[Number(key)]
			: items.find((candidate) => String(valueAt(candidate, step.keyPath)) === key);
	}
	return item;
}

// The keys of one piece's rows, outermost first, matched edge by edge from the end as marklessRowBoundPath matches them.
function rowKeysOf(
	bound: RowBoundRow,
	host: string | undefined,
	piece: number,
): string[] | undefined {
	if (!host || !bound.rowPieces?.[piece]) return undefined;
	const segments = marklessInstanceSegments(host);
	let at = segments.length;
	while (segments[at - 1]?.startsWith('r:')) at -= 1;
	for (let index = bound.rowPieces.length - 1; index >= piece; index -= 1) {
		const [hostSegment, , rows] = bound.rowPieces[index]!;
		if (segments[--at] !== hostSegment) return undefined;
		const keys: string[] = [];
		for (let row = 0; row < rows; row += 1) {
			const segment = segments[--at];
			if (!segment?.startsWith('r:')) return undefined;
			keys.unshift(decodeURIComponent(segment.slice(2, -1)));
		}
		if (index === piece) return keys;
	}
	return undefined;
}

function valueAt(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;
	for (const key of path) current = current == null ? current : (current as Record<string, unknown>)[key];
	return current;
}

// Widget and page ids keep the row-free path: the dispatch's row scope and, when given, the widget registry place those.
export function marklessRowBoundGraphNodeId(
	graphNodeId: string,
	path: string,
	rowedPath: string,
	registry?: MarklessWidgetRegistry,
): string {
	if (!marklessPageSpaceId(graphNodeId)) return rowedPath + graphNodeId;
	return registry ? marklessComposedGraphNodeId(graphNodeId, path, registry) : path + graphNodeId;
}
