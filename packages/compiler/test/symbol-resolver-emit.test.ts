import { expect, test } from 'vitest';
import { emitSymbolResolverModule } from '../src/passes/symbol-resolver-module.ts';

test('emitSymbolResolverModule emits compact table rows with a constant loader', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		[
			'export const onKeyDown_symbol_key = () => "loaded";',
			'export const textDomUpdate_symbol_domUpdate = "dom-update";',
			'export const behavior_symbol_menu = "behavior";',
			'export const asyncRunner_symbol_details = "runner";',
		].join('\n'),
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:key',
				chunk: moduleUrl,
				exportName: 'onKeyDown_symbol_key',
			},
			{
				id: 'symbol:domUpdate',
				chunk: moduleUrl,
				exportName: 'textDomUpdate_symbol_domUpdate',
			},
			{
				id: 'symbol:behavior',
				chunk: moduleUrl,
				exportName: 'behavior_symbol_menu',
			},
			{
				id: 'symbol:runner',
				chunk: moduleUrl,
				exportName: 'asyncRunner_symbol_details',
			},
		],
	});

	expect(output).toContain('export async function loadSymbol(id)');
	expect(output).toContain('const moduleUrls = symbolManifest[3];');
	expect(output).toContain('const exportNames = symbolManifest[4];');
	expect(output).toContain('const symbolRows = symbolManifest[5];');
	expect(output).toContain('import(/* @vite-ignore */ moduleUrls[row[0]])');
	expect(output).not.toContain('switch (id)');
	expect(output).not.toContain('case "symbol:key":');
	expect(output).not.toContain('case "symbol:domUpdate":');
	expect(output).toContain('throw createUnknownSymbolError(id);');
	expect(output).toContain('code: "MARKLESS_SYMBOL_UNKNOWN"');

	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	const loaded = await generatedModule.loadSymbol('symbol:key');
	expect((loaded as () => string)()).toBe('loaded');
	await expect(generatedModule.loadSymbol('symbol:domUpdate')).resolves.toBe('dom-update');
});

test('emitSymbolResolverModule emits direct imports for small symbol tables', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		['export const symbol_0 = () => "clicked";', 'export const symbol_1 = "text";'].join('\n'),
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:0',
				chunk: moduleUrl,
				exportName: 'symbol_0',
			},
			{
				id: 'symbol:1',
				chunk: moduleUrl,
				exportName: 'symbol_1',
			},
		],
	});

	expect(output).toContain('if (id === "symbol:0")');
	expect(output).toContain('return mod.symbol_0;');
	expect(output).toContain('if (id === "symbol:1")');
	expect(output).not.toContain('export const symbolManifest');
	expect(output).not.toContain('const moduleUrls = symbolManifest[3];');
	expect(output).not.toContain('runGeneratedSymbolChunkInitializers');

	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	const loaded = await generatedModule.loadSymbol('symbol:0');
	expect((loaded as () => string)()).toBe('clicked');
	await expect(generatedModule.loadSymbol('symbol:1')).resolves.toBe('text');
	await expect(generatedModule.loadSymbol('symbol:missing')).rejects.toThrow(
		'Unknown async symbol symbol:missing',
	);
});

test('emitSymbolResolverModule runs generated init exports for small symbol tables', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		[
			'let initialized = false;',
			'export function init__virtual_markless_symbol() { initialized = true; }',
			'export function symbol_0() { return initialized ? "ready" : "cold"; }',
		].join('\n'),
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:0',
				chunk: moduleUrl,
				exportName: 'symbol_0',
			},
		],
	});

	expect(output).toContain('mod.init__virtual_markless_symbol?.();');

	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	const loaded = await generatedModule.loadSymbol('symbol:0');
	expect((loaded as () => string)()).toBe('ready');
});

