import { ASYNC_PROTOCOL_VERSION, protocolInstanceQualifies } from '@markless/serializer';
import type { SymbolResolverModuleInput, SymbolResolverModuleManifest } from '../artifacts.ts';

const SMALL_SYMBOL_SWITCH_LIMIT = 3;

export function createSymbolResolverModuleManifest(
	input: SymbolResolverModuleInput,
): SymbolResolverModuleManifest {
	const moduleUrls: string[] = [];
	const exportNames: string[] = [];
	const moduleIndexes = new Map<string, number>();
	const exportIndexes = new Map<string, number>();
	const symbols: Record<string, readonly [moduleIndex: number, exportIndex: number]> = {};

	for (const symbol of input.symbols) {
		const moduleIndex = tableIndex(moduleIndexes, moduleUrls, symbol.chunk);
		const exportIndex = tableIndex(exportIndexes, exportNames, symbol.exportName);
		symbols[symbol.id] = [moduleIndex, exportIndex];
	}

	return [
		ASYNC_PROTOCOL_VERSION,
		input.buildId ?? null,
		input.resolverId ?? null,
		moduleUrls,
		exportNames,
		symbols,
	];
}

export function emitSymbolResolverModule(input: SymbolResolverModuleInput): string {
	const manifest = createSymbolResolverModuleManifest(input);
	if ((input.boundSymbols?.length ?? 0) === 0) {
		return input.symbols.length > 0 && input.symbols.length <= SMALL_SYMBOL_SWITCH_LIMIT
			? emitSmallSymbolResolverModule(input)
			: emitTableSymbolResolverModule(manifest);
	}
	const scopesInstances = (input.boundSymbols ?? []).some((row) => row.instancePath);
	// Which space an id belongs to is a runtime reading, not a prefix: a shared id
	// belongs to its widget root, a storage id to the page. Only a resolver that
	// binds a symbol reaching such an id imports that rule; the rest stay
	// self-contained on the plain instance prefix.
	const scopesWidgetGraphs =
		scopesInstances &&
		(input.symbols.some((symbol) => symbol.captureSymbol?.touchesPageSpaceGraph) ||
			(input.boundSymbols ?? []).some((row) =>
				row.captureSlots.some(
					(slot) =>
						slot.route.kind === 'graph-reference' &&
						protocolInstanceQualifies(slot.route.graphNodeId) === false,
				),
			));
	// A slot route reads its answering symbol id out of the graph, so only a page
	// whose parts actually escape a widget callback carries the extra branch.
	const routesCallbackSlots = (input.boundSymbols ?? []).some((row) =>
		row.captureSlots.some((slot) => slot.route.kind === 'callback-slot-route'),
	);
	return [
		...(scopesWidgetGraphs
			? [
					`import { marklessComposedGraphNodeId, marklessGraphWidgetRegistry } from '@markless/web/fns/instance-scope';`,
					'',
				]
			: []),
		...(routesCallbackSlots
			? [
					`import { marklessInvokeCallbackSlot } from '@markless/web/fns/callback-slot';`,
					'',
				]
			: []),
		'export const symbolManifest = ',
		JSON.stringify(manifest),
		';',
		'',
		'const moduleUrls = symbolManifest[3];',
		'const exportNames = symbolManifest[4];',
		'const symbolRows = symbolManifest[5];',
		`const boundRows = ${serializeBoundRows(input.boundSymbols ?? [])};`,
		'const callbackRoute = "callback-route";',
		'',
		'export async function loadSymbol(id) {',
		'	const bound = boundRows[id];',
		'	if (bound) return loadBoundSymbol(bound);',
		'	const row = symbolRows[id];',
		'	if (!row) throw createUnknownSymbolError(id);',
		'	return import(/* @vite-ignore */ moduleUrls[row[0]])',
		'		.then((mod) => {',
		'			runGeneratedSymbolChunkInitializers(mod);',
		'			return mod[exportNames[row[1]]];',
		'		});',
		'}',
		'',
		'async function loadBoundSymbol(bound) {',
		scopesInstances
			? '	const base = instanceScopedBase(await loadSymbol(bound.baseSymbolId), bound);'
			: '	const base = await loadSymbol(bound.baseSymbolId);',
		// The bundler's imported-capture adapter rewrites the next line verbatim.
		'	return (context) => base({ ...context, capture: createCaptureContext(context, bound) });',
		'}',
		'',
		...(scopesInstances ? instanceScopeLines(scopesWidgetGraphs) : []),
		'function createCaptureContext(context, bound) {',
		'	const slots = {};',
		'	for (const slot of bound.captureSlots) slots[slot.slotId] = slot;',
		'	return {',
		'		read(slotId) {',
		'			const slot = requiredCaptureSlot(slots, slotId);',
		'			const route = slot.route;',
		'			if (route.kind === "compiler-known-constant") return (slot.path ?? []).reduce((value, key) => value == null ? value : value[key], route.value);',
		'			if (route.kind === "graph-reference") return context.graph.read(route.graphNodeId, route.path ?? []);',
		'			throw new Error(`Capture slot ${slotId} is a callback route`);',
		'		},',
		'		invoke(slotId, args) {',
		'			const route = requiredCaptureSlot(slots, slotId).route;',
		// Two different things reach this fold, and only one of them is legitimate.
		// A valueless constant means the edge genuinely passed no callback for an
		// optional/guarded call site, so the call no-ops like `?.()`. A constant
		// that carries a VALUE means the claim never bound to a callback at all —
		// capture analysis refuses that build (`MARKLESS_CAPTURE_OPAQUE_PROP`), so
		// reaching it here proves the gate was bypassed and silently no-oping would
		// hide it. Assert instead of folding.
		'			if (route.kind === "compiler-known-constant") {',
		'				if (route.value === undefined) return undefined;',
		'				throw createUnbindableCaptureSlotError(slotId, route);',
		'			}',
		// The widget root wrote the answering symbol id into the slot's node, and the
		// part's own instance resolves that node the way it resolves its other reads.
		...(routesCallbackSlots
			? [
					'			if (route.kind === "callback-slot-route") return marklessInvokeCallbackSlot(context, route.graphNodeId, args);',
				]
			: []),
		'			if (route.kind !== callbackRoute) throw new Error(`Capture slot ${slotId} is not a callback route`);',
		'			if (typeof context.invokeSymbol !== "function") throw new Error("Bound callback invocation is unavailable");',
		'			return context.invokeSymbol(route.callbackSymbolId, { ...context, event: context.event, args });',
		'		},',
		'	};',
		'}',
		'',
		'function requiredCaptureSlot(slots, slotId) {',
		'	const slot = slots[slotId];',
		'	if (!slot) throw new Error(`Unknown capture slot ${slotId}`);',
		'	return slot;',
		'}',
		'',
		'function createUnbindableCaptureSlotError(slotId, route) {',
		'	return Object.assign(',
		'		new Error(`Capture slot ${slotId} invokes a value that is not a callback, so the build gate that refuses unbindable capture claims was bypassed.`),',
		'		{ code: "MARKLESS_CAPTURE_SLOT_UNBINDABLE", phase: "resume", slotId: String(slotId), value: route.value },',
		'	);',
		'}',
		'',
		'function runGeneratedSymbolChunkInitializers(mod) {',
		'	for (const name in mod) {',
		'		if (!name.startsWith("init__virtual_markless_symbol")) continue;',
		'		const init = mod[name];',
		'		if (typeof init === "function") init();',
		'	}',
		'}',
		'',
		'function createUnknownSymbolError(id) {',
		'	return Object.assign(new Error(`Unknown async symbol ${id}`), {',
		'		code: "MARKLESS_SYMBOL_UNKNOWN",',
		'		phase: "resume",',
		'		symbolId: String(id),',
		'		docsUrl: "https://markless.dev/errors/MARKLESS_SYMBOL_UNKNOWN",',
		'	});',
		'}',
		'',
	].join('\n');
}

