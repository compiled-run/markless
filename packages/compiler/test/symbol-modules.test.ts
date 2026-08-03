import { expect, test } from 'vitest';
import { emitSymbolModules } from '../src/passes/symbol-modules.ts';
import { compileTsrxModule } from '../src/compile-module.ts';

test('state initializer symbols carry referenced same-module helpers', async () => {
	const result = await compileTsrxModule({
		filename: '/workspace/app/src/App.tsrx',
		source: `
import { state } from '@markless/core';
function initialWeight() { return 2; }
export function App() @{ let weight = state(initialWeight()); <main>{weight}</main> }
`,
		symbols: [],
	});
	const initializer = result.symbolModules.modules.find(
		(module) => module.kind === 'state-initializer',
	);

	expect(initializer?.source).toContain('function initialWeight() { return 2; }');
	expect(initializer?.source).toContain('return (initialWeight());');
});

test('emitSymbolModules emits event, callback, and DOM update modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:click',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => count++',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'count',
							graphNodeId: 'state:count',
							path: [],
							operation: 'update',
							updateOperator: '++',
							prefix: false,
						},
					],
				},
				{
					id: 'symbol:onNext',
					kind: 'callback-prop',
					componentEdgeId: 'edge:0',
					propName: 'onNext',
					source: '() => playing = true',
					writes: [
						{
							source: 'playing',
							graphNodeId: 'state:playing',
							path: [],
							operation: 'assign',
							valueSource: 'true',
						},
					],
				},
				{
					id: 'symbol:domUpdate',
					kind: 'dom-update',
					hostNodeId: 'h1',
					source: 'query',
					graphNodeId: 'state:query',
					target: { kind: 'property', name: 'value' },
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.passId).toBe('symbol-modules');
	expect(artifact.modules).toHaveLength(3);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:click',
		kind: 'event-handler',
		exportName: 'symbol_click',
	});
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:count"');
	expect(artifact.modules[0].source).toContain('return Number(value) + 1;');
	expect(artifact.modules[1]).toMatchObject({
		symbolId: 'symbol:onNext',
		kind: 'callback-prop',
		exportName: 'symbol_onNext',
	});
	expect(artifact.modules[1].source).toContain('graphNodeId: "state:playing"');
	expect(artifact.modules[1].source).toContain('value: true');
	expect(artifact.modules[2]).toMatchObject({
		symbolId: 'symbol:domUpdate',
		kind: 'dom-update',
		exportName: 'symbol_domUpdate',
	});
	expect(artifact.modules[2].source).toContain('type: "setProp"');
	expect(artifact.modules[2].source).toContain('locator: context.domUpdate?.hostNodeId ?? "h1"');
	expect(artifact.modules[2].source).toContain('name: "value"');
	expect(artifact.modules[2].source).toContain('value: context.value');
});

test('emitSymbolModules imports scalar write and text update leaves for scalar click path', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:click',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => count++',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'count',
							graphNodeId: 'state:count',
							path: [],
							operation: 'update',
							updateOperator: '++',
							prefix: false,
						},
					],
				},
				{
					id: 'symbol:domUpdate',
					kind: 'dom-update',
					hostNodeId: 'h1',
					source: 'count',
					graphNodeId: 'state:count',
					target: { kind: 'text' },
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: { passId: 'capture-analysis', extractedSymbols: [], diagnostics: [] },
	});

	expect(artifact.modules[0].source).toContain(
		"import { marklessWriteScalar } from '@markless/web/fns/write-scalar';",
	);
	expect(artifact.modules[0].source).toContain('return marklessWriteScalar(context, {');
	expect(artifact.modules[1].source).toContain(
		"import { marklessUpdateText } from '@markless/web/fns/update-text';",
	);
	expect(artifact.modules[1].source).toContain('return marklessUpdateText(context, "h1");');
});

test('emitSymbolModules leaves non-scalar path writes on the existing graph-write path', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:toggle',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => menu.open = false',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
							operation: 'assign',
							valueSource: 'false',
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: { passId: 'capture-analysis', extractedSymbols: [], diagnostics: [] },
	});

	expect(artifact.modules[0].source).not.toContain('@markless/web/fns/write-scalar');
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('path: ["open"]');
});

test('emitSymbolModules emits conditional text DOM update values', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:playIcon',
					kind: 'dom-update',
					hostNodeId: 'h2',
					source: 'playing',
					graphNodeId: 'state:playing',
					target: { kind: 'text', trueValue: 'Pause', falseValue: 'Play' },
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0].source).toContain('type: "setText"');
	expect(artifact.modules[0].source).toContain('value: context.value ? "Pause" : "Play"');
});

test('emitSymbolModules emits repeat-local assignment values through context locals', () => {
	const artifact = emitSelectAssignmentSymbol('entry.code', repeatLocalRenderData());

	expect(artifact.modules[0].source).toContain(
		"import { marklessWriteScalar } from '@markless/web/fns/write-scalar';",
	);
	expect(artifact.modules[0].source).toContain('return marklessWriteScalar(context, {');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:selected"');
	expect(artifact.modules[0].source).toContain('value: context.locals?.entry?.code');
});

function emitSelectAssignmentSymbol(valueSource: string, renderData?: any) {
	return emitSymbolModules({
		renderData,
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:select',
					kind: 'event-handler',
					hostNodeId: 'h2',
					eventName: 'click',
					source: `() => selected = ${valueSource}`,
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'selected',
							graphNodeId: 'state:selected',
							path: [],
							operation: 'assign',
							valueSource,
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: { passId: 'capture-analysis', extractedSymbols: [], diagnostics: [] },
	});
}

function repeatLocalRenderData() {
	return {
		repeats: [{ repeatId: 'repeat:0', rowChunkId: 'repeat:repeat:0:row', itemName: 'entry' }],
		chunks: [{
			id: 'repeat:repeat:0:row',
			hosts: [{ hostNodeId: 'h2' }],
			slots: [],
		}],
		interactions: [{ hostNodeId: 'h2', symbolIds: ['symbol:select'] }],
	};
}

