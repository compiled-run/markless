// A bound row is one (child symbol, component edge) pair. Its capture slots are
// the symbol's, and only the routes a prop takes differ from one edge to the
// next, so the resolver ships each symbol's slots once and each edge's routes
// once, and builds a row the first time a dispatch asks for it.

type JsonObject = Record<string, unknown>;
type JsonSlot = JsonObject & { readonly slotId: string; readonly route: JsonObject };
export type JsonBoundRow = JsonObject & {
	readonly id: string;
	readonly baseSymbolId: string;
	readonly loaderSymbolId?: string;
	readonly captureSlots: ReadonlyArray<JsonSlot>;
};

/** `[slotId, other slot fields, the route every edge gives it or 0]`. */
type SlotEntry = [string, JsonObject, JsonObject | 0];
/** `[id prefix, baseSymbolId, loaderSymbolId or 0, slot indexes]`. */
type SymbolEntry = [string, string, string | 0, number[]];
/** `[row fields, route componentEdgeId or 0, route componentEdgePath or 0, routes by slot index, symbol indexes]`. */
type EdgeEntry = [
	JsonObject,
	string | 0,
	ReadonlyArray<string> | 0,
	Record<number, JsonObject>,
	number[],
];
/** Edges are keyed by the edge half of the id; a nested child's rows on one edge carry their own instance path, so a key can hold several entries. */
export type BoundRowTables = [SlotEntry[], SymbolEntry[], Record<string, EdgeEntry[]>];

/** Emitted verbatim into a resolver module, so it reads nothing outside its arguments. */
export function decodeBoundRow(
	tables: BoundRowTables,
	cache: Map<string, unknown>,
	id: string,
): unknown {
	if (cache.has(id)) return cache.get(id);
	const [slots, symbols, edges] = tables;
	const at = id.indexOf(':', 6);
	const prefix = id.slice(0, at);
	const entries =
		at > 0 && Object.hasOwn(edges, id.slice(at + 1)) ? edges[id.slice(at + 1)]! : [];
	let row;
	for (const edge of entries) {
		const index = edge[4].find((candidate) => symbols[candidate]![0] === prefix);
		if (index === undefined) continue;
		const [, baseSymbolId, loaderSymbolId, slotIndexes] = symbols[index]!;
		row = {
			id,
			baseSymbolId,
			...(loaderSymbolId ? { loaderSymbolId } : {}),
			...edge[0],
			captureSlots: slotIndexes.map((slotIndex) => {
				const [slotId, fields, route] = slots[slotIndex]!;
				return {
					slotId,
					...fields,
					route: {
						...(route || edge[3][slotIndex]),
						...(edge[1] ? { componentEdgeId: edge[1] } : {}),
						...(edge[2] ? { componentEdgePath: edge[2] } : {}),
					},
				};
			}),
		};
		break;
	}
	cache.set(id, row);
	return row;
}

/**
 * The tables for `rows`, or `null` when some row does not have the
 * symbol-times-edge shape; every row is rebuilt from the tables and compared
 * before the tables are trusted.
 */
export function factorBoundRows(rows: ReadonlyArray<JsonBoundRow>): BoundRowTables | null {
	const slots: SlotEntry[] = [];
	const slotIndexes = new Map<string, number>();
	const slotRoutes = new Map<number, string | null>();
	const symbols: SymbolEntry[] = [];
	const symbolIndexes = new Map<string, number>();
	const edges: Record<string, EdgeEntry[]> = {};
	const unrouted = new Set<EdgeEntry>();
	for (const row of rows) {
		const at = row.id.indexOf(':', 6);
		if (!row.id.startsWith('bound:') || at < 0) return null;
		const prefix = row.id.slice(0, at);
		const suffix = row.id.slice(at + 1);
		const { id: _id, baseSymbolId, loaderSymbolId, captureSlots, ...fields } = row;
		const rowSlots: number[] = [];
		let edgeId: string | 0 | undefined;
		let edgePath: ReadonlyArray<string> | 0 | undefined;
		const routes: Record<number, JsonObject> = {};
		for (const slot of captureSlots) {
			const { slotId, route, ...slotFields } = slot;
			const { componentEdgeId, componentEdgePath, ...core } = route;
			const id = typeof componentEdgeId === 'string' ? componentEdgeId : 0;
			const path = Array.isArray(componentEdgePath) ? (componentEdgePath as string[]) : 0;
			if (edgeId === undefined) {
				edgeId = id;
				edgePath = path;
			} else if (edgeId !== id || JSON.stringify(edgePath) !== JSON.stringify(path))
				return null;
			let index = slotIndexes.get(slotId);
			if (index === undefined) {
				index = slots.length;
				slotIndexes.set(slotId, index);
				slots.push([slotId, slotFields, 0]);
			} else if (JSON.stringify(slots[index]![1]) !== JSON.stringify(slotFields)) return null;
			const coreJson = JSON.stringify(core);
			const seen = slotRoutes.get(index);
			slotRoutes.set(index, seen === undefined || seen === coreJson ? coreJson : null);
			routes[index] = core;
			rowSlots.push(index);
		}
		// The id spells the child-local symbol id, which two child modules can share.
		const symbolKey = `${prefix}\0${baseSymbolId}`;
		let symbol = symbolIndexes.get(symbolKey);
		if (symbol === undefined) {
			symbol = symbols.length;
			symbolIndexes.set(symbolKey, symbol);
			symbols.push([prefix, baseSymbolId, loaderSymbolId ?? 0, rowSlots]);
		} else {
			const known = symbols[symbol]!;
			if (known[1] !== baseSymbolId || known[2] !== (loaderSymbolId ?? 0)) return null;
			if (JSON.stringify(known[3]) !== JSON.stringify(rowSlots)) return null;
		}
		const entries = (edges[suffix] ??= []);
		const fieldsJson = JSON.stringify(fields);
		const edge = entries.find((entry) => JSON.stringify(entry[0]) === fieldsJson);
		if (!edge) {
			const created: EdgeEntry = [fields, edgeId ?? 0, edgePath ?? 0, routes, [symbol]];
			entries.push(created);
			if (edgeId === undefined) unrouted.add(created);
			continue;
		}
		if (edgeId !== undefined) {
			if (unrouted.delete(edge)) {
				edge[1] = edgeId;
				edge[2] = edgePath ?? 0;
			} else if (edge[1] !== edgeId || JSON.stringify(edge[2]) !== JSON.stringify(edgePath))
				return null;
		}
		for (const [index, core] of Object.entries(routes)) {
			const known = edge[3][Number(index)];
			if (known && JSON.stringify(known) !== JSON.stringify(core)) return null;
			edge[3][Number(index)] = core;
		}
		edge[4].push(symbol);
	}
	for (const [index, core] of slotRoutes) {
		if (core === null) continue;
		slots[index]![2] = JSON.parse(core) as JsonObject;
		for (const entries of Object.values(edges))
			for (const edge of entries) delete edge[3][index];
	}
	const tables: BoundRowTables = [slots, symbols, edges];
	const cache = new Map<string, unknown>();
	for (const row of rows) {
		if (canonical(decodeBoundRow(tables, cache, row.id)) !== canonical(row)) return null;
	}
	return tables;
}

function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, item: unknown) =>
		item && typeof item === 'object' && !Array.isArray(item)
			? Object.fromEntries(
					Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
				)
			: item,
	);
}
