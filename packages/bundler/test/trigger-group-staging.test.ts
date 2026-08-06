import { expect, test } from 'vitest';
import { PROTOCOL_EVENT_ACTION_KIND } from '@markless/serializer';
import {
	emitPrerenderBoundaryRendererModule,
	emitPrerenderTriggerGroupModule,
	planPrerenderTriggerGroups,
} from '../src/trigger-groups.ts';

test('external delegation does not stage a browser wake group', () => {
	const groups = planPrerenderTriggerGroups({
		filename: '/workspace/src/LinkPage.tsrx',
		state: { version: 1, cells: [], computed: [] },
		view: {
			version: 1,
			locators: [
				{
					hostNodeId: 'router:link',
					strategy: 'dom-order',
					index: 1,
					tagName: 'a',
				},
			],
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
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		triggerGroups: { passId: 'trigger-groups', groups: [] },
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [],
		},
		boundRows: [],
	});

	expect(groups).toEqual([]);
});

test('plans an exact bound trigger without pulling an unrelated state and patch group', () => {
	const groups = planPrerenderTriggerGroups({
		filename: '/workspace/src/App.tsrx',
		state: {
			version: 1,
			cells: [
				{
					graphNodeId: 'state:playing',
					name: 'playing',
					valueKind: 'scalar',
					value: false,
				},
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
				{
					hostNodeId: 'c0:h1',
					source: 'playing',
					graphNodeId: 'state:playing',
					path: [],
					target: { kind: 'text' },
					symbolId: 'bound:play-patch',
				},
				{
					hostNodeId: 'c1:h1',
					source: 'menu',
					graphNodeId: 'state:menu',
					path: [],
					target: { kind: 'text' },
					symbolId: 'bound:menu-patch',
				},
			],
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [],
			branches: [],
			asyncBoundaries: [],
		},
		triggerGroups: { passId: 'trigger-groups', groups: [] },
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:play-callback',
					kind: 'callback-prop',
					componentEdgeId: 'edge:0',
					propName: 'onPlay',
					source: '() => playing = !playing',
					reads: [{ source: 'playing', graphNodeId: 'state:playing', path: [] }],
					writes: [
						{
							source: 'playing = !playing',
							graphNodeId: 'state:playing',
							path: [],
							operation: 'assign',
						},
					],
				},
			],
		},
		boundRows: [
			{
				id: 'bound:play',
				baseSymbolId: 'imported:play',
				componentEdgePath: ['edge:0'],
				ancestry: [],
				captureSlots: [
					{
						slotId: 'play',
						path: [],
						route: {
							kind: 'callback-route',
							componentEdgeId: 'edge:0',
							componentEdgePath: ['edge:0'],
							callbackSymbolId: 'symbol:play-callback',
						},
					},
				],
			},
			{
				id: 'bound:play-patch',
				baseSymbolId: 'imported:play-patch',
				componentEdgePath: ['edge:0'],
				ancestry: [],
				captureSlots: [
					{
						slotId: 'playing',
						path: [],
						route: {
							kind: 'graph-reference',
							componentEdgeId: 'edge:0',
							componentEdgePath: ['edge:0'],
							graphNodeId: 'state:playing',
						},
					},
				],
			},
		],
	});

	expect(groups[0]).toMatchObject({
		id: 'c0:h0:click',
		graphNodeIds: ['state:playing'],
		symbolIds: [
			'bound:play',
			'bound:play-patch',
			'imported:play',
			'imported:play-patch',
			'symbol:play-callback',
		],
	});
	expect(groups[0]?.state.cells.map((cell) => cell.graphNodeId)).toEqual(['state:playing']);
	expect(groups[0]?.view.events).toHaveLength(1);
	expect(groups[0]?.view.domUpdates).toHaveLength(1);
	expect(groups[0]?.view.locators.map((locator) => locator.hostNodeId)).toEqual([
		'c0:h0',
		'c0:h1',
	]);
});

