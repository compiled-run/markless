import type { SymbolResolverPlan } from '../../artifacts.ts';

type PublicGraphMethod = 'call' | 'delete';

export function publicGraphMethods(
	symbolResolver: SymbolResolverPlan,
): ReadonlySet<PublicGraphMethod> {
	const methods = new Set<PublicGraphMethod>();
	for (const symbol of symbolResolver.symbols) {
		if (symbol.kind !== 'event-handler') continue;
		for (const write of symbol.writes ?? []) {
			if (write.operation === 'call') methods.add('call');
			if (write.operation === 'delete') methods.add('delete');
		}
	}
	return methods;
}

export function emitCreatePublicGraph(
	methods: ReadonlySet<PublicGraphMethod>,
	stateEntries: string,
	options: { readonly trackArrayIndexes: boolean },
): string {
	const trackDirtyArrayIndexes = options.trackArrayIndexes;
	const optionalMethods = [
		methods.has('call')
			? `\t\tcall(call) { const target = readMarklessPublicPath(cells.get(call.graphNodeId), call.path ?? []); const method = target?.[call.method]; if (typeof method !== "function") throw new TypeError("Unsupported Markless public graph call."); dirtyGraphNodeIds.add(call.graphNodeId); ${trackDirtyArrayIndexes ? 'dirtyArrayIndexes.delete(call.graphNodeId); ' : ''}return method.apply(target, call.args ?? []); },`
			: null,
		methods.has('delete')
			? `\t\tdelete(deletion) { const path = deletion.path ?? []; if (path.length === 0) return false; const parent = readMarklessPublicPath(cells.get(deletion.graphNodeId), path.slice(0, -1)); if (!parent || typeof parent !== "object") return true; dirtyGraphNodeIds.add(deletion.graphNodeId); ${trackDirtyArrayIndexes ? 'dirtyArrayIndexes.delete(deletion.graphNodeId); ' : ''}return delete parent[path[path.length - 1]]; },`
			: null,
	].filter((method): method is string => method !== null);
	const trackDirtyArrayIndexesDeclaration = trackDirtyArrayIndexes
		? ['\tconst dirtyArrayIndexes = new Map();']
		: [];
	const trackDirtyArrayIndexesWrite = trackDirtyArrayIndexes
		? 'writeMarklessPublicDirtyArrayIndexes(dirtyArrayIndexes, write.graphNodeId, previousValue, write.value, path); '
		: '';
	const trackDirtyArrayIndexesUpdate = trackDirtyArrayIndexes
		? 'writeMarklessPublicDirtyArrayIndexes(dirtyArrayIndexes, update.graphNodeId, previousValue, nextValue, path); '
		: '';
	const trackDirtyArrayIndexesMethods = trackDirtyArrayIndexes
		? ['\t\tdirtyIndexes(graphNodeId) { return dirtyArrayIndexes.get(graphNodeId); },']
		: [];
	const trackDirtyArrayIndexesFlush = trackDirtyArrayIndexes ? ' dirtyArrayIndexes.clear();' : '';

	return [
		'function createMarklessPublicGraph() {',
		`\tconst cells = new Map(${stateEntries});`,
		'\tconst dirtyGraphNodeIds = new Set();',
		...trackDirtyArrayIndexesDeclaration,
		'\treturn {',
		'\t\tread(graphNodeId, path = []) { return readMarklessPublicPath(cells.get(graphNodeId), path); },',
		`\t\twrite(write) { const path = write.path ?? []; const previousValue = cells.get(write.graphNodeId); dirtyGraphNodeIds.add(write.graphNodeId); ${trackDirtyArrayIndexesWrite}cells.set(write.graphNodeId, writeMarklessPublicPath(previousValue, path, write.value)); },`,
		`\t\tupdate(update) { const path = update.path ?? []; const previousValue = cells.get(update.graphNodeId); const currentValue = readMarklessPublicPath(previousValue, path); const nextValue = update.update(currentValue); dirtyGraphNodeIds.add(update.graphNodeId); ${trackDirtyArrayIndexesUpdate}cells.set(update.graphNodeId, writeMarklessPublicPath(previousValue, path, nextValue)); if (update.returnValue === "previous") return currentValue; if (update.returnValue === "next") return nextValue; },`,
		...optionalMethods,
		'\t\tisDirty(graphNodeId) { return dirtyGraphNodeIds.has(graphNodeId); },',
		...trackDirtyArrayIndexesMethods,
		`\t\tflush() { dirtyGraphNodeIds.clear();${trackDirtyArrayIndexesFlush} },`,
		'\t};',
		'}',
	].join('\n');
}
