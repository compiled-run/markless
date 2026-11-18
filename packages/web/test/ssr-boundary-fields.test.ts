import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import { expect, test } from 'vitest';
import { registerArmRecordSet } from '../src/resume-commit-arm.ts';
import { marklessSsrArmizeBoundaries, marklessSsrComposeView } from '../src/fns/ssr.ts';

test.each([
	['try', ASYNC_BOUNDARY_ARM.try],
	['pending', ASYNC_BOUNDARY_ARM.pending],
	['catch', ASYNC_BOUNDARY_ARM.catch],
] as const)(
	'SSR armization records the %s arm the render drew as the initially served arm',
	(expectedMarker, expectedArm) => {
		const boundary = {
			id: 'boundary:alternate',
			runnerGraphNodeId: 'computed:runner',
			initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
			startAnchor: { strategy: 'dom-order-comment', index: 0 },
			endAnchor: { strategy: 'dom-order-comment', index: 1 },
			// The dependency deliberately precedes the runner. This proves SSR
			// consumes the resolved field instead of list position.
			asyncReads: [
				{ graphNodeId: 'computed:dependency', path: [] },
				{ graphNodeId: 'computed:runner', path: [] },
			],
			armRecords: [
				{ events: [{ marker: 'try' }] },
				{ events: [{ marker: 'pending' }] },
				{ events: [{ marker: 'catch' }] },
			],
		};
		const [armized] = marklessSsrArmizeBoundaries(
			{
				locators: [{ hostNodeId: 'h0', tagName: 'p', index: 0 }],
				anchors: [
					{
						kind: 'async',
						id: 'boundary:alternate',
						startIndex: 0,
						endIndex: 1,
						elementStart: 0,
						elementEnd: 1,
						html: '<p>content</p>',
						arm: expectedArm,
					},
				],
				elementCount: 1,
			},
			[boundary],
			{ locators: [], events: [], behaviors: [], elementHandles: [] },
		);

		expect(armized.initiallyServedArm).toBe(expectedArm);
		expect(armized.armRecords.events).toEqual([{ marker: expectedMarker }]);
	},
);

test('SSR armization records the served arm for an authored sync gate', () => {
	const [armized] = marklessSsrArmizeBoundaries(
		{
			locators: [{ hostNodeId: 'h0', tagName: 'p', index: 0 }],
			anchors: [
				{
					kind: 'async',
					id: 'boundary:card',
					startIndex: 0,
					endIndex: 1,
					elementStart: 0,
					elementEnd: 1,
					html: '<p>east-west</p>',
					arm: ASYNC_BOUNDARY_ARM.try,
				},
			],
			elementCount: 1,
		},
		[
			{
				id: 'boundary:card',
				runnerGraphNodeId: 'computed:card',
				initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				asyncReads: [
					{ graphNodeId: 'computed:east', path: [], runnerSymbolId: 'symbol:east' },
					{ graphNodeId: 'computed:west', path: [], runnerSymbolId: 'symbol:west' },
					{ graphNodeId: 'computed:card', path: [] },
				],
				armRecords: [{}, {}, {}],
			},
		],
		{ locators: [], events: [], behaviors: [], elementHandles: [] },
	);

	expect(armized.initiallyServedArm).toBe(ASYNC_BOUNDARY_ARM.try);
});

test('SSR composition keeps a rendered async-arm keyed repeat in the served arm records', () => {
	const repeat = {
		id: 'repeat:updates',
		parentHostNodeId: 'h-list',
		collectionGraphNodeId: 'computed:feed',
		collectionPath: ['updates'],
		keyPath: ['id'],
		itemName: 'update',
		rowElementCount: 1,
		rowEvents: [{ hostPath: [], eventName: 'click', symbolIds: ['symbol:select'] }],
	};
	const composed = marklessSsrComposeView(
		{
			locators: [
				{ hostNodeId: 'h-root', tagName: 'main', index: 0 },
				{ hostNodeId: 'h-list', tagName: 'ul', index: 1 },
				{ hostNodeId: 'h-row', tagName: 'li', index: 2 },
			],
			anchors: [
				{
					kind: 'async',
					id: 'boundary:feed',
					startIndex: 0,
					endIndex: 1,
					elementStart: 1,
					elementEnd: 3,
					html: '<ul><li>Beacon</li></ul>',
					arm: ASYNC_BOUNDARY_ARM.try,
				},
			],
			elementCount: 3,
		},
		{
			version: 1,
			locators: [{ hostNodeId: 'h-root', strategy: 'dom-order', index: 0, tagName: 'main' }],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [repeat],
			branches: [],
			asyncBoundaries: [
				{
					id: 'boundary:feed',
					runnerGraphNodeId: 'computed:feed',
					initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [],
					armRecords: [
						{
							locators: [
								{
									hostNodeId: 'h-list',
									index: 0,
									tagName: 'ul',
								},
								{
									hostNodeId: 'h-row',
									index: 1,
									tagName: 'li',
								},
							],
							events: [],
							behaviors: [],
							elementHandles: [],
						},
						{ locators: [], events: [], behaviors: [], elementHandles: [] },
						{ locators: [], events: [], behaviors: [], elementHandles: [] },
					],
				},
			],
		},
		[],
		[{ graphNodeId: 'computed:feed', snapshot: { status: 'fulfilled' } }],
	);

	expect(composed.view.keyedRepeats).toEqual([]);
	expect(composed.view.asyncBoundaries[0]!.armRecords).toMatchObject({
		locators: [
			{ hostNodeId: 'h-list', index: 0 },
			{ hostNodeId: 'h-row', index: 1 },
		],
		keyedRepeats: [repeat],
	});
});