test('plans zero-input behavior activation from the compiler-owned trigger group', () => {
	const groups = planPrerenderTriggerGroups({
		filename: '/workspace/src/App.tsrx',
		state: {
			version: 1,
			cells: [
				{
					graphNodeId: 'state:playing',
					name: 'playing',
					valueKind: 'scalar',
					value: false,
				},
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
			behaviors: [
				{
					hostNodeId: 'h0',
					source: 'installController',
					functionSource: 'installController',
					inputSources: [],
					inputValues: [],
					inputGraphReads: [],
					symbolId: 'symbol:controller',
				},
			],
			elementHandles: [],
			keyedRepeats: [],
			branches: [],
			asyncBoundaries: [],
		},
		triggerGroups: {
			passId: 'trigger-groups',
			groups: [
				{
					// Final composed host ids are assigned after this module-local
					// compiler artifact is produced.
					id: 'local:h1:click',
					hostNodeId: 'local:h1',
					eventName: 'click',
					graphNodeIds: ['state:playing'],
					payloadRecordIds: ['event:h1:click', 'behavior:h0:symbol:controller'],
					symbolIds: ['symbol:click', 'symbol:controller'],
				},
			],
		},
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:click',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => playing = !playing',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'playing = !playing',
							graphNodeId: 'state:playing',
							path: [],
							operation: 'assign',
						},
					],
				},
				{
					id: 'symbol:controller',
					kind: 'behavior',
					hostNodeId: 'h0',
					source: 'installController',
					functionSource: 'installController',
					inputSources: [],
					order: 1,
				},
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

test('self-wake groups render settled arms through their demand-loaded update symbol', () => {
	const source = emitPrerenderTriggerGroupModule({
		group: {
			id: 'self-wake',
			hostNodeId: 'self-wake',
			eventName: 'self-wake',
			hostIndex: -1,
			hostTagName: '*',
			graphNodeIds: ['computed:feed'],
			symbolIds: ['symbol:settle'],
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
		symbols: [{ id: 'symbol:settle', chunk: './settle.js', exportName: 'settle' }],
		boundRows: [],
		armRendererModuleId: 'virtual:markless:trigger-group:App:1',
	});

	expect(source).toContain('"./settle.js"');
	expect(source).not.toContain('fetchLocalUpdates');
	expect(source).not.toContain('initialWeight');
	expect(source).toContain(
		'import { prepareBoundaryArm as marklessPrepareBoundaryArm, renderBoundaryArm as marklessRenderBoundaryArm } from "virtual:markless:trigger-group:App:1";',
	);
	expect(source).toContain('marklessPrepareBoundaryArm(boundaryId, status, graph, loadSymbol)');
	expect(source).toContain('marklessRenderBoundaryArm(boundaryId, status, graph, loadSymbol)');

	const renderer = emitPrerenderBoundaryRendererModule(
		'virtual:markless:render-data:App',
	);
	expect(renderer).toContain('export function renderBoundaryArm');
	expect(renderer).toContain('export async function prepareBoundaryArm');
	expect(renderer).toContain(
		'import { marklessPrerenderData } from "virtual:markless:render-data:App"',
	);
	expect(renderer).toContain("from '@markless/web/fns/prerender-resume'");
	expect(renderer).toContain('renderPrerenderBoundary(');
	expect(renderer).toContain('marklessPreparedBoundaryArms.set');
	expect(renderer).toContain('marklessPreparedBoundaryArms.delete');
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
			branches: [
				{
					id: 'branch:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					symbolId: 'symbol:flip',
					testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
					armRecords: [
						{
							events: [
								{
									hostPath: [0],
									eventName: 'click',
									symbolIds: ['symbol:arm-zero'],
								},
							],
							domUpdates: [],
							behaviors: [],
							elementHandles: [],
						},
						{
							events: [
								{
									hostPath: [0],
									eventName: 'click',
									symbolIds: ['symbol:arm-one'],
								},
							],
							domUpdates: [
								{ graphNodeId: 'state:arm', symbolId: 'symbol:arm-patch' },
							],
							behaviors: [],
							elementHandles: [],
						},
					],
				},
			],
			asyncBoundaries: [],
		},
		triggerGroups: { passId: 'trigger-groups', groups: [] },
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:event',
					kind: 'event-handler',
					hostNodeId: 'h0',
					eventName: 'click',
					source: '() => open = !open',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'open = !open',
							graphNodeId: 'state:open',
							path: [],
							operation: 'assign',
						},
					],
				},
			],
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

