import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import { expect, test } from 'vitest';
import { expandBoundaryArmRecords } from '../src/resume-arm-records.ts';
import { marklessSsrArmizeBoundaries, marklessSsrComposeView } from '../src/fns/ssr.ts';

test.each([
	['fulfilled', ASYNC_BOUNDARY_ARM.try, 'try'],
	['pending', ASYNC_BOUNDARY_ARM.pending, 'pending'],
	['rejected', ASYNC_BOUNDARY_ARM.catch, 'catch'],
] as const)(
	'SSR armization records the %s runner snapshot as the initially served arm',
	(status, expectedArm, expectedMarker) => {
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
				anchors: [{ kind: 'async', id: 'boundary:alternate', startIndex: 0, endIndex: 1, elementStart: 0, elementEnd: 1, html: '<p>content</p>' }],
				elementCount: 1,
			},
			[boundary],
			{ locators: [], events: [], behaviors: [], elementHandles: [] },
			[
				{ graphNodeId: 'computed:dependency', snapshot: { status: 'pending' } },
				{ graphNodeId: 'computed:runner', snapshot: { status } },
			],
		);

		expect(armized.initiallyServedArm).toBe(expectedArm);
		expect(armized.armRecords.events).toEqual([{ marker: expectedMarker }]);
	},
);

test('SSR armization records the served arm for an authored sync gate', () => {
	const [armized] = marklessSsrArmizeBoundaries(
		{
			locators: [{ hostNodeId: 'h0', tagName: 'p', index: 0 }],
			anchors: [{ kind: 'async', id: 'boundary:card', startIndex: 0, endIndex: 1, elementStart: 0, elementEnd: 1, html: '<p>east-west</p>' }],
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
		[
			{ graphNodeId: 'computed:east', snapshot: { status: 'fulfilled' } },
			{ graphNodeId: 'computed:west', snapshot: { status: 'fulfilled' } },
		],
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
			anchors: [{
				kind: 'async',
				id: 'boundary:feed',
				startIndex: 0,
				endIndex: 1,
				elementStart: 1,
				elementEnd: 3,
				html: '<ul><li>Beacon</li></ul>',
			}],
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
			asyncBoundaries: [{
				id: 'boundary:feed',
				runnerGraphNodeId: 'computed:feed',
				initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				asyncReads: [],
				armRecords: [
					{
						locators: [
							{ hostNodeId: 'h-list', strategy: 'arm-relative', index: 0, tagName: 'ul' },
							{ hostNodeId: 'h-row', strategy: 'arm-relative', index: 1, tagName: 'li' },
						],
						events: [],
						behaviors: [],
						elementHandles: [],
					},
					{ locators: [], events: [], behaviors: [], elementHandles: [] },
					{ locators: [], events: [], behaviors: [], elementHandles: [] },
				],
			}],
		},
		[],
		[{ graphNodeId: 'computed:feed', snapshot: { status: 'fulfilled' } }],
	);

	expect(composed.view.keyedRepeats).toEqual([]);
	expect(composed.view.asyncBoundaries[0]!.armRecords).toMatchObject({
		locators: [
			{ hostNodeId: 'h-list', strategy: 'arm-relative', index: 0 },
			{ hostNodeId: 'h-row', strategy: 'arm-relative', index: 1 },
		],
		keyedRepeats: [repeat],
	});
});

test('resume expansion registers keyed repeats from the initially served async arm', () => {
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
	const view = {
		version: 1,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [],
		branches: [],
		asyncBoundaries: [{
			id: 'boundary:feed',
			startAnchor: { strategy: 'dom-order-comment', index: 0 },
			endAnchor: { strategy: 'dom-order-comment', index: 1 },
			asyncReads: [],
			armRecords: {
				locators: [{ hostNodeId: 'h-list', strategy: 'arm-relative', index: 0, tagName: 'ul' }],
				events: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [repeat],
			},
		}],
	};

	const expanded = expandBoundaryArmRecords(
		root,
		view,
		new Map([['boundary:feed', { id: 'boundary:feed', startAnchor: start, endAnchor: end, asyncReads: [] }]]),
	);

	expect(expanded?.view.keyedRepeats).toEqual([repeat]);
	expect(expanded?.elementsByHostId.get('h-list')).toBe(list);
});
