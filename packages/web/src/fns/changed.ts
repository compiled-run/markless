/** A call that changed state in place: once it returns, each path it wrote is marked changed. */
export function marklessChanged<T>(
	graph: {
		read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
		changed(change: { readonly graphNodeId: string; readonly path: ReadonlyArray<string> }): void;
	},
	changes: ReadonlyArray<readonly [graphNodeId: string, path: ReadonlyArray<string>]>,
	result: T,
): T {
	for (const [graphNodeId, path] of changes) {
		const parent = path.slice(0, -1);
		// A changed array length is a change to the array, as a graph write of it is.
		const array = path.at(-1) === 'length' && Array.isArray(graph.read(graphNodeId, parent));
		graph.changed({ graphNodeId, path: array ? parent : path });
	}
	return result;
}