test('emitSymbolResolverModule runs generated symbol chunk init exports before returning a symbol', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		[
			'let initialized = false;',
			'export function init__virtual_markless_symbol__root() { initialized = true; }',
			'export function symbol_0() { return initialized ? "ready" : "cold"; }',
			'export function symbol_1() { return "one"; }',
			'export function symbol_2() { return "two"; }',
			'export function symbol_3() { return "three"; }',
		].join('\n'),
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:0',
				chunk: moduleUrl,
				exportName: 'symbol_0',
			},
			{
				id: 'symbol:1',
				chunk: moduleUrl,
				exportName: 'symbol_1',
			},
			{
				id: 'symbol:2',
				chunk: moduleUrl,
				exportName: 'symbol_2',
			},
			{
				id: 'symbol:3',
				chunk: moduleUrl,
				exportName: 'symbol_3',
			},
		],
	});
	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	const loaded = await generatedModule.loadSymbol('symbol:0');
	expect((loaded as () => string)()).toBe('ready');
});

test('emitSymbolResolverModule fails closed for unknown symbols with structured metadata', async () => {
	const output = emitSymbolResolverModule({
		symbols: [],
	});
	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	await expect(generatedModule.loadSymbol('symbol:missing')).rejects.toMatchObject({
		code: 'MARKLESS_SYMBOL_UNKNOWN',
		phase: 'resume',
		symbolId: 'symbol:missing',
		docsUrl: 'https://markless.dev/errors/MARKLESS_SYMBOL_UNKNOWN',
	});
	await expect(generatedModule.loadSymbol('symbol:missing')).rejects.toThrow(
		'Unknown async symbol symbol:missing',
	);
});

test('emitSymbolResolverModule resolves bound rows and fails loudly for unknown bound IDs', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		'export async function symbol_child(context) { return [context.capture.read("slot:label"), context.event.type]; }',
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [{ id: 'symbol:child', chunk: moduleUrl, exportName: 'symbol_child' }],
		boundSymbols: [{
			id: 'bound:known', baseSymbolId: 'symbol:child', componentEdgePath: ['edge:0'],
			ancestry: [{ componentEdgeId: 'edge:0', branchScopeIds: [], keyedRepeatScopeIds: [] }],
			captureSlots: [{ slotId: 'slot:label', path: [], route: { kind: 'compiler-known-constant', componentEdgeId: 'edge:0', value: 'Save' } }],
		}],
	});
	const generatedModule = (await import(`data:text/javascript,${encodeURIComponent(output)}`)) as {
		loadSymbol(id: string): Promise<(context: unknown) => unknown>;
	};
	const bound = await generatedModule.loadSymbol('bound:known');
	await expect(bound({ event: { type: 'click' }, graph: { read() {} } })).resolves.toEqual(['Save', 'click']);
	await expect(generatedModule.loadSymbol('bound:missing')).rejects.toMatchObject({
		code: 'MARKLESS_SYMBOL_UNKNOWN', symbolId: 'bound:missing',
	});
	expect(output).not.toContain('switch (id)');
	expect(output).not.toContain('"branchScopeIds"');
	expect(output).not.toContain('"keyedRepeatScopeIds"');
	expect(output).not.toContain('"path":[]');
	expect(output).toContain('"slotId"');
	expect(output).toContain('"ancestry":[{}]');
});

// The graph-less spellings the resolver used to emit; each fell through to the
// runtime's per-dispatch `marklessWidgetScope.active` pointer, which two
// containers with interleaving async symbol bodies share.
const GRAPHLESS_RESOLVER_CALLS = [
	'marklessComposedGraphNodeId(graphNodeId, path)',
	'marklessComposedGraphNodeId(record.graphNodeId, path)',
];

