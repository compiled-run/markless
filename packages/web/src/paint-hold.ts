import type { PaintHoldInternals, PaintHoldPlane } from '@markless/runtime';

// Installed by the write watch, so a page that cannot save never downloads it.

/** `value` with fresh containers along `path` (and the value at `path` when `leaf`), so writing through them leaves `value` as it was. */
export function copyAlong(value: unknown, path: ReadonlyArray<string>, leaf = false): unknown {
	const end = leaf ? path.length : path.length - 1;
	if (end < 0) return value;
	const root = shallowCopy(value);
	let current = root;
	for (let at = 0; at < end && isObject(current); at++)
		current = current[path[at]!] = shallowCopy(current[path[at]!]);
	return root;
}

function shallowCopy(value: unknown): unknown {
	if (Array.isArray(value)) return value.slice();
	if (value instanceof Map) return new Map(value);
	if (value instanceof Set) return new Set(value);
	return isObject(value) ? Object.assign(Object.create(Object.getPrototypeOf(value)), value) : value;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** A graph's paint hold: a write `hold` answers true for keeps the state's earlier value on screen until it is released. */
export function createPaintHold(
	internals: PaintHoldInternals,
	hold: (graphNodeId: string, path: ReadonlyArray<string>) => boolean,
): PaintHoldPlane {
	const { cells, computedNodes, markDirtyPath, paint, read } = internals;
	// The earlier value of each held state; the cell holds the written one.
	const shownCells = new Map<string, unknown>();
	// What values derived while a state is shown paint, until no state is shown.
	const shownDerived = new Map<string, unknown>();
	let shownReaders: Set<string> | undefined;

	// Ends showing a state's earlier value; once none is shown, derived values paint what code reads again.
	const unshow = (graphNodeId: string): boolean => {
		if (!shownCells.delete(graphNodeId)) return false;
		shownReaders = undefined;
		if (shownCells.size === 0)
			for (const id of shownDerived.keys()) {
				shownDerived.delete(id);
				markDirtyPath(id, []);
			}
		return true;
	};
	const release = (graphNodeId: string): void => {
		if (unshow(graphNodeId)) markDirtyPath(graphNodeId, []);
	};

	return {
		shown(graphNodeId) {
			if (shownCells.has(graphNodeId)) return { value: shownCells.get(graphNodeId) };
			if (shownDerived.has(graphNodeId)) return { value: shownDerived.get(graphNodeId) };
		},
		// Computeds deriving from a shown state: code reads them afresh from the written values, paints from the cache.
		fresh(graphNodeId) {
			if (shownCells.size === 0) return false;
			if (!shownReaders) {
				const readers = (shownReaders = new Set());
				const dependents = internals.dependents();
				const visit = (id: string): void => {
					for (const [node, , isAsync] of dependents.get(id) ?? [])
						if (!isAsync && !readers.has(node.graphNodeId)) {
							readers.add(node.graphNodeId);
							visit(node.graphNodeId);
						}
				};
				for (const id of shownCells.keys()) visit(id);
			}
			return shownReaders.has(graphNodeId);
		},
		before(graphNodeId, path, leaf) {
			const held = !computedNodes.has(graphNodeId) && hold(graphNodeId, path);
			if (held && !shownCells.has(graphNodeId)) {
				shownCells.set(graphNodeId, cells.get(graphNodeId));
				shownReaders = undefined;
			}
			// While a state is shown, writes go through copies, so the shown value never changes under them.
			if (shownCells.has(graphNodeId)) cells.set(graphNodeId, copyAlong(cells.get(graphNodeId), path, leaf));
			return held;
		},
		// A write that is not held shows at once: one at a path, or an update, lands on the shown value too; a whole value ends the showing.
		after(graphNodeId, path, apply, whole) {
			if (path.length === 0) shownDerived.delete(graphNodeId);
			if (!shownCells.has(graphNodeId)) return;
			if (apply && (whole || path.length > 0))
				shownCells.set(graphNodeId, apply(copyAlong(shownCells.get(graphNodeId), path)));
			else unshow(graphNodeId);
		},
		release,
		end() {
			for (const graphNodeId of shownCells.keys()) release(graphNodeId);
		},
		showing: () => shownCells.size > 0,
		shows: (graphNodeId) => shownCells.has(graphNodeId) || shownDerived.has(graphNodeId),
		readShown: (graphNodeId, path) => paint(() => read(graphNodeId, path)),
		derived(graph, graphNodeId, value, run, skip) {
			const land = (painted: unknown) => {
				graph.write({ graphNodeId, value });
				if (painted === skip) return;
				if (shownCells.size > 0) shownDerived.set(graphNodeId, painted);
				else if (shownDerived.delete(graphNodeId)) markDirtyPath(graphNodeId, []);
			};
			const painted =
				shownCells.size > 0
					? run((base) => (id, path) => (shownCells.has(id) || shownDerived.has(id) ? paint(() => read(id, path)) : base(id, path)))
					: undefined;
			if (typeof (painted as PromiseLike<unknown> | null)?.then === 'function') return Promise.resolve(painted).then(land);
			land(painted);
		},
	};
}