// live-feed's shape: a prerendered page whose only async boundary is filled at
// load by the settle boot, a button outside the arm writing a cell the settled
// arm reads through a child component edge, and a row click inside the arm.
function settledArmPageInput(withWeightButton: boolean) {
	return {
		filename: '/workspace/src/AsyncFeed.tsrx',
		state: {
			version: 1 as const,
			cells: [
				{ graphNodeId: 'state:seed', name: 'seed', valueKind: 'scalar', value: 1 },
				{ graphNodeId: 'state:weight', name: 'weight', valueKind: 'scalar', value: 2 },
			],
			computed: [
				{
					graphNodeId: 'computed:feed',
					name: 'feed',
					valueKind: 'async',
					dependencies: [{ graphNodeId: 'state:seed', path: [] }],
				},
			],
		},
		view: {
			version: 1 as const,
			locators: [
				{ hostNodeId: 'h:main', strategy: 'dom-order', index: 0, tagName: 'main' },
				{ hostNodeId: 'h:weight', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: withWeightButton
				? [{ hostNodeId: 'h:weight', eventName: 'click', symbolIds: ['symbol:weight'] }]
				: [],
			domUpdates: [
				{
					hostNodeId: 'h:main',
					source: 'weight',
					graphNodeId: 'state:weight',
					path: [],
					target: { kind: 'attribute', name: 'data-weight' },
					symbolId: 'symbol:weight-patch',
				},
			],
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [],
			branches: [],
			asyncRunners: { 'computed:feed': 'symbol:runner' },
			asyncBoundaries: [
				{
					id: 'async:feed',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'feed',
							graphNodeId: 'computed:feed',
							path: [],
							runnerSymbolId: 'symbol:runner',
						},
					],
					updateSymbolId: 'symbol:settle',
					// The served page carries the @pending arm's records only.
					armRecords: {
						locators: [],
						events: [],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
						keyedRepeats: [],
						branches: [],
					},
				},
			],
		},
		completeView: {
			version: 1 as const,
			locators: [
				{ hostNodeId: 'h:main', strategy: 'dom-order', index: 0, tagName: 'main' },
				{ hostNodeId: 'h:weight', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: withWeightButton
				? [{ hostNodeId: 'h:weight', eventName: 'click', symbolIds: ['symbol:weight'] }]
				: [],
			// The records binding the settled arm's own hosts sit HERE, at the top
			// level, not inside the arm record sets — live-feed's real shape.
			domUpdates: [
				{
					hostNodeId: 'h:main',
					source: 'weight',
					graphNodeId: 'state:weight',
					path: [],
					target: { kind: 'attribute', name: 'data-weight' },
					symbolId: 'symbol:weight-patch',
				},
				{
					hostNodeId: 'h:summary',
					source: 'weighted',
					graphNodeId: 'computed:weighted',
					path: [],
					target: { kind: 'text' },
					symbolId: 'symbol:weighted-patch',
				},
			],
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [
				{
					id: 'repeat:feed',
					parentHostNodeId: 'h:list',
					collectionGraphNodeId: 'computed:feed',
					collectionPath: ['updates'],
					keyPath: ['id'],
					itemName: 'update',
					rowElementCount: 1,
					rowEvents: [{ hostPath: [], eventName: 'click', symbolIds: ['symbol:row'] }],
				},
			],
			branches: [],
			asyncRunners: { 'computed:feed': 'symbol:runner' },
			asyncBoundaries: [
				{
					id: 'async:feed',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'feed',
							graphNodeId: 'computed:feed',
							path: [],
							runnerSymbolId: 'symbol:runner',
						},
					],
					updateSymbolId: 'symbol:settle',
					armRecords: [
						{
							locators: [
								{
									hostNodeId: 'h:summary',
									strategy: 'arm-relative',
									index: 0,
									tagName: 'p',
								},
								{
									hostNodeId: 'h:list',
									strategy: 'arm-relative',
									index: 1,
									tagName: 'ul',
								},
								{
									hostNodeId: 'h:row',
									strategy: 'arm-relative',
									index: 2,
									tagName: 'li',
								},
							],
							events: [
								{
									hostNodeId: 'h:row',
									eventName: 'click',
									symbolIds: ['symbol:select'],
								},
							],
							behaviors: [],
							elementHandles: [],
						},
					],
				},
			],
		},
		triggerGroups: { passId: 'trigger-groups', groups: [] },
		componentEdges: [
			{
				id: 'component-edge:summary',
				parentComponentName: 'AsyncFeed',
				childComponentName: 'Summary',
				asyncBoundaryId: 'async:feed',
				props: [
					{
						name: 'weight',
						source: 'weight',
						kind: 'graph-reference',
						graphNodeId: 'state:weight',
						graphBindingKind: 'state',
						path: [],
					},
				],
				children: { childCount: 0 },
				branchScopeIds: [],
				keyedRepeatScopeIds: [],
			},
		],
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:runner',
					kind: 'async-computed-runner',
					graphNodeId: 'computed:feed',
					source: 'loadFeed',
					dependencies: [{ graphNodeId: 'state:seed', path: [] }],
				},
				{
					id: 'symbol:settle',
					kind: 'async-boundary-update',
					boundaryId: 'async:feed',
					source: 'feed',
				},
				{
					id: 'symbol:weight-init',
					kind: 'state-initializer',
					graphNodeId: 'state:weight',
					name: 'weight',
					source: 'initialWeight()',
				},
				{
					id: 'symbol:weight',
					kind: 'event-handler',
					hostNodeId: 'h:weight',
					eventName: 'click',
					source: '() => weight++',
					parameters: [],
					order: 0,
					writes: [
						{
							source: 'weight++',
							graphNodeId: 'state:weight',
							path: [],
							operation: 'update',
						},
					],
				},
			],
		},
		boundRows: [
			{
				id: 'bound:summary-derive',
				baseSymbolId: 'c0:symbol:derive',
				componentEdgePath: ['component-edge:summary'],
				ancestry: [],
				captureSlots: [
					{
						slotId: 'weight',
						path: [],
						route: {
							kind: 'graph-reference',
							componentEdgeId: 'component-edge:summary',
							componentEdgePath: ['component-edge:summary'],
							graphNodeId: 'state:weight',
							path: [],
						},
					},
				],
			},
		],
	} as unknown as Parameters<typeof planPrerenderTriggerGroups>[0];
}

