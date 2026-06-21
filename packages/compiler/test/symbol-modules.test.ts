import { expect, test } from 'vitest';
import { emitSymbolModules } from '../src/passes/symbol-modules.ts';

test('emitSymbolModules emits event and DOM update modules that consume resume context', () => {
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
	expect(artifact.modules).toHaveLength(2);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:click',
		kind: 'event-handler',
		exportName: 'symbol_click',
	});
	expect(artifact.modules[0].source).not.toContain('authoredSource');
	expect(artifact.modules[0].source).toContain('export function symbol_click(context)');
	expect(artifact.modules[0].source).toContain('context.graph.update({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:count"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain('return Number(value) + 1;');
	expect(artifact.modules[1]).toMatchObject({
		symbolId: 'symbol:domUpdate',
		kind: 'dom-update',
		exportName: 'symbol_domUpdate',
	});
	expect(artifact.modules[1].source).not.toContain('import ');
	expect(artifact.modules[1].source).not.toContain('createDomUpdateEntry');
	expect(artifact.modules[1].source).toContain('export function symbol_domUpdate(context)');
	expect(artifact.modules[1].source).toContain('type: "setProp"');
	expect(artifact.modules[1].source).toContain('locator: context.domUpdate?.hostNodeId ?? "h1"');
	expect(artifact.modules[1].source).toContain('name: "value"');
	expect(artifact.modules[1].source).toContain('value: context.value');
});

test('emitSymbolModules emits repeat-local assignment values through context locals', () => {
	const artifact = emitSelectAssignmentSymbol('entry.code', repeatLocalPublicRenderPlan());

	expect(artifact.modules[0].source).toContain('context.graph.write({');
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:selected"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain('value: context.locals?.entry?.code');
});

test('emitSymbolModules does not treat unproven dotted assignment values as repeat locals', () => {
	const artifact = emitSelectAssignmentSymbol('external.code');

	expect(artifact.modules[0].source).not.toContain('context.locals');
	expect(artifact.modules[0].source).not.toContain('context.graph.write');
});

function emitSelectAssignmentSymbol(valueSource: string, publicRenderPlan?: any) {
	return emitSymbolModules({
		publicRenderPlan,
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

function repeatLocalPublicRenderPlan() {
	return {
		keyedRepeats: [
			{
				eventControls: [
					{
						symbolId: 'symbol:select',
						itemContext: { itemName: 'entry' },
					},
				],
			},
		],
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

		expect(artifact.modules[0].source).not.toContain('import ');
		expect(artifact.modules[0].source).not.toContain('createDomUpdateEntry');
		for (const expected of targetCase.expected) {
			expect(artifact.modules[0].source).toContain(expected);
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
	expect(artifact.modules[0].source).toContain('const query = read("state:query", []);');
	expect(artifact.modules[0].source).toContain(
		'const run = async ({ signal }) => fetch("/api/user/" + query, { signal });',
	);
	expect(artifact.modules[0].source).toContain(
		'return run({ key: context.key, signal: context.signal, read });',
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
	expect(artifact.modules[0].source).toContain(
		'args: [context.event?.currentTarget?.value, "fallback"]',
	);
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
		'args: [...context.graph.read("state:nextItems", []), "tail"]',
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
	expect(artifact.modules[0].source).toContain('value: context.event?.currentTarget?.value');
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
		'value: context.graph.read("state:total", []) + context.graph.read("state:profile", ["step"])',
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
		'value: (context.graph.read("state:total", []) + context.graph.read("state:profile", ["step"])) * context.graph.read("state:profile", ["scale"])',
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
		'value: context.graph.read("state:menu", ["open"]) ? context.graph.read("state:profile", ["step"]) : context.graph.read("state:total", [])',
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
		'value: [context.graph.read("state:nextItem", []), "fallback"]',
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
		'value: [...context.graph.read("state:nextItems", []), context.graph.read("state:nextItem", [])]',
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
	expect(artifact.modules[0].source).toContain(
		'value: [, context.graph.read("state:nextItem", [])]',
	);
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
		'value: { ...context.graph.read("state:settings", []), title: context.graph.read("state:menu", ["title"]) }',
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
		'value: Math.max(context.graph.read("state:total", []), context.graph.read("state:profile", ["step"]))',
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
		'value: clamp(context.graph.read("state:total", []), context.graph.read("state:profile", ["step"]))',
	);
});

test('emitSymbolModules omits event imports that are not referenced by emitted writes', () => {
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
	expect(artifact.modules[0].source).not.toContain('import { clamp } from "./math";');
	expect(artifact.modules[0].source).toContain('value: 1');
});

test('emitSymbolModules does not emit bare local helper call assignment values', () => {
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
	expect(artifact.modules[0].source).not.toContain('context.graph.write({');
	expect(artifact.modules[0].source).not.toContain('value: clamp(');
	expect(artifact.modules[0].source).toContain('void context;');
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
		'value: math.clamp(context.graph.read("state:total", []), context.graph.read("state:profile", ["step"]))',
	);
});

test('emitSymbolModules does not emit unimported member helper call assignment values', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:memberClamp',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => total = helpers.clamp(total, profile.step)',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'total',
							graphNodeId: 'state:total',
							path: [],
							operation: 'assign',
							valueSource: 'helpers.clamp(total, profile.step)',
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
		symbolId: 'symbol:memberClamp',
		kind: 'event-handler',
		exportName: 'symbol_memberClamp',
	});
	expect(artifact.modules[0].source).not.toContain('context.graph.write({');
	expect(artifact.modules[0].source).not.toContain('value: helpers.clamp(');
	expect(artifact.modules[0].source).toContain('void context;');
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
