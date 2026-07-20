import { expect, test } from 'vitest';
import { createRuntimeDemandMap } from '../src/passes/runtime-demand-map.ts';

test('callback capture writes close over DOM and async subscribers and disable scalar plans', () => {
	const result = createRuntimeDemandMap({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:child',
					kind: 'event-handler',
					source: '() => onSave()',
					parameters: [],
					reads: [],
					writes: [],
				},
				{
					id: 'symbol:parent',
					kind: 'callback-prop',
					source: '() => count++',
					parameters: [],
					reads: [],
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
			],
		} as never,
		captureAnalysis: {
			passId: 'capture-analysis',
			diagnostics: [],
			boundResolverRows: [],
			extractedSymbols: [
				{
					symbolId: 'symbol:child',
					kind: 'event-handler',
					source: '() => onSave()',
					captureSlots: [
						{
							id: 'slot:onSave',
							bindingId: 'binding:onSave',
							source: 'onSave',
							owner: {},
							path: [],
							routes: [
								{
									kind: 'callback-route',
									componentEdgeId: 'edge:0',
									callbackSymbolId: 'symbol:parent',
								},
							],
						},
					],
				},
			],
		},
		symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
		publicRenderModule: {
			passId: 'public-render-module',
			moduleSource: '',
			csrModuleSource: '',
			ssrModuleSource: '',
			rootExportName: null,
			csrExportName: null,
			ssrExportName: null,
			diagnostics: [],
		},
		protocolView: {
			version: 1,
			locators: [],
			behaviors: [],
			elementHandles: [],
			branches: [],
			keyedRepeats: [],
			events: [
				{ hostNodeId: 'host:button', eventName: 'click', symbolIds: ['symbol:child'] },
			],
			domUpdates: [
				{
					hostNodeId: 'host:output',
					graphNodeId: 'state:count',
					path: [],
					symbolId: 'symbol:text',
					target: { kind: 'text' },
				},
			],
			asyncBoundaries: [
				{
					id: 'async:0',
					kind: 'async-boundary',
					anchorOrder: 0,
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'count',
							graphNodeId: 'state:count',
							path: [],
							runnerSymbolId: 'symbol:runner',
						},
					],
					armRecords: [],
				},
			],
		} as never,
	});

	const action = result.actions[0];
	expect(action?.recordKinds).toEqual(
		expect.arrayContaining(['event', 'dom-update', 'async-boundary']),
	);
	expect(action?.plan).toBeUndefined();
});
