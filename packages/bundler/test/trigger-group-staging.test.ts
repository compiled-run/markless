import { expect, test } from 'vitest';
import {
	emitPrerenderTriggerGroupModule,
	planPrerenderTriggerGroups,
} from '../src/trigger-groups.ts';

test('plans an exact bound trigger without pulling an unrelated state and patch group', () => {
	const groups = planPrerenderTriggerGroups({
		filename: '/workspace/src/App.tsrx',
		state: {
			version: 1,
			cells: [
				{ graphNodeId: 'state:playing', name: 'playing', valueKind: 'scalar', value: false },
				{ graphNodeId: 'state:menu', name: 'menu', valueKind: 'scalar', value: false },
			],
			computed: [],
		},
		view: {
			version: 1,
			locators: [
				{ hostNodeId: 'c0:h0', strategy: 'dom-order', index: 3, tagName: 'button' },
				{ hostNodeId: 'c0:h1', strategy: 'dom-order', index: 4, tagName: 'span' },
				{ hostNodeId: 'c1:h0', strategy: 'dom-order', index: 8, tagName: 'button' },
				{ hostNodeId: 'c1:h1', strategy: 'dom-order', index: 9, tagName: 'span' },
			],
			events: [
				{ hostNodeId: 'c0:h0', eventName: 'click', symbolIds: ['bound:play'] },
				{ hostNodeId: 'c1:h0', eventName: 'click', symbolIds: ['bound:menu'] },
			],
			domUpdates: [
				{ hostNodeId: 'c0:h1', source: 'playing', graphNodeId: 'state:playing', path: [], target: { kind: 'text' }, symbolId: 'bound:play-patch' },
				{ hostNodeId: 'c1:h1', source: 'menu', graphNodeId: 'state:menu', path: [], target: { kind: 'text' }, symbolId: 'bound:menu-patch' },
			],
			behaviors: [], elementHandles: [], keyedRepeats: [], branches: [], asyncBoundaries: [],
		},
		triggerGroups: { passId: 'trigger-groups', groups: [] },
		symbolResolver: {
			passId: 'symbol-resolver', dynamicImportOwner: 'generated-symbol-resolver', syncPolicies: [], diagnostics: [],
			symbols: [
				{ id: 'symbol:play-callback', kind: 'callback-prop', componentEdgeId: 'edge:0', propName: 'onPlay', source: '() => playing = !playing', reads: [{ source: 'playing', graphNodeId: 'state:playing', path: [] }], writes: [{ source: 'playing = !playing', graphNodeId: 'state:playing', path: [], operation: 'assign' }] },
			],
		},
		boundRows: [
			{ id: 'bound:play', baseSymbolId: 'imported:play', componentEdgePath: ['edge:0'], ancestry: [], captureSlots: [{ slotId: 'play', path: [], route: { kind: 'callback-route', componentEdgeId: 'edge:0', componentEdgePath: ['edge:0'], callbackSymbolId: 'symbol:play-callback' } }] },
			{ id: 'bound:play-patch', baseSymbolId: 'imported:play-patch', componentEdgePath: ['edge:0'], ancestry: [], captureSlots: [{ slotId: 'playing', path: [], route: { kind: 'graph-reference', componentEdgeId: 'edge:0', componentEdgePath: ['edge:0'], graphNodeId: 'state:playing' } }] },
		],
	});

	expect(groups[0]).toMatchObject({
		id: 'c0:h0:click',
		graphNodeIds: ['state:playing'],
		symbolIds: ['bound:play', 'bound:play-patch', 'imported:play', 'imported:play-patch', 'symbol:play-callback'],
	});
	expect(groups[0]?.state.cells.map((cell) => cell.graphNodeId)).toEqual(['state:playing']);
	expect(groups[0]?.view.events).toHaveLength(1);
	expect(groups[0]?.view.domUpdates).toHaveLength(1);
	expect(groups[0]?.view.locators.map((locator) => locator.hostNodeId)).toEqual(['c0:h0', 'c0:h1']);
});