// A composed child's graph nodes were merged into the page graph under the
// instance path of the edges it was composed through, but its own symbol still
// spells child-local ids. The parent's capture routes and the prop reads the
// capture adapter intercepts stay in page space.
function instanceScopeLines(widgetAware: boolean): string[] {
	// Which registry answers "does a widget own this id" is a property of the graph
	// being dispatched on, so the emitted closure hands its own graph over rather
	// than letting the runtime fall back to the per-dispatch `active` pointer. That
	// pointer is re-aimed per entry, so two containers whose async symbol bodies
	// interleave would otherwise read each other's rendered widgets.
	const scoped = (graphNodeId: string, registry: string) =>
		widgetAware ? `scoped(${graphNodeId}, ${registry})` : `scoped(${graphNodeId})`;
	return [
		'function instanceScopedBase(base, bound) {',
		'	const path = bound.instancePath;',
		'	if (!path) return base;',
		'	const pageSpace = new Set(bound.captureSlots.flatMap((slot) => slot.legacyGraphRead ? [slot.legacyGraphRead.graphNodeId] : []));',
		// A `shared:`/`storage:` id belongs to the page, and a widget-scoped one to
		// its widget root, not to the edge this row was bound through. The runtime
		// owns that reading; restating it here would put the write on a graph the
		// part's own records never read.
		widgetAware
			? '	const scoped = (graphNodeId, registry) => pageSpace.has(graphNodeId) ? graphNodeId : marklessComposedGraphNodeId(graphNodeId, path, registry);'
			: '	const scoped = (graphNodeId) => pageSpace.has(graphNodeId) ? graphNodeId : path + graphNodeId;',
		'	const scopeGraph = (graph) => {',
		// A graph-less context still has an answer: the runtime hands back the
		// `active` pointer, which is what an older payload's resolver read anyway.
		...(widgetAware ? ['		const registry = marklessGraphWidgetRegistry(graph);'] : []),
		`		const wrapped = { ...graph, read: (graphNodeId, readPath) => graph.read(${scoped('graphNodeId', 'registry')}, readPath) };`,
		'		for (const name of ["write", "update", "call", "delete", "subscribe"]) {',
		'			const method = graph[name];',
		`			if (typeof method === "function") wrapped[name] = (record) => method.call(graph, { ...record, graphNodeId: ${scoped('record.graphNodeId', 'registry')} });`,
		'		}',
		'		return wrapped;',
		'	};',
		'	return (context) => base({',
		'		...context,',
		'		graph: scopeGraph(context.graph),',
		`		...(context.read ? { read: (graphNodeId, readPath) => context.graph.read(${scoped('graphNodeId', 'marklessGraphWidgetRegistry(context.graph)')}, readPath) } : {}),`,
		'	});',
		'}',
		'',
	];
}