test('emitSymbolModules emits concrete DOM journal entries for each binding target', () => {
	const cases = [
		{
			id: 'text',
			target: { kind: 'text' } as const,
			expected: ['type: "setText"', 'value: context.value'],
		},
		{
			id: 'attribute',
			target: { kind: 'attribute', name: 'aria-label' } as const,
			expected: ['type: "setAttr"', 'name: "aria-label"', 'value: context.value'],
		},
		{
			id: 'property',
			target: { kind: 'property', name: 'value' } as const,
			expected: ['type: "setProp"', 'name: "value"', 'value: context.value'],
		},
		{
			id: 'class',
			target: { kind: 'class' } as const,
			expected: ['type: "setAttr"', 'name: "class"', 'value: context.value'],
		},
		{
			id: 'style',
			target: { kind: 'style' } as const,
			expected: ['type: "setAttr"', 'name: "style"', 'value: context.value'],
		},
	];

	for (const targetCase of cases) {
		const artifact = emitSymbolModules({
			symbolResolver: {
				passId: 'symbol-resolver',
				dynamicImportOwner: 'generated-symbol-resolver',
				symbols: [
					{
						id: `symbol:${targetCase.id}`,
						kind: 'dom-update',
						hostNodeId: 'h1',
						source: 'count',
						graphNodeId: 'state:count',
						target: targetCase.target,
					},
				],
				syncPolicies: [],
				diagnostics: [],
			},
			captureAnalysis: {
				passId: 'capture-analysis',
				extractedSymbols: [],
				diagnostics: [],
			},
		});

		if (targetCase.id !== 'text') expect(artifact.modules[0].source).not.toContain('import ');
		expect(artifact.modules[0].source).not.toContain('createDomUpdateEntry');
		if (targetCase.id === 'text') {
			expect(artifact.modules[0].source).toContain(
				"import { marklessUpdateText } from '@markless/web/fns/update-text';",
			);
		} else {
			for (const expected of targetCase.expected) {
				expect(artifact.modules[0].source).toContain(expected);
			}
		}
	}
});

test('emitSymbolModules emits imported behavior modules with deferred input values', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:chart',
					kind: 'behavior',
					hostNodeId: 'h1',
					source: 'chart(config)',
					functionSource: 'chart',
					inputSources: ['config'],
					moduleImport: {
						localName: 'chart',
						importedName: 'chart',
						source: './behaviors',
						kind: 'named',
					},
					order: 0,
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0].source).toBe(`import { chart } from "./behaviors";

export const authoredSource = "chart(config)";
export const behaviorFunctionSource = "chart";
export const behaviorInputSources = ["config"];

export function symbol_chart(context) {
	const inputs = context.behaviorInputs ?? new Array(1).fill(undefined);
	const behavior = chart(...inputs);
	return behavior(context.element);
}
`);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:chart',
		kind: 'behavior',
		exportName: 'symbol_chart',
	});
	expect(artifact.modules[0].source).toContain('import { chart } from "./behaviors";');
	expect(artifact.modules[0].source).toContain('export const authoredSource = "chart(config)";');
	expect(artifact.modules[0].source).toContain('export const behaviorInputSources = ["config"];');
	expect(artifact.modules[0].source).toContain('const behavior = chart(...inputs);');
	expect(artifact.modules[0].source).toContain('return behavior(context.element);');
});

test('emitSymbolModules emits inline behavior function modules without imports', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:autofocus',
					kind: 'behavior',
					hostNodeId: 'h1',
					source: '(element) => element.focus()',
					functionSource: '(element) => element.focus()',
					inputSources: [],
					order: 0,
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0].source)
		.toBe(`export const authoredSource = "(element) => element.focus()";
export const behaviorFunctionSource = "(element) => element.focus()";
export const behaviorInputSources = [];

export function symbol_autofocus(context) {
	const inputs = [];
	const behavior = (element) => element.focus();
	return behavior(context.element);
}
`);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:autofocus',
		kind: 'behavior',
		exportName: 'symbol_autofocus',
	});
	expect(artifact.modules[0].source).not.toContain('import ');
	expect(artifact.modules[0].source).toContain(
		'export const authoredSource = "(element) => element.focus()";',
	);
	expect(artifact.modules[0].source).toContain(
		'export const behaviorFunctionSource = "(element) => element.focus()";',
	);
	expect(artifact.modules[0].source).toContain('const behavior = (element) => element.focus();');
	expect(artifact.modules[0].source).toContain('return behavior(context.element);');
});

test('emitSymbolModules groups inline behavior factory sources before deferred inputs', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:mode',
					kind: 'behavior',
					hostNodeId: 'h1',
					source: '((options) => (element) => element.setAttribute("data-mode", options.mode))(config)',
					functionSource:
						'(options) => (element) => element.setAttribute("data-mode", options.mode)',
					inputSources: ['config'],
					order: 0,
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:mode',
		kind: 'behavior',
		exportName: 'symbol_mode',
	});
	expect(artifact.modules[0].source).toContain(
		'const behavior = ((options) => (element) => element.setAttribute("data-mode", options.mode))(...inputs);',
	);
	expect(artifact.modules[0].source).toContain('return behavior(context.element);');
});

test('emitSymbolModules does not emit bare local behavior identifiers without imports', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:localBehavior',
					kind: 'behavior',
					hostNodeId: 'h1',
					source: 'resizeCanvas',
					functionSource: 'resizeCanvas',
					inputSources: [],
					order: 0,
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toEqual([]);
});

test('emitSymbolModules emits async computed runner modules from planned sources', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:userRunner',
					kind: 'async-computed-runner',
					graphNodeId: 'computed:user',
					name: 'user',
					source: 'async ({ signal }) => fetch("/api/user/" + query, { signal })',
					dependencies: [
						{
							source: 'query',
							graphNodeId: 'state:query',
							path: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:userRunner',
		kind: 'async-computed-runner',
		exportName: 'symbol_userRunner',
	});
	expect(artifact.modules[0].source).toContain(
		'export const authoredSource = "async ({ signal }) => fetch(\\"/api/user/\\" + query, { signal })";',
	);
	expect(artifact.modules[0].source).toContain('const query = read("state:query");');
	expect(artifact.modules[0].source).toContain(
		'const run = async ({ signal }) => fetch("/api/user/" + query, { signal });',
	);
	expect(artifact.modules[0].source).toContain(
		'return run({ key: context.key, signal: context.signal, read });',
	);
});

