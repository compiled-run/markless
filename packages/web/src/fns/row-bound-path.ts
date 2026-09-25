import {
	marklessComposedGraphNodeId,
	marklessInstanceSegments,
	marklessPageSpaceId,
	type MarklessWidgetRegistry,
} from './instance-scope.ts';

type RowBoundRow = {
	readonly instancePath?: string;
	readonly rowPieces?: ReadonlyArray<readonly [hostSegment: string, instanceSegment: string, rows: number]>;
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