test('a button group whose cell a settled arm reads owns that arm and its renderer', () => {
	const groups = planPrerenderTriggerGroups(settledArmPageInput(true));

	const weight = groups.find((group) => group.id === 'h:weight:click');
	expect(weight).toBeDefined();
	// Without the arm the click can move `data-weight` but never the derived
	// text inside the arm, and the row click has no group to land in.
	expect(weight?.view.asyncBoundaries.map((boundary) => boundary.id)).toEqual(['async:feed']);
	expect(Array.isArray(weight?.view.asyncBoundaries[0]?.armRecords)).toBe(true);
	expect(weight?.graphNodeIds).toEqual([
		'computed:feed',
		'computed:weighted',
		'state:seed',
		'state:weight',
	]);
	// symbol:select + symbol:row + symbol:weighted-patch: the rendered arm names
	// them, and symbol:weight-init: rendering it reads the initial cell value.
	expect(weight?.symbolIds).toEqual([
		'bound:summary-derive',
		'c0:symbol:derive',
		'symbol:row',
		'symbol:runner',
		'symbol:select',
		'symbol:settle',
		'symbol:weight',
		'symbol:weight-init',
		'symbol:weight-patch',
		'symbol:weighted-patch',
	]);
	// Adoption re-derives the arm through the boundary renderer the self-wake
	// group already ships; without it the group wakes against @pending records.
	expect(weight?.armRendererModuleId).toBe(
		'virtual:markless:trigger-group:%2Fworkspace%2Fsrc%2FAsyncFeed.tsrx:2',
	);
	expect(groups.find((group) => group.id === 'self-wake')?.armRendererModuleId).toBeUndefined();
});