test('emitSymbolModules emits sync computed derive modules from planned sources', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:doubledDerive',
					kind: 'sync-computed-derive',
					graphNodeId: 'computed:doubled',
					name: 'doubled',
					source: '() => count * 2',
					dependencies: [
						{
							source: 'count',
							graphNodeId: 'state:count',
							path: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:doubledDerive',
		kind: 'sync-computed-derive',
		exportName: 'symbol_doubledDerive',
	});
	expect(artifact.modules[0].source).toContain(
		'export const authoredSource = "() => count * 2";',
	);
	expect(artifact.modules[0].source).toContain('return context.graph.read("state:count") * 2;');
});

test('emitSymbolModules keeps dependency-like string values literal in sync computed derives', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:statusDerive',
					kind: 'sync-computed-derive',
					graphNodeId: 'computed:status',
					name: 'status',
					source:
						"() => alpha === 'alpha' || alpha === 'alpha-applied' || alpha === 'alphaapplied'",
					dependencies: [
						{
							source: 'alpha',
							graphNodeId: 'state:alpha',
							path: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules[0].source).toContain(
		"return context.graph.read(\"state:alpha\") === 'alpha' || context.graph.read(\"state:alpha\") === 'alpha-applied' || context.graph.read(\"state:alpha\") === 'alphaapplied';",
	);
});

test('emitSymbolModules emits static delete writes for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:close',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => { delete menu.open; }',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
							operation: 'delete',
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:close',
		kind: 'event-handler',
		exportName: 'symbol_close',
	});
	expect(artifact.modules[0].source).toContain('context.graph.delete({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:menu"');
	expect(artifact.modules[0].source).toContain('path: ["open"]');
});

test('emitSymbolModules emits zero-argument collection calls for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:remove',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => items.pop()',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'items',
							graphNodeId: 'state:items',
							path: [],
							operation: 'call',
							method: 'pop',
							argumentSources: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:remove',
		kind: 'event-handler',
		exportName: 'symbol_remove',
	});
	expect(artifact.modules[0].source).toContain('context.graph.call({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:items"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain('method: "pop"');
	expect(artifact.modules[0].source).toContain('args: []');
});

test('emitSymbolModules emits literal-argument collection calls for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:add',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => items.push("next", 2)',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'items',
							graphNodeId: 'state:items',
							path: [],
							operation: 'call',
							method: 'push',
							argumentSources: ['"next"', '2'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:add',
		kind: 'event-handler',
		exportName: 'symbol_add',
	});
	expect(artifact.modules[0].source).toContain('context.graph.call({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:items"');
	expect(artifact.modules[0].source).toContain('method: "push"');
	expect(artifact.modules[0].source).toContain('args: ["next", 2]');
});

test('emitSymbolModules emits event field collection-call arguments for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:add',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'input',
					source: '(event) => items.push(event.currentTarget.value, "fallback")',
					parameters: ['event'],
					order: 0,
					writes: [
						{
							source: 'items',
							graphNodeId: 'state:items',
							path: [],
							operation: 'call',
							method: 'push',
							argumentSources: ['event.currentTarget.value', '"fallback"'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:add',
		kind: 'event-handler',
		exportName: 'symbol_add',
	});
	expect(artifact.modules[0].source).toContain('context.graph.call({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:items"');
	expect(artifact.modules[0].source).toContain('method: "push"');
	expect(artifact.modules[0].source).toContain('args: [context.element?.value, "fallback"]');
});

test('emitSymbolModules emits graph-read collection-call arguments for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:add',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => items.push(menu.title)',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'items',
							graphNodeId: 'state:items',
							path: [],
							operation: 'call',
							method: 'push',
							argumentSources: ['menu.title'],
						},
					],
					reads: [
						{
							source: 'menu.title',
							graphNodeId: 'state:menu',
							path: ['title'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:add',
		kind: 'event-handler',
		exportName: 'symbol_add',
	});
	expect(artifact.modules[0].source).toContain('context.graph.call({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:items"');
	expect(artifact.modules[0].source).toContain('method: "push"');
	expect(artifact.modules[0].source).toContain(
		'args: [context.graph.read("state:menu", ["title"])]',
	);
});

test('emitSymbolModules preserves spread collection-call arguments for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:addMany',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => items.push(...nextItems, "tail")',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'items',
							graphNodeId: 'state:items',
							path: [],
							operation: 'call',
							method: 'push',
							argumentSources: ['...nextItems', '"tail"'],
						},
					],
					reads: [
						{
							source: 'nextItems',
							graphNodeId: 'state:nextItems',
							path: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:addMany',
		kind: 'event-handler',
		exportName: 'symbol_addMany',
	});
	expect(artifact.modules[0].source).toContain('context.graph.call({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:items"');
	expect(artifact.modules[0].source).toContain('method: "push"');
	expect(artifact.modules[0].source).toContain(
		'args: [...context.graph.read("state:nextItems"), "tail"]',
	);
});

test('emitSymbolModules emits literal assignment writes for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:close',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'keydown',
					source: '() => { menu.open = false; }',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
							operation: 'assign',
							valueSource: 'false',
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:close',
		kind: 'event-handler',
		exportName: 'symbol_close',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:menu"');
	expect(artifact.modules[0].source).toContain('path: ["open"]');
	expect(artifact.modules[0].source).toContain('value: false');
});

test('emitSymbolModules emits event field assignments for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:input',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'input',
					source: '(event) => query = event.currentTarget.value',
					parameters: ['event'],
					order: 0,
					writes: [
						{
							source: 'query',
							graphNodeId: 'state:query',
							path: [],
							operation: 'assign',
							valueSource: 'event.currentTarget.value',
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:input',
		kind: 'event-handler',
		exportName: 'symbol_input',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:query"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain('value: context.element?.value');
});

test('emitSymbolModules emits graph-read assignments for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:copy',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => menu.title = profile.name',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'menu.title',
							graphNodeId: 'state:menu',
							path: ['title'],
							operation: 'assign',
							valueSource: 'profile.name',
						},
					],
					reads: [
						{
							source: 'profile.name',
							graphNodeId: 'state:profile',
							path: ['name'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:copy',
		kind: 'event-handler',
		exportName: 'symbol_copy',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:menu"');
	expect(artifact.modules[0].source).toContain('path: ["title"]');
	expect(artifact.modules[0].source).toContain(
		'value: context.graph.read("state:profile", ["name"])',
	);
});

test('emitSymbolModules emits binary graph-read assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:add',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = total + profile.step',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: 'total + profile.step',
						},
					],
					reads: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:add',
		kind: 'event-handler',
		exportName: 'symbol_add',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:total"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: context.graph.read("state:total") + context.graph.read("state:profile", ["step"])',
	);
});