test('registration-only boot uses the shared arm core for keyed repeats', async () => {
	const start = { nodeType: 8 as const, childNodes: [] };
	const list = { nodeType: 1 as const, tagName: 'UL', childNodes: [] };
	const end = { nodeType: 8 as const, childNodes: [] };
	const root = { nodeType: 1 as const, tagName: 'MAIN', childNodes: [start, list, end] };
	const repeat = {
		id: 'repeat:updates',
		parentHostNodeId: 'h-list',
		collectionGraphNodeId: 'state:updates',
		collectionPath: [],
		keyPath: ['id'],
		itemName: 'update',
		rowElementCount: 1,
		rowEvents: [{ hostPath: [], eventName: 'click', symbolIds: ['symbol:select'] }],
	};
	const registered: unknown[] = [];
	const elementsByHostId = new Map();
	await registerArmRecordSet(
		{
			root: root as never,
			elementsByHostId,
			disposedHosts: new Set(),
			disposeHost: () => {},
			addEventRecord: () => {},
			registerElementHandle: () => {},
			registerKeyedRepeats: async (records) => registered.push(...records),
		},
		() => {},
		{ id: 'boundary:feed', startAnchor: start, endAnchor: end, asyncReads: [] } as never,
		{
			armRecords: {
				locators: [
					{ hostNodeId: 'h-list', index: 0, tagName: 'ul' },
				],
				events: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [repeat],
			},
		},
	);

	expect(registered).toEqual([repeat]);
	expect(elementsByHostId.get('h-list')).toBe(list);
});

test('SSR armization names the arm each branch in the served @try arm painted', () => {
	const branch = (id: string) => ({
		id,
		symbolId: 'symbol:1',
		testReads: [{ graphNodeId: `computed:test-${id}`, path: [] }],
		startAnchor: { strategy: 'arm-branch-comment', index: 0 },
		endAnchor: { strategy: 'arm-branch-comment', index: 1 },
	});
	const anchor = (id: string, arm: number) => ({
		kind: 'arm-branch' as const,
		id,
		startIndex: 1,
		endIndex: 1,
		elementStart: 0,
		elementEnd: 1,
		html: '<p>shown</p>',
		arm,
	});
	const [armized] = marklessSsrArmizeBoundaries(
		{
			locators: [],
			anchors: [
				{ kind: 'async', id: 'c1:boundary:0', startIndex: 0, endIndex: 1, elementStart: 0, elementEnd: 2, html: '', arm: 0 },
				anchor('c1:branch-site:0', 0),
				anchor('c1:branch-site:1', 1),
			],
			elementCount: 2,
		},
		[
			{
				id: 'boundary:0',
				runnerGraphNodeId: 'computed:order',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				armRecords: [{ branches: [branch('branch-site:0'), branch('branch-site:1')] }, {}, {}],
			},
		],
		{ locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [], keyedRepeats: [] },
		'c1:',
	);

	expect(armized.armRecords.branches.map((record: { readonly takenArm?: number }) => record.takenArm)).toEqual([0, 1]);
});

test.each([
	['pending', ASYNC_BOUNDARY_ARM.pending, false],
	['fulfilled', ASYNC_BOUNDARY_ARM.try, true],
] as const)(
	'a list under an @if in the @try arm leaves the page records when the boundary serves %s',
	(_served, servedArm, drawn) => {
		const list = { id: 'repeat:todos', parentHostNodeId: 'h-list', collectionGraphNodeId: 'computed:todos', keyPath: ['id'], rowEvents: [] };
		const composed = marklessSsrComposeView(
			{
				locators: [],
				anchors: [
					{ kind: 'async', id: 'boundary:0', startIndex: 0, endIndex: 1, elementStart: 0, elementEnd: 0, html: '', arm: servedArm },
					...(drawn
						? [{ kind: 'arm-branch' as const, id: 'branch-site:0', startIndex: 0, endIndex: 0, elementStart: 0, elementEnd: 0, html: '', arm: 1 }]
						: []),
				],
				elementCount: 0,
			},
			{
				version: 1,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [list],
				branches: [],
				asyncBoundaries: [
					{
						id: 'boundary:0',
						runnerGraphNodeId: 'computed:todos',
						initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
						startAnchor: { strategy: 'dom-order-comment', index: 0 },
						endAnchor: { strategy: 'dom-order-comment', index: 1 },
						asyncReads: [],
						armRecords: [
							{
								locators: [],
								events: [],
								behaviors: [],
								elementHandles: [],
								branches: [{ id: 'branch-site:0', armRecords: [{ repeatParents: [{ repeatId: 'repeat:todos' }] }, {}] }],
							},
							{ locators: [], events: [], behaviors: [], elementHandles: [] },
							{ locators: [], events: [], behaviors: [], elementHandles: [] },
						],
					},
				],
			},
			[],
			[],
		);

		expect(composed.view.keyedRepeats).toEqual([]);
		expect(composed.view.asyncBoundaries[0]!.armRecords).toMatchObject(drawn ? { keyedRepeats: [list] } : {});
		if (!drawn) expect(composed.view.asyncBoundaries[0]!.armRecords).not.toHaveProperty('keyedRepeats');
	},
);
