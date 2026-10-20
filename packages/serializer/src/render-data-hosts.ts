/**
 * Render data names the elements of a chunk that something addresses (a handler,
 * an update, a handle, a list or arm anchor). Every other element is static text
 * in the chunk's markup that only has to be counted, so the compiler folds those
 * into `inertElements` and renderers walk the chunk in coordinate order with the
 * counts in between, which keeps DOM-order indexes exact.
 */

type Coordinate = { readonly coordinate: { readonly path: ReadonlyArray<number> } };

export type RenderDataChunkHosts<Host extends Coordinate, Slot extends Coordinate> = {
	readonly hosts: ReadonlyArray<Host>;
	readonly slots: ReadonlyArray<Slot>;
	/** Unaddressed elements before each host and slot in coordinate order, then after the last. */
	readonly inertElements?: ReadonlyArray<number>;
};

export type RenderDataChunkEntry<Host, Slot> =
	| { readonly kind: 'host'; readonly host: Host; readonly inertBefore: number }
	| { readonly kind: 'slot'; readonly slot: Slot; readonly inertBefore: number };

function compareRenderCoordinates(
	left: ReadonlyArray<number>,
	right: ReadonlyArray<number>,
): number {
	for (let index = 0; index < Math.min(left.length, right.length); index++) {
		const difference = left[index]! - right[index]!;
		if (difference !== 0) return difference;
	}
	return left.length - right.length;
}

/** The chunk's hosts and slots in document order (a parent before what it holds), each with the unaddressed elements before it. */
export function chunkCoordinateOrder<Host extends Coordinate, Slot extends Coordinate>(
	chunk: RenderDataChunkHosts<Host, Slot>,
): {
	readonly entries: ReadonlyArray<RenderDataChunkEntry<Host, Slot>>;
	readonly inertAfter: number;
} {
	const inert = chunk.inertElements;
	const entries = [
		...chunk.hosts.map((host) => ({
			path: host.coordinate.path,
			order: 0,
			host,
			slot: undefined,
		})),
		...chunk.slots.map((slot, order) => ({
			path: slot.coordinate.path,
			order: order + 1,
			host: undefined,
			slot,
		})),
	]
		.sort(
			(left, right) =>
				compareRenderCoordinates(left.path, right.path) || left.order - right.order,
		)
		.map((entry, index): RenderDataChunkEntry<Host, Slot> =>
			entry.host
				? { kind: 'host', host: entry.host, inertBefore: inert?.[index] ?? 0 }
				: { kind: 'slot', slot: entry.slot!, inertBefore: inert?.[index] ?? 0 },
		);
	return { entries, inertAfter: inert?.[entries.length] ?? 0 };
}