test('emitSymbolModules emits nested parenthesized graph-read assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:scale',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = (total + profile.step) * profile.scale',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: '(total + profile.step) * profile.scale',
						},
					],
					reads: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
						{
							source: 'profile.scale',
							graphNodeId: 'state:profile',
							path: ['scale'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:scale',
		kind: 'event-handler',
		exportName: 'symbol_scale',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:total"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: (context.graph.read("state:total") + context.graph.read("state:profile", ["step"])) * context.graph.read("state:profile", ["scale"])',
	);
});

test('emitSymbolModules emits conditional graph-read assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:choose',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = menu.open ? profile.step : total',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: 'menu.open ? profile.step : total',
						},
					],
					reads: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:choose',
		kind: 'event-handler',
		exportName: 'symbol_choose',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:total"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: context.graph.read("state:menu", ["open"]) ? context.graph.read("state:profile", ["step"]) : context.graph.read("state:total")',
	);
});

test('emitSymbolModules emits array literal assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:replace',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => items = [nextItem, "fallback"]',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'items',
							graphNodeId: 'state:items',
							path: [],
							operation: 'assign',
							valueSource: '[nextItem, "fallback"]',
						},
					],
					reads: [
						{
							source: 'nextItem',
							graphNodeId: 'state:nextItem',
							path: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:replace',
		kind: 'event-handler',
		exportName: 'symbol_replace',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:items"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: [context.graph.read("state:nextItem"), "fallback"]',
	);
});

test('emitSymbolModules emits array literal spread assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:replace',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => items = [...nextItems, nextItem]',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'items',
							graphNodeId: 'state:items',
							path: [],
							operation: 'assign',
							valueSource: '[...nextItems, nextItem]',
						},
					],
					reads: [
						{
							source: 'nextItems',
							graphNodeId: 'state:nextItems',
							path: [],
						},
						{
							source: 'nextItem',
							graphNodeId: 'state:nextItem',
							path: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:replace',
		kind: 'event-handler',
		exportName: 'symbol_replace',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:items"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: [...context.graph.read("state:nextItems"), context.graph.read("state:nextItem")]',
	);
});

test('emitSymbolModules preserves sparse array literal assignment holes', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:replace',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => items = [, nextItem]',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'items',
							graphNodeId: 'state:items',
							path: [],
							operation: 'assign',
							valueSource: '[, nextItem]',
						},
					],
					reads: [
						{
							source: 'nextItem',
							graphNodeId: 'state:nextItem',
							path: [],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:replace',
		kind: 'event-handler',
		exportName: 'symbol_replace',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:items"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain('value: [, context.graph.read("state:nextItem")]');
});

test('emitSymbolModules emits object literal assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:replace',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => settings = { title: menu.title, step: profile.step }',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'settings',
							graphNodeId: 'state:settings',
							path: [],
							operation: 'assign',
							valueSource: '{ title: menu.title, step: profile.step }',
						},
					],
					reads: [
						{
							source: 'menu.title',
							graphNodeId: 'state:menu',
							path: ['title'],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:replace',
		kind: 'event-handler',
		exportName: 'symbol_replace',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:settings"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: { title: context.graph.read("state:menu", ["title"]), step: context.graph.read("state:profile", ["step"]) }',
	);
});

test('emitSymbolModules emits object spread assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:replace',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => settings = { ...settings, title: menu.title }',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'settings',
							graphNodeId: 'state:settings',
							path: [],
							operation: 'assign',
							valueSource: '{ ...settings, title: menu.title }',
						},
					],
					reads: [
						{
							source: 'settings',
							graphNodeId: 'state:settings',
							path: [],
						},
						{
							source: 'menu.title',
							graphNodeId: 'state:menu',
							path: ['title'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:replace',
		kind: 'event-handler',
		exportName: 'symbol_replace',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:settings"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: { ...context.graph.read("state:settings"), title: context.graph.read("state:menu", ["title"]) }',
	);
});

test('emitSymbolModules emits computed object-key assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:replace',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => settings = { [menu.title]: profile.step }',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'settings',
							graphNodeId: 'state:settings',
							path: [],
							operation: 'assign',
							valueSource: '{ [menu.title]: profile.step }',
						},
					],
					reads: [
						{
							source: 'menu.title',
							graphNodeId: 'state:menu',
							path: ['title'],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:replace',
		kind: 'event-handler',
		exportName: 'symbol_replace',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:settings"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: { [context.graph.read("state:menu", ["title"])]: context.graph.read("state:profile", ["step"]) }',
	);
});

test('emitSymbolModules emits static call assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:clamp',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = Math.max(total, profile.step)',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: 'Math.max(total, profile.step)',
						},
					],
					reads: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:clamp',
		kind: 'event-handler',
		exportName: 'symbol_clamp',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:total"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: Math.max(context.graph.read("state:total"), context.graph.read("state:profile", ["step"]))',
	);
});

test('emitSymbolModules re-emits imported helper calls for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:clamp',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = clamp(total, profile.step)',
					parameters: [],
					moduleImports: [
						{
							localName: 'clamp',
							importedName: 'clamp',
							source: './math',
							kind: 'named',
						},
					],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: 'clamp(total, profile.step)',
						},
					],
					reads: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:clamp',
		kind: 'event-handler',
		exportName: 'symbol_clamp',
	});
	expect(artifact.modules[0].source).toContain('import { clamp } from "./math";');
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:total"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain(
		'value: clamp(context.graph.read("state:total"), context.graph.read("state:profile", ["step"]))',
	);
});