test('plans zero-input behavior activation from the compiler-owned trigger group', () => {
	const groups = planPrerenderTriggerGroups({
		filename: '/workspace/src/App.tsrx',
		state: {
			version: 1,
			cells: [
				{ graphNodeId: 'state:playing', name: 'playing', valueKind: 'scalar', value: false },
			],
			computed: [],
		},
		view: {
			version: 1,
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
			domUpdates: [],
			behaviors: [{
				hostNodeId: 'h0',
				source: 'installController',
				functionSource: 'installController',
				inputSources: [],
				inputValues: [],
				inputGraphReads: [],
				symbolId: 'symbol:controller',
			}],
			elementHandles: [], keyedRepeats: [], branches: [], asyncBoundaries: [],
		},
		triggerGroups: {
			passId: 'trigger-groups',
			groups: [{
				// Final composed host ids are assigned after this module-local
				// compiler artifact is produced.
				id: 'local:h1:click',
				hostNodeId: 'local:h1',
				eventName: 'click',
				graphNodeIds: ['state:playing'],
				payloadRecordIds: ['event:h1:click', 'behavior:h0:symbol:controller'],
				symbolIds: ['symbol:click', 'symbol:controller'],
			}],
		},
		symbolResolver: {
			passId: 'symbol-resolver', dynamicImportOwner: 'generated-symbol-resolver', syncPolicies: [], diagnostics: [],
			symbols: [
				{ id: 'symbol:click', kind: 'event-handler', hostNodeId: 'h1', eventName: 'click', source: '() => playing = !playing', parameters: [], order: 0, writes: [{ source: 'playing = !playing', graphNodeId: 'state:playing', path: [], operation: 'assign' }] },
				{ id: 'symbol:controller', kind: 'behavior', hostNodeId: 'h0', source: 'installController', functionSource: 'installController', inputSources: [], order: 1 },
			],
		},
		boundRows: [],
	});

	expect(groups[0]?.symbolIds).toContain('symbol:controller');
	expect(groups[0]?.view.behaviors.map((behavior) => behavior.symbolId)).toEqual([
		'symbol:controller',
	]);
	expect(groups[0]?.view.locators.map((locator) => locator.hostNodeId)).toEqual(['h0', 'h1']);
});

test('keeps symbol route tables exhaustive while the routed symbols stay lazy', () => {
	const source = emitPrerenderTriggerGroupModule({
		group: {
			id: 'h0:click',
			hostNodeId: 'h0',
			eventName: 'click',
			hostIndex: 0,
			hostTagName: 'button',
			graphNodeIds: [],
			symbolIds: ['symbol:local'],
			state: { version: 1, cells: [], computed: [] },
			view: {
				version: 1,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
		},
		symbols: [{ id: 'symbol:local', chunk: './local.js', exportName: 'local' }],
		boundRows: [],
		symbolRoutes: [
			{ prefix: 'c0:', importSource: './ChildA.tsrx' },
			{ prefix: 'c1:', importSource: './ChildB.tsrx' },
		],
	});

	expect(source).toContain('symbolId.startsWith("c0:")');
	expect(source).toContain('symbolId.startsWith("c1:")');
});

test('keeps every arm record and its lazy symbols when a staged group touches a branch', () => {
	const groups = planPrerenderTriggerGroups({
		filename: '/workspace/src/Branch.tsrx',
		state: {
			version: 1,
			cells: [
				{ graphNodeId: 'state:open', name: 'open', valueKind: 'scalar', value: false },
				{ graphNodeId: 'state:arm', name: 'arm', valueKind: 'scalar', value: 0 },
			],
			computed: [],
		},
		view: {
			version: 1,
			locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' }],
			events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:event'] }],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			branches: [{
				id: 'branch:0',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				symbolId: 'symbol:flip',
				testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
				armRecords: [
					{ events: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:arm-zero'] }], domUpdates: [], behaviors: [], elementHandles: [] },
					{ events: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:arm-one'] }], domUpdates: [{ graphNodeId: 'state:arm', symbolId: 'symbol:arm-patch' }], behaviors: [], elementHandles: [] },
				],
			}],
			asyncBoundaries: [],
		},
		triggerGroups: { passId: 'trigger-groups', groups: [] },
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [{
				id: 'symbol:event', kind: 'event-handler', hostNodeId: 'h0', eventName: 'click',
				source: '() => open = !open', parameters: [], order: 0,
				writes: [{ source: 'open = !open', graphNodeId: 'state:open', path: [], operation: 'assign' }],
			}],
		},
		boundRows: [],
	});

	expect(groups[0]?.view.branches?.[0]?.armRecords).toHaveLength(2);
	expect(groups[0]?.graphNodeIds).toEqual(['state:arm', 'state:open']);
	expect(groups[0]?.symbolIds).toEqual([
		'symbol:arm-one',
		'symbol:arm-patch',
		'symbol:arm-zero',
		'symbol:event',
		'symbol:flip',
	]);
	expect(groups[1]).toMatchObject({
		id: 'branch:branch:0:click:0',
		branchStartIndex: 0,
		branchEndIndex: 1,
		hostPath: [0],
		eventName: 'click',
	});
	expect(groups[1]?.view.events).toEqual([]);
	expect(groups[1]?.view.branches?.[0]?.armRecords).toHaveLength(2);
	expect(groups[1]?.symbolIds).toEqual([
		'symbol:arm-one',
		'symbol:arm-patch',
		'symbol:arm-zero',
		'symbol:flip',
	]);
});