test('a page with no settled-arm reader leaves the self-wake group sole arm owner', () => {
	const groups = planPrerenderTriggerGroups(settledArmPageInput(false));

	expect(groups.map((group) => group.id)).toEqual(['self-wake']);
});

test('plans event-less async settlement as a complete self-wake trigger group', () => {
	const groups = planPrerenderTriggerGroups({
		filename: '/workspace/src/AsyncFeed.tsrx',
		state: {
			version: 1,
			cells: [
				{ graphNodeId: 'state:seed', name: 'seed', valueKind: 'scalar', value: 1 },
				{
					graphNodeId: 'state:selected',
					name: 'selected',
					valueKind: 'scalar',
					value: 'none',
				},
				// A settled composed child can consume a parent cell even though the
				// prerendered pending arm has no record that names it yet.
				{ graphNodeId: 'state:weight', name: 'weight', valueKind: 'scalar', value: 2 },
			],
			computed: [
				{
					graphNodeId: 'computed:feed',
					name: 'feed',
					valueKind: 'async',
					dependencies: [{ graphNodeId: 'state:seed', path: [] }],
				},
			],
		},
		view: {
			version: 1,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncRunners: { 'computed:feed': 'symbol:runner' },
			asyncBoundaries: [
				{
					id: 'async:feed',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'feed',
							graphNodeId: 'computed:feed',
							path: [],
							runnerSymbolId: 'symbol:runner',
						},
					],
					updateSymbolId: 'symbol:settle',
					armRecords: {
						locators: [],
						events: [],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
						keyedRepeats: [],
						branches: [],
					},
				},
			],
		},
		completeView: {
			version: 1,
			locators: [
				{ hostNodeId: 'h:selected', strategy: 'dom-order', index: 2, tagName: 'output' },
			],
			events: [],
			domUpdates: [
				{
					hostNodeId: 'h:selected',
					source: 'selected',
					graphNodeId: 'state:selected',
					path: [],
					target: { kind: 'text' },
					symbolId: 'symbol:selected-patch',
				},
			],
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [],
			branches: [],
			asyncRunners: { 'computed:feed': 'symbol:runner' },
			asyncBoundaries: [
				{
					id: 'async:feed',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'feed',
							graphNodeId: 'computed:feed',
							path: [],
							runnerSymbolId: 'symbol:runner',
						},
					],
					updateSymbolId: 'symbol:settle',
					armRecords: [
						{
							locators: [
								{
									hostNodeId: 'h:row',
									strategy: 'arm-relative',
									index: 0,
									tagName: 'li',
								},
							],
							events: [
								{
									hostNodeId: 'h:row',
									eventName: 'click',
									symbolIds: ['symbol:arm'],
								},
							],
							domUpdates: [
								{
									hostNodeId: 'h:row',
									graphNodeId: 'state:selected',
									symbolId: 'symbol:arm-patch',
								},
							],
							behaviors: [
								{
									hostNodeId: 'h:row',
									source: 'attachRow',
									functionSource: 'attachRow',
									inputSources: [],
									inputValues: [],
									inputGraphReads: [
										{ graphNodeId: 'state:selected', path: [], inputIndex: 0 },
									],
									symbolId: 'symbol:behavior',
								},
							],
							elementHandles: [{ hostNodeId: 'h:row', handleId: 'row', name: 'row' }],
							keyedRepeats: [
								{
									id: 'repeat:feed',
									parentHostNodeId: 'h:list',
									collectionGraphNodeId: 'computed:feed',
									collectionPath: ['updates'],
									keyPath: ['id'],
									itemName: 'update',
									rowElementCount: 1,
									rowEvents: [
										{
											hostPath: [],
											eventName: 'click',
											symbolIds: ['symbol:row'],
										},
									],
								},
							],
							branches: [],
						},
					],
				},
			],
		},
		triggerGroups: { passId: 'trigger-groups', groups: [] },
		componentEdges: [
			{
				id: 'component-edge:summary',
				parentComponentName: 'AsyncFeed',
				childComponentName: 'Summary',
				asyncBoundaryId: 'async:feed',
				props: [
					{
						name: 'weight',
						source: 'weight',
						kind: 'graph-reference',
						graphNodeId: 'state:weight',
						graphBindingKind: 'state',
						path: [],
					},
				],
				children: { childCount: 0 },
				branchScopeIds: [],
				keyedRepeatScopeIds: [],
			},
		],
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:runner',
					kind: 'async-computed-runner',
					graphNodeId: 'computed:feed',
					source: 'loadFeed',
					dependencies: [{ graphNodeId: 'state:seed', path: [] }],
				},
				{
					id: 'symbol:weight-init',
					kind: 'state-initializer',
					graphNodeId: 'state:weight',
					name: 'weight',
					source: 'initialWeight()',
				},
				{
					id: 'symbol:settle',
					kind: 'async-boundary-update',
					boundaryId: 'async:feed',
					source: 'feed',
				},
				{
					id: 'symbol:arm',
					kind: 'event-handler',
					hostNodeId: 'h:row',
					eventName: 'click',
					source: 'selected = event.currentTarget.dataset.rowKey',
					writes: [
						{
							source: 'selected = event.currentTarget.dataset.rowKey',
							graphNodeId: 'state:selected',
							path: [],
							operation: 'assign',
						},
					],
				},
			],
		},
		boundRows: [
			{
				id: 'bound:summary-derive',
				baseSymbolId: 'c0:symbol:derive',
				componentEdgePath: ['component-edge:summary'],
				ancestry: [],
				captureSlots: [
					{
						slotId: 'weight',
						path: [],
						route: {
							kind: 'graph-reference',
							componentEdgeId: 'component-edge:summary',
							componentEdgePath: ['component-edge:summary'],
							graphNodeId: 'state:weight',
							path: [],
						},
					},
				],
			},
		],
	});

	expect(groups).toHaveLength(1);
	expect(groups[0]).toMatchObject({
		id: 'self-wake',
		eventName: 'self-wake',
		hostIndex: -1,
		graphNodeIds: ['computed:feed', 'state:seed', 'state:selected', 'state:weight'],
		symbolIds: [
			'bound:summary-derive',
			'c0:symbol:derive',
			'symbol:arm',
			'symbol:arm-patch',
			'symbol:behavior',
			'symbol:row',
			'symbol:runner',
			'symbol:selected-patch',
			'symbol:settle',
			'symbol:weight-init',
		],
	});
	expect(groups[0]?.view.asyncBoundaries).toHaveLength(1);
	expect(groups[0]?.view.events).toEqual([]);
	expect(Array.isArray(groups[0]?.view.asyncBoundaries[0]?.armRecords)).toBe(true);
	expect(groups[0]?.view.domUpdates.map((record) => record.hostNodeId)).toEqual(['h:selected']);
	expect(groups[0]?.view.asyncRunners).toEqual({ 'computed:feed': 'symbol:runner' });
});