test('B908 emits imported handler references as imports plus event calls', () => {
	const source = emitEventHandlerSource({
		id: 'symbol:save',
		source: 'save',
		moduleImports: [namedImport('save', './api')],
	});

	expect(source).toContain('import { save } from "./api";');
	expect(source).toContain('return save(context.event);');
});

test('B908 emits async handler bodies with await ordering before spliced writes', () => {
	const source = emitEventHandlerSource({
		id: 'symbol:asyncSave',
		eventName: 'submit',
		source: 'async (event) => { await save(); count++; }',
		parameters: ['event'],
		moduleImports: [namedImport('save', './api')],
		writes: [countUpdateWrite()],
	});

	expect(source).toContain('export async function symbol_asyncSave(context) {');
	expect(source).toContain('const event = context.event;');
	expect(source.indexOf('await save();')).toBeLessThan(source.indexOf('context.graph.update({'));
});

test('bound symbols read capture slots, await callback vectors, and keep DOM events separate', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Captures.tsrx',
		source: `
function Child({ label, onTrace }: { label: string; onTrace: (payload: { value: number }, reason: string) => void }) @{
	<button onClick={(event) => onTrace({ value: label.length }, event.type)}>{label}</button>
}
export function App() @{
	<Child label="Save" onTrace={(payload) => console.log(payload.value)} />
}
`,
		symbols: [],
	});
	const child = result.symbolModules.modules.find((module) =>
		module.kind === 'event-handler' && module.source.includes('capture.invoke'),
	);
	const callback = result.symbolModules.modules.find((module) => module.kind === 'callback-prop');
	expect(child?.source).toContain('context.capture.read(');
	expect(child?.source).not.toContain('context.graph.read("prop:props"');
	expect(child?.source).toContain('await context.capture.invoke(');
	expect(child?.source).toContain('[{ value: context.capture.read(');
	expect(child?.source).toContain('context.event?.type');
	expect(callback?.source).toContain('const payload = context.args?.[0];');

	const multiArgumentCallback = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver', dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [{
				id: 'symbol:callback', kind: 'callback-prop', componentEdgeId: 'edge:0',
				propName: 'onTrace', source: '(payload, reason) => console.log(payload, reason)',
				parameters: ['payload', 'reason'], reads: [], writes: [],
			}],
			syncPolicies: [], diagnostics: [],
		},
		captureAnalysis: { passId: 'capture-analysis', extractedSymbols: [], diagnostics: [] },
	}).modules[0]?.source;
	expect(multiArgumentCallback).toContain('const payload = context.args?.[0];');
	expect(multiArgumentCallback).toContain('const reason = context.args?.[1];');
});

test('a direct callback prop event reference invokes its graph-routable prop', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Controls.tsrx',
		source: `
export function Controls({ onActivate }) @{
	<button onClick={onActivate}>Activate</button>
}
`,
		symbols: [],
	});
	const directHandler = result.symbolModules.modules.find(
		(module) => module.kind === 'event-handler',
	);
	expect(directHandler?.source).toContain(
		'return context.graph.read("prop:props", ["onActivate"])(context.event);',
	);
});

test('local declarations shadow component props when callback arguments are emitted', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ShadowedCapture.tsrx',
		source: `
function Child({ label, onTrace }: { label: string; onTrace: (value: string) => void }) @{
	<>
		<button onClick={() => { const label = "local"; onTrace(label); }}>Local</button>
		<button onClick={() => { { const label = "nested"; onTrace(label); } }}>Nested</button>
		<button onClick={() => { const { label } = { label: "pattern" }; onTrace(label); }}>Pattern</button>
		<button onClick={() => { for (const label of ["loop"]) onTrace(label); }}>Loop</button>
		<button onClick={() => onTrace(label)}>Prop</button>
	</>
}
export function App() @{
	<Child label="edge" onTrace={(value) => console.log(value)} />
}
`,
		symbols: [],
	});
	const handlers = result.symbolModules.modules.filter(
		(module) => module.kind === 'event-handler',
	);
	const local = handlers.find((module) => module.source.includes('"local"'));
	const nested = handlers.find((module) => module.source.includes('"nested"'));
	const pattern = handlers.find((module) => module.source.includes('"pattern"'));
	const loop = handlers.find((module) => module.source.includes('"loop"'));
	const prop = handlers.find(
		(module) => module.source.includes('capture.invoke') && module.source.includes('capture.read'),
	);

	expect(local?.source).toContain('const label = "local";');
	expect(local?.source).toContain('await context.capture.invoke(');
	expect(local?.source).toContain('[label]');
	expect(local?.source).not.toContain('context.capture.read(');
	expect(nested?.source).toContain('const label = "nested";');
	expect(nested?.source).toContain('[label]');
	expect(nested?.source).not.toContain('context.capture.read(');
	expect(pattern?.source).toContain('const { label } = { label: "pattern" };');
	expect(pattern?.source).toContain('[label]');
	expect(pattern?.source).not.toContain('context.capture.read(');
	expect(loop?.source).toContain('for (const label of ["loop"])');
	expect(loop?.source).toContain('[label]');
	expect(loop?.source).not.toContain('context.capture.read(');
	expect(prop?.source).toContain('await context.capture.invoke(');
	expect(prop?.source).toContain('[context.capture.read(');
});

test('a callback forwarded through two component edges emits capture.invoke for the child call', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ForwardedCallback.tsrx',
		source: `
function Child({ onForward }: { onForward: (value: number) => void }) @{
	<button onClick={() => onForward(7)}>Forward</button>
}
function Parent({ onForward }: { onForward: (value: number) => void }) @{
	<Child onForward={onForward} />
}
export function App() @{
	<Parent onForward={(value) => console.log(value)} />
}
`,
		symbols: [],
	});
	const child = result.symbolModules.modules.find(
		(module) => module.kind === 'event-handler',
	);
	const childRow = result.boundSymbolResolver.rows.find(
		(row) => row.baseSymbolId === child?.symbolId,
	);

	expect(child?.source).toContain('await context.capture.invoke(');
	expect(child?.source).not.toContain('context.capture.read(');
	expect(childRow).toEqual(
		expect.objectContaining({
			componentEdgePath: ['component-edge:1', 'component-edge:0'],
			captureSlots: [
				expect.objectContaining({
					route: expect.objectContaining({ kind: 'callback-route' }),
				}),
			],
		}),
	);
});