function widgetScopedResolverInput(baseChunk: string) {
	return {
		symbols: [{ id: 'symbol:dialog', chunk: baseChunk, exportName: 'symbol_dialog' }],
		boundSymbols: [
			{
				id: 'bound:dialog',
				baseSymbolId: 'symbol:dialog',
				instancePath: 'c0:p2:',
				componentEdgePath: ['edge:0'],
				ancestry: [
					{ componentEdgeId: 'edge:0', branchScopeIds: [], keyedRepeatScopeIds: [] },
				],
				// A page-space id is what makes the resolver import the runtime's
				// widget-aware reading instead of concatenating the instance path.
				captureSlots: [
					{
						slotId: 'slot:open',
						path: [],
						route: {
							kind: 'compiler-known-constant' as const,
							componentEdgeId: 'edge:0',
							value: 'Save',
						},
					},
					{
						slotId: 'slot:shared',
						path: [],
						route: {
							kind: 'graph-reference' as const,
							componentEdgeId: 'edge:0',
							graphNodeId: 'shared:/src/Dialog.tsrx#Dialog',
							path: [],
						},
					},
				],
			},
		],
	};
}

test('emitSymbolResolverModule hands the dispatching graph to the widget-scope resolver', async () => {
	const baseChunk = `data:text/javascript,${encodeURIComponent(
		[
			'export async function symbol_dialog(context) {',
			'	context.graph.write({ graphNodeId: "shared:/src/Dialog.tsrx#Dialog/state:open", value: true });',
			'	context.graph.read("state:label", []);',
			'	context.read("state:legacy", []);',
			'	context.getElementHandle("shared:/src/Dialog.tsrx#Dialog/element:panel");',
			'}',
		].join('\n'),
	)}`;
	const output = emitSymbolResolverModule(widgetScopedResolverInput(baseChunk));

	expect(output).toContain(
		"import { marklessComposedGraphNodeId, marklessGraphWidgetRegistry, marklessWidgetHandleId } from '@markless/web/fns/instance-scope';",
	);
	expect(output).toContain('const registry = marklessGraphWidgetRegistry(graph);');
	// An element() handle is spelled against the same instance path as this
	// symbol's graph nodes: both halves name the widget by the bound edge.
	expect(output).toContain(
		'getElementHandle: (handleIdOrName) => context.getElementHandle(marklessWidgetHandleId(handleIdOrName, path, marklessGraphWidgetRegistry(context.graph)))',
	);
	for (const graphless of GRAPHLESS_RESOLVER_CALLS) expect(output).not.toContain(graphless);

	// Stands in for the runtime module so the test can see which registry the
	// emitted closure handed over, rather than only that it typechecks.
	const runtimeStub = `data:text/javascript,${encodeURIComponent(
		[
			'export function marklessGraphWidgetRegistry(graph) { return graph ? graph.registryTag : "active-pointer"; }',
			'export function marklessComposedGraphNodeId(graphNodeId, path, registry) {',
			'	globalThis.__u254ResolverCalls.push({ graphNodeId, registry });',
			'	return path + graphNodeId;',
			'}',
			'export function marklessWidgetHandleId(handleId, path, registry) {',
			'	globalThis.__u254HandleCalls.push({ handleId, path, registry });',
			'	return path + handleId;',
			'}',
		].join('\n'),
	)}`;
	const stubbed = output.replace(
		"'@markless/web/fns/instance-scope'",
		JSON.stringify(runtimeStub),
	);
	const calls: Array<{ graphNodeId: string; registry: unknown }> = [];
	(globalThis as { __u254ResolverCalls?: unknown }).__u254ResolverCalls = calls;
	const handleCalls: Array<{ handleId: string; path: string; registry: unknown }> = [];
	(globalThis as { __u254HandleCalls?: unknown }).__u254HandleCalls = handleCalls;

	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(stubbed)}`
	)) as { loadSymbol(id: string): Promise<(context: unknown) => unknown> };
	const bound = await generatedModule.loadSymbol('bound:dialog');

	const dispatch = async (registryTag: string) => {
		const writes: Array<{ graphNodeId: string }> = [];
		await bound({
			graph: {
				registryTag,
				read: () => undefined,
				write: (record: { graphNodeId: string }) => writes.push(record),
			},
			read: () => undefined,
			getElementHandle: (id: string) => asked.push(id),
		});
		return writes;
	};
	const asked: string[] = [];

	expect(await dispatch('graph:A')).toEqual([
		{ graphNodeId: 'c0:p2:shared:/src/Dialog.tsrx#Dialog/state:open', value: true },
	]);
	expect(calls.length).toBeGreaterThanOrEqual(3);
	expect(new Set(calls.map((call) => call.registry))).toEqual(new Set(['graph:A']));

	// Defect 78: the handle read takes the bound edge's instance path, the same
	// one the write above took, and the same registry. Left module-level, a page
	// with two rendered widgets has two registrations under it and refuses.
	expect(handleCalls).toEqual([
		{
			handleId: 'shared:/src/Dialog.tsrx#Dialog/element:panel',
			path: 'c0:p2:',
			registry: 'graph:A',
		},
	]);
	expect(asked).toEqual(['c0:p2:shared:/src/Dialog.tsrx#Dialog/element:panel']);

	// The second container's dispatch must reach its own registry, not the one the
	// first dispatch left behind.
	calls.length = 0;
	await dispatch('graph:B');
	expect(new Set(calls.map((call) => call.registry))).toEqual(new Set(['graph:B']));
	delete (globalThis as { __u254ResolverCalls?: unknown }).__u254ResolverCalls;
	delete (globalThis as { __u254HandleCalls?: unknown }).__u254HandleCalls;
});

test('emitSymbolResolverModule leaves page-local instance scoping free of the widget runtime', () => {
	const output = emitSymbolResolverModule({
		symbols: [{ id: 'symbol:child', chunk: '/assets/child.js', exportName: 'symbol_child' }],
		boundSymbols: [
			{
				id: 'bound:child',
				baseSymbolId: 'symbol:child',
				instancePath: 'c0:',
				componentEdgePath: ['edge:0'],
				ancestry: [
					{ componentEdgeId: 'edge:0', branchScopeIds: [], keyedRepeatScopeIds: [] },
				],
				captureSlots: [
					{
						slotId: 'slot:count',
						path: [],
						route: {
							kind: 'graph-reference',
							componentEdgeId: 'edge:0',
							graphNodeId: 'state:count',
							path: [],
						},
					},
				],
			},
		],
	});

	expect(output).not.toContain('@markless/web/fns/instance-scope');
	expect(output).toContain('const scoped = (graphNodeId) =>');
	expect(output).toContain('path + graphNodeId');
});

test('emitSymbolResolverModule exports the symbol manifest with protocol and build identity', async () => {
	const output = emitSymbolResolverModule({
		buildId: 'build:abc123',
		resolverId: 'resolver:/src/App.tsrx',
		symbols: [
			{
				id: 'symbol:key',
				chunk: '/assets/menu.handlers.ab12.js',
				exportName: 'onKeyDown_symbol_key',
			},
			{
				id: 'symbol:private-export',
				chunk: '/assets/private.cd34.js',
				exportName: 'menu dom update',
			},
			{
				id: 'symbol:behavior',
				chunk: '/assets/behavior.ef56.js',
				exportName: 'behaviorSymbol',
			},
			{
				id: 'symbol:runner',
				chunk: '/assets/runner.gh78.js',
				exportName: 'runnerSymbol',
			},
		],
	});
	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		symbolManifest: unknown;
	};

	expect(generatedModule.symbolManifest).toEqual([
		1,
		'build:abc123',
		'resolver:/src/App.tsrx',
		[
			'/assets/menu.handlers.ab12.js',
			'/assets/private.cd34.js',
			'/assets/behavior.ef56.js',
			'/assets/runner.gh78.js',
		],
		['onKeyDown_symbol_key', 'menu dom update', 'behaviorSymbol', 'runnerSymbol'],
		{
			'symbol:key': [0, 0],
			'symbol:private-export': [1, 1],
			'symbol:behavior': [2, 2],
			'symbol:runner': [3, 3],
		},
	]);
});
