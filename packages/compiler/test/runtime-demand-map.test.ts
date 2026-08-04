import { expect, test } from 'vitest';
import { PROTOCOL_EVENT_ACTION_KIND } from '@markless/serializer';
import { createRuntimeDemandMap } from '../src/passes/runtime-demand-map.ts';

test('external delegation is an explicit runtime-demand no-op', () => {
	const result = createRuntimeDemandMap({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [],
		},
		symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
		publicRenderModule: {
			passId: 'public-render-module',
			moduleSource: '',
			ssrModuleSource: '',
			rootExportName: null,
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
				{
					hostNodeId: 'router:link',
					eventName: 'click',
					symbolIds: [],
					action: {
						kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
						owner: 'router',
					},
				},
			],
			domUpdates: [],
			asyncBoundaries: [],
		},
		protocolState: { version: 1, cells: [], computed: [] },
	} as never, 'prerender');

	expect(result.recordKinds).toContainEqual({
		kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
		replaced: false,
	}, 'prerender');
	expect(result.payloadRecords).toEqual([
		expect.objectContaining({
			kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
			runtimeModuleIds: [],
		}),
	]);
	expect(result.actions).toEqual([
		expect.objectContaining({
			recordKind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
			recordKinds: [PROTOCOL_EVENT_ACTION_KIND.externalDelegate],
			payloadRecordIds: ['external-delegate:router:link:click'],
			runtimeModuleIds: [],
		}),
	]);
});

test('scalar routing is explicit for plain SSR and prerender classes', () => {
	const input = {
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:click',
					kind: 'event-handler',
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
				{
					id: 'symbol:text',
					kind: 'dom-update',
					source: 'count',
					graphNodeId: 'state:count',
					path: [],
					target: { kind: 'text' },
				},
			],
		} as never,
		symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
		publicRenderModule: {
			passId: 'public-render-module',
			moduleSource: '',
			ssrModuleSource: '',
			rootExportName: null,
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
				{ hostNodeId: 'host:button', eventName: 'click', symbolIds: ['symbol:click'] },
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
			asyncBoundaries: [],
		} as never,
		protocolState: { version: 1, cells: [], computed: [] },
	} as const;
	const prerender = createRuntimeDemandMap(input as never, 'prerender');
	const plainSsr = createRuntimeDemandMap(input as never, 'plain-ssr');

	expect(prerender.recordKinds.every((record) => record.replaced === false)).toBe(true);
	expect(prerender.actions[0]?.plan).toBeUndefined();
	expect(prerender.payloadRecords[0]?.runtimeModuleIds).toEqual(
		expect.arrayContaining(['web/resume-runtime', 'web/payload-resume']),
	);
	for (const moduleId of [
		'web/fns/scalar-specialized',
		'web/fns/write-scalar',
		'web/fns/update-text',
		'web/event-only-lean/row',
		'web/event-only-lean/lean-shared',
	]) {
		expect(prerender.unknownRecordModuleIds).not.toContain(moduleId);
	}

	expect(plainSsr.recordKinds).toContainEqual({ kind: 'event', replaced: true });
	expect(plainSsr.recordKinds).toContainEqual({ kind: 'dom-update', replaced: true });
	expect(plainSsr.actions[0]?.plan).toMatchObject({
		version: 1,
		kind: 'scalar',
		symbolId: 'symbol:click',
		cell: 'state:count',
	});
	expect(plainSsr.payloadRecords[0]?.runtimeModuleIds).toEqual(
		expect.arrayContaining([
			'web/fns/dom-order',
			'web/fns/scalar-specialized',
			'web/fns/write-scalar',
			'web/fns/update-text',
		]),
	);
});

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
			ssrModuleSource: '',
			rootExportName: null,
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
		protocolState: { version: 1, cells: [], computed: [] },
	}, 'prerender');

	const action = result.actions[0];
	expect(action?.recordKinds).toEqual(
		expect.arrayContaining(['event', 'dom-update', 'async-boundary']),
	);
	expect(action?.plan).toBeUndefined();
	expect(result.unknownRecordModuleIds).toContain('core/web/resume-storage-free');
	expect(result.unknownRecordModuleIds).toContain('web/payload-full-storage-free');
	expect(result.unknownRecordModuleIds).not.toContain('core/web/resume');
	expect(result.unknownRecordModuleIds).not.toContain('web/payload-full');
});
