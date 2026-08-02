import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import { expect, test } from 'vitest';
import { marklessSsrArmizeBoundaries } from '../src/fns/ssr.ts';

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