test('a callback capture read without a call emits a diagnostic and no runnable symbol', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CallbackRead.tsrx',
		source: `
function Child({ onForward }: { onForward: (value: number) => void }) @{
	<button onClick={() => console.log(onForward)}>Inspect</button>
}
export function App() @{
	<Child onForward={(value) => console.log(value)} />
}
`,
		symbols: [],
	});

	expect(result.captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({ code: 'MARKLESS_CAPTURE_OPAQUE_PROP' }),
	]);
	expect(
		result.symbolModules.modules.some((module) => module.kind === 'event-handler'),
	).toBe(false);
});

test('B908 preserves setTimeout deferral while splicing nested writes', () => {
	const source = emitEventHandlerSource({
		id: 'symbol:later',
		source: '() => { setTimeout(() => { count++; }, 50); }',
		writes: [countUpdateWrite()],
	});

	expect(source).toContain('setTimeout(() => {');
	expect(source).toContain('}, 50);');
	expect(source).toContain('context.graph.update({');
});

test('B908 preserves guard clauses around spliced handler writes', () => {
	const source = emitEventHandlerSource({
		id: 'symbol:guarded',
		source: '() => { if (enabled) return; count++; }',
		writes: [countUpdateWrite()],
	});

	expect(source).toContain('if (enabled) return;');
	expect(source).toContain('context.graph.update({');
});