const OMITTED_EMPTY_BOUND_ROW_FIELDS = new Set([
	'ancestry',
	'path',
	'branchScopeIds',
	'keyedRepeatScopeIds',
]);

function serializeBoundRows(rows: SymbolResolverModuleInput['boundSymbols']): string {
	const serializedRows = (rows ?? []).map((row) => [
		row.id,
		{
			...row,
			ancestry: row.ancestry.map(({ componentEdgeId: _, ...entry }) => entry),
		},
	]);
	return JSON.stringify(
		Object.fromEntries(serializedRows),
		(key, value) =>
			Array.isArray(value) &&
			value.length === 0 &&
			OMITTED_EMPTY_BOUND_ROW_FIELDS.has(key)
				? undefined
				: value,
	);
}

function emitTableSymbolResolverModule(manifest: SymbolResolverModuleManifest): string {
	return [
		'export const symbolManifest = ',
		JSON.stringify(manifest),
		';',
		'',
		'const moduleUrls = symbolManifest[3];',
		'const exportNames = symbolManifest[4];',
		'const symbolRows = symbolManifest[5];',
		'',
		'export async function loadSymbol(id) {',
		'\tconst row = symbolRows[id];',
		'\tif (!row) throw createUnknownSymbolError(id);',
		'\treturn import(/* @vite-ignore */ moduleUrls[row[0]])',
		'\t\t.then((mod) => {',
		'\t\t\trunGeneratedSymbolChunkInitializers(mod);',
		'\t\t\treturn mod[exportNames[row[1]]];',
		'\t\t});',
		'}',
		'',
		'function runGeneratedSymbolChunkInitializers(mod) {',
		'\tfor (const name in mod) {',
		'\t\tif (!name.startsWith("init__virtual_markless_symbol")) continue;',
		'\t\tconst init = mod[name];',
		'\t\tif (typeof init === "function") init();',
		'\t}',
		'}',
		'',
		'function createUnknownSymbolError(id) {',
		'\treturn Object.assign(new Error(`Unknown async symbol ${id}`), {',
		'\t\tcode: "MARKLESS_SYMBOL_UNKNOWN",',
		'\t\tphase: "resume",',
		'\t\tsymbolId: String(id),',
		'\t\tdocsUrl: "https://markless.dev/errors/MARKLESS_SYMBOL_UNKNOWN",',
		'\t});',
		'}',
		'',
	].join('\n');
}

function emitSmallSymbolResolverModule(input: SymbolResolverModuleInput): string {
	const symbolBranches = input.symbols.flatMap((symbol) => [
		`	if (id === ${JSON.stringify(symbol.id)}) return import(/* @vite-ignore */ ${JSON.stringify(symbol.chunk)})`,
		`		.then((mod) => { mod.init__virtual_markless_symbol?.(); return mod${moduleExportAccess(symbol.exportName)}; });`,
	]);

	return [
		'export async function loadSymbol(id) {',
		...symbolBranches,
		'	throw new Error(`Unknown async symbol ${id}`);',
		'}',
		'',
	].join('\n');
}

function moduleExportAccess(exportName: string): string {
	return /^[$A-Z_a-z][$\w]*$/.test(exportName)
		? `.${exportName}`
		: `[${JSON.stringify(exportName)}]`;
}

function tableIndex(indexes: Map<string, number>, values: string[], value: string): number {
	const existing = indexes.get(value);
	if (existing !== undefined) return existing;

	const index = values.length;
	indexes.set(value, index);
	values.push(value);
	return index;
}