test('B908 reports unsupported captured body locals by name for handler emit', async () => {
	const result = await compileTsrxModule({
		filename: 'src/UnsupportedCapture.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	const localHelper = () => 1;
	let count = state(0);

	<button onClick={() => { count = localHelper(); }}>{count}</button>
}
`,
		symbols: [],
	});

	expect(result.captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			message: expect.stringContaining('localHelper'),
		}),
	]);
});

test('B908 preserves simple count++ handler semantics as a spliced graph write', () => {
	const source = emitEventHandlerSource({
		id: 'symbol:count',
		source: '() => { count++; }',
		writes: [countUpdateWrite()],
	});

	expect(source).toContain(
		"import { marklessWriteScalar } from '@markless/web/fns/write-scalar';",
	);
	expect(source).toContain('return marklessWriteScalar(context, {');
	expect(source).toContain('graphNodeId: "state:count"');
	expect(source).toContain('return Number(value) + 1;');
	expect(source).not.toContain('count++');
});

test('B908 Unit B emits authored optional-chain element handle calls', async () => {
	const result = await compileTsrxModule({
		filename: 'src/OptionalFocusBox.tsrx',
		source: `
import { element } from '@markless/core';

export function App() @{
	const input = element<HTMLInputElement>();

	<>
		<input el={input} />
		<button onClick={() => input?.focus()}>Focus</button>
	</>
}
`,
		symbols: [],
	});

	const handler = result.symbolModules.modules.find((m) => m.kind === 'event-handler');
	expect(handler?.source).toContain('context.getElementHandle("input")?.focus();');
});

test('B908 Unit B collects element handle calls inside nested callbacks', async () => {
	const result = await compileTsrxModule({
		filename: 'src/DeferredFocusBox.tsrx',
		source: `
import { element } from '@markless/core';

export function App() @{
	const input = element<HTMLInputElement>();

	<>
		<input el={input} />
		<button onClick={() => { setTimeout(() => input.focus(), 1); }}>Focus</button>
	</>
}
`,
		symbols: [],
	});

	const handler = result.symbolModules.modules.find((m) => m.kind === 'event-handler');
	expect(handler?.source).toContain(
		'setTimeout(() => context.getElementHandle("input")?.focus(), 1);',
	);
});

test('B908 Unit B ignores element handle lookalikes inside string literals', async () => {
	const result = await compileTsrxModule({
		filename: 'src/StringLookalikeFocusBox.tsrx',
		source: `
import { element, state } from '@markless/core';

export function App() @{
	const input = element<HTMLInputElement>();
	let label = state('');

	<>
		<input el={input} />
		<button onClick={() => { label = "input.focus()"; }}>{label}</button>
	</>
}
`,
		symbols: [],
	});

	const handler = result.symbolModules.modules.find((m) => m.kind === 'event-handler');
	expect(handler?.source).toContain('"input.focus()"');
	expect(handler?.source).not.toContain('getElementHandle');
});

test('B918 emits parent handler handle calls for same-module prop-forwarded handles', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ForwardedFocusBox.tsrx',
		source: `
import { element } from '@markless/core';

function Field(props: { input: unknown }) @{
	<input el={props.input} />
}

export function App() @{
	const field = element<HTMLInputElement>();

	<section>
		<Field input={field} />
		<button onClick={() => field.focus()}>Focus</button>
	</section>
}
`,
		symbols: [],
	});

	const handler = result.symbolModules.modules.find((m) => m.kind === 'event-handler');
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(handler?.source).toContain('context.getElementHandle("field")?.focus();');
});

function emitEventHandlerSource(symbol: any): string {
	return emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					parameters: [],
					order: 0,
					writes: [],
					...symbol,
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	}).modules[0].source;
}

function namedImport(localName: string, source: string) {
	return { localName, importedName: localName, source, kind: 'named' as const };
}

function countUpdateWrite() {
	return {
		source: 'count',
		graphNodeId: 'state:count',
		path: [],
		operation: 'update' as const,
		updateOperator: '++' as const,
		prefix: false,
	};
}

test('emitSymbolModules preserves imports referenced by authored handler bodies', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:guarded',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => { if (clamp(total, 10)) total = 1; }',
					parameters: [],
					moduleImports: [
						{
							localName: 'clamp',
							importedName: 'clamp',
							source: './math',
							kind: 'named',
						},
					],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: '1',
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:guarded',
		kind: 'event-handler',
		exportName: 'symbol_guarded',
	});
	expect(artifact.modules[0].source).toContain('import { clamp } from "./math";');
	expect(artifact.modules[0].source).toContain('if (clamp(total, 10))');
	expect(artifact.modules[0].source).toContain('value: 1');
});

test('emitSymbolModules preserves bare local helper call assignment values in authored bodies', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:localClamp',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = clamp(total, profile.step)',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: 'clamp(total, profile.step)',
						},
					],
					reads: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:localClamp',
		kind: 'event-handler',
		exportName: 'symbol_localClamp',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain(
		'value: clamp(context.graph.read("state:total"), context.graph.read("state:profile", ["step"]))',
	);
	expect(artifact.modules[0].source).not.toContain('void context;');
});

test('emitSymbolModules re-emits namespace imported helper calls for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:namespaceClamp',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = math.clamp(total, profile.step)',
					parameters: [],
					moduleImports: [
						{
							localName: 'math',
							source: './math',
							kind: 'namespace',
						},
					],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: 'math.clamp(total, profile.step)',
						},
					],
					reads: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
						},
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:namespaceClamp',
		kind: 'event-handler',
		exportName: 'symbol_namespaceClamp',
	});
	expect(artifact.modules[0].source).toContain('import * as math from "./math";');
	expect(artifact.modules[0].source).toContain(
		'value: math.clamp(context.graph.read("state:total"), context.graph.read("state:profile", ["step"]))',
	);
});

test('emitSymbolModules emits logical graph-read assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:enable',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => menu.open = menu.open && profile.enabled',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
							operation: 'assign',
							valueSource: 'menu.open && profile.enabled',
						},
					],
					reads: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
						},
						{
							source: 'profile.enabled',
							graphNodeId: 'state:profile',
							path: ['enabled'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:enable',
		kind: 'event-handler',
		exportName: 'symbol_enable',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:menu"');
	expect(artifact.modules[0].source).toContain('path: ["open"]');
	expect(artifact.modules[0].source).toContain(
		'value: context.graph.read("state:menu", ["open"]) && context.graph.read("state:profile", ["enabled"])',
	);
});

test('emitSymbolModules emits unary graph-read assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:toggle',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => menu.open = !menu.open',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
							operation: 'assign',
							valueSource: '!menu.open',
						},
					],
					reads: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:toggle',
		kind: 'event-handler',
		exportName: 'symbol_toggle',
	});
	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:menu"');
	expect(artifact.modules[0].source).toContain('path: ["open"]');
	expect(artifact.modules[0].source).toContain(
		'value: !context.graph.read("state:menu", ["open"])',
	);
});

test('emitSymbolModules emits prefix unary graph-read assignment values for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:negate',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = -profile.step',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: '-profile.step',
						},
					],
					reads: [
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
				{
					id: 'symbol:positive',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = +profile.step',
					parameters: [],
					order: 1,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: '+profile.step',
						},
					],
					reads: [
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
				{
					id: 'symbol:bitwise',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = ~profile.step',
					parameters: [],
					order: 2,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: '~profile.step',
						},
					],
					reads: [
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	const negateModule = artifact.modules.find((module) => module.symbolId === 'symbol:negate');
	const positiveModule = artifact.modules.find((module) => module.symbolId === 'symbol:positive');
	const bitwiseModule = artifact.modules.find((module) => module.symbolId === 'symbol:bitwise');

	expect(artifact.modules).toHaveLength(3);
	expect(negateModule).toMatchObject({
		symbolId: 'symbol:negate',
		kind: 'event-handler',
		exportName: 'symbol_negate',
	});
	expect(negateModule?.source).toContain('context.graph.write({');
	expect(negateModule?.source).toContain('graphNodeId: "state:total"');
	expect(negateModule?.source).toContain('path: []');
	expect(negateModule?.source).toContain('value: -context.graph.read("state:profile", ["step"])');
	expect(positiveModule?.source).toContain(
		'value: +context.graph.read("state:profile", ["step"])',
	);
	expect(bitwiseModule?.source).toContain(
		'value: ~context.graph.read("state:profile", ["step"])',
	);
});

test('emitSymbolModules emits compound assignments for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:add',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total += profile.step',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							assignmentOperator: '+=',
							valueSource: 'profile.step',
						},
					],
					reads: [
						{
							source: 'profile.step',
							graphNodeId: 'state:profile',
							path: ['step'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:add',
		kind: 'event-handler',
		exportName: 'symbol_add',
	});
	expect(artifact.modules[0].source).toContain('context.graph.update({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:total"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain('returnValue: "next"');
	expect(artifact.modules[0].source).toContain(
		'return value + context.graph.read("state:profile", ["step"]);',
	);
});

test('emitSymbolModules emits logical compound assignments for event handler modules', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:enable',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => menu.open &&= profile.enabled',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'menu.open',
							graphNodeId: 'state:menu',
							path: ['open'],
							operation: 'assign',
							assignmentOperator: '&&=',
							valueSource: 'profile.enabled',
						},
					],
					reads: [
						{
							source: 'profile.enabled',
							graphNodeId: 'state:profile',
							path: ['enabled'],
						},
					],
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.modules).toHaveLength(1);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:enable',
		kind: 'event-handler',
		exportName: 'symbol_enable',
	});
	expect(artifact.modules[0].source).toContain('context.graph.update({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:menu"');
	expect(artifact.modules[0].source).toContain('path: ["open"]');
	expect(artifact.modules[0].source).toContain('returnValue: "next"');
	expect(artifact.modules[0].source).toContain(
		'return value && context.graph.read("state:profile", ["enabled"]);',
	);
});

test('emitSymbolModules emits branch-update flip modules from plan arm parts', async () => {
	const result = await compileTsrxModule({
		filename: 'src/BranchFlipModule.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let open = state(true);
	let label = state('On');

	<section>
		@if (open) { <p class="badge">{label}</p> } @else { <p>Off</p> }
	</section>
}
`,
		symbols: [],
	});

	const branchModule = result.symbolModules.modules.find(
		(module) => module.kind === 'branch-update',
	);
	expect(branchModule).toBeDefined();
	const imported = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(branchModule!.source)}`
	)) as Record<string, (context: unknown) => { arm: number; html: string }>;
	const run = imported[branchModule!.exportName]!;

	const graph = (open: boolean, label: string) => ({
		read(graphNodeId: string) {
			return graphNodeId === 'state:open' ? open : label;
		},
	});
	expect(run({ graph: graph(true, 'On') })).toEqual({
		arm: 0,
		html: '<p class="badge">On</p>',
	});
	expect(run({ graph: graph(false, 'On') })).toEqual({ arm: 1, html: '<p>Off</p>' });
});

test('emitSymbolModules emits switch flip modules selecting arms by case tests', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SwitchFlipModule.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let kind = state('a');

	<section>
		@switch (kind) {
			@case 'a': { <p>A</p> }
			@case 'b': { <p>B</p> }
			@default: { <p>D</p> }
		}
	</section>
}
`,
		symbols: [],
	});

	const branchModule = result.symbolModules.modules.find(
		(module) => module.kind === 'branch-update',
	);
	expect(branchModule).toBeDefined();
	expect(result.protocolView.branches?.[0]).toEqual(
		expect.objectContaining({ armTests: ['a', 'b', null] }),
	);
	const imported = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(branchModule!.source)}`
	)) as Record<string, (context: unknown) => { arm: number; html: string }>;
	const run = imported[branchModule!.exportName]!;
	const graph = (kind: string) => ({ read: () => kind });

	expect(run({ graph: graph('a') })).toEqual({ arm: 0, html: '<p>A</p>' });
	expect(run({ graph: graph('b') })).toEqual({ arm: 1, html: '<p>B</p>' });
	expect(run({ graph: graph('zzz') })).toEqual({ arm: 2, html: '<p>D</p>' });
});

test('emitSymbolModules keeps element-handle calls in event handlers, in statement order', async () => {
	const result = await compileTsrxModule({
		filename: 'src/FocusBox.tsrx',
		source: `
import { element, state } from '@markless/core';

export function App() @{
	let status = state('idle');
	const box = element();

	<main>
		<input el={box} placeholder="Name" />
		<button onClick={() => { box.focus(); status = 'focused'; }}>Focus</button>
		<output>{status}</output>
	</main>
}
`,
		symbols: [],
	});

	const handler = result.symbolModules.modules.find((m) => m.kind === 'event-handler');
	expect(handler).toBeDefined();
	const focusCall = handler!.source.indexOf('context.getElementHandle("box")?.focus()');
	const statusWrite = handler!.source.indexOf('state:status');
	// The handle call must be emitted, and before the write (authored order).
	expect(focusCall).toBeGreaterThanOrEqual(0);
	expect(statusWrite).toBeGreaterThan(focusCall);
});

test('emitSymbolModules emits async-boundary-update modules rendering settled arms', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncFlip.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let query = state('markless');
	let details = computed(async () => {
		return { title: 'Result: ' + query };
	});

	<main>
		@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		symbols: [],
	});

	const update = result.symbolModules.modules.find(
		(module) => module.kind === 'async-boundary-update',
	);
	expect(update).toBeDefined();
	// Protocol boundary records carry the update symbol for the runtime.
	expect(result.protocolView.asyncBoundaries[0]).toEqual(
		expect.objectContaining({ updateSymbolId: update!.symbolId }),
	);

	const imported = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(update!.source)}`
	)) as Record<string, (context: unknown) => { arm: number; html: string }>;
	const run = imported[update!.exportName]!;
	const graph = {
		read: (graphNodeId: string, path?: ReadonlyArray<string>) =>
			graphNodeId === 'computed:details' && path?.[0] === 'title'
				? 'Result: markless'
				: undefined,
	};
	// Fulfilled renders the @try arm from graph reads; rejected renders @catch.
	expect(run({ graph, status: 'fulfilled' })).toEqual({
		arm: 0,
		html: '<p>Result: markless</p>',
	});
	expect(run({ graph, status: 'rejected' })).toEqual({ arm: 1, html: '<p>Broken</p>' });
});

test('plain-content @try arms keep the cheap parts-based update module (no component machinery)', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncPlain.tsrx',
		source: `
import { computed } from '@markless/core';

export function App() @{
	const details = computed(async () => ({ title: 'ok' }));
	<main>
		@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		symbols: [],
	});

	const update = result.symbolModules.modules.find(
		(module) => module.kind === 'async-boundary-update',
	);
	expect(update).toBeDefined();
	// Tier discipline: the smallest provable tier stays selected.
	expect(update!.source).toContain('marklessBoundaryArms');
	expect(update!.source).not.toContain('marklessCsrRenderChild');
});

// D4: when the arm-render tier cannot support a shape, the diagnostic speaks
// the author's words — never "arm", "tier", "boundary", or "anchor".


test('same-module helper components containing @try diagnose the dropped content in author vocabulary', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Widgets.tsrx',
		source: `
import { computed, state } from '@markless/core';

export default function Page() @{
	<main>
		<Widget />
	</main>
}

export function Widget() @{
	let n = state(0);
	const data = computed(async () => ({ label: 'live' }));
	<section>
		@try { <button class="bump" onClick={() => n++}>{data.label}</button> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</section>
}
`,
		symbols: [],
	});

	const diagnostic = result.publicRenderPlan.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
	);
	expect(diagnostic?.message).toBe(
		'<Widget> contains an @try block, but <Widget> is a helper component in the same file as the page. Its @try/@pending/@catch content is dropped from the rendered HTML. markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package',
	);
	expect(diagnostic?.suggestions?.[0]?.message).toBe(
		'Move <Widget> into its own .tsrx file and import it, or move the @try block into the page component.',
	);
});


test('branch-update modules defer to the runtime-computed arm when provided', async () => {
	const result = await compileTsrxModule({
		filename: 'src/PropBranch.tsrx',
		source: `
export function Badge({ active }) @{
	<span>
		@if (active) { <em>Live</em> } @else { <em>Idle</em> }
	</span>
}
`,
		symbols: [],
	});
	const update = result.symbolModules.modules.find((m) => m.kind === 'branch-update');
	expect(update).toBeDefined();
	const imported = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(update!.source)}`
	)) as Record<string, (context: unknown) => { arm: number; html: string }>;
	const run = imported[update!.exportName]!;

	// Composed views remap the record's test reads, but the module's baked
	// test expression still reads the child-local prop node — which the
	// composed graph does not have. The runtime computes the arm from the
	// remapped reads and passes it; the module must defer to it.
	const graph = { read: () => undefined };
	expect(run({ graph, arm: 0 })).toEqual({ arm: 0, html: '<em>Live</em>' });
	expect(run({ graph, arm: 1 })).toEqual({ arm: 1, html: '<em>Idle</em>' });
});
