import { expect, test } from 'vitest';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import {
	createAsyncBoundarySettleTracker,
	settleAsyncBoundaryRange,
} from '../src/resume-async-wiring.ts';
import type { ArmCommitUpdate } from '../src/resume-commit-arm.ts';
import type { ResumeAsyncBoundaryRecord } from '../src/resume-types.ts';
import { installMarklessAsyncPlane } from '../src/fns/async-plane.ts';
import { busyMarks } from '../src/fns/busy-marks.ts';

installMarklessAsyncPlane();

// A rejection paints @catch after the content only while that content is the @try arm.
function harness(servedArm: number) {
	const parent = {};
	const endAnchor = {
		parentNode: parent,
		ownerDocument: { createComment: () => ({ parentNode: parent }) },
		before() {},
	};
	const boundary = {
		id: 'invoice',
		endAnchor,
		runnerGraphNodeId: null,
		initiallyServedArm: servedArm,
		updateSymbolId: 'symbol:update',
		asyncReads: [{ graphNodeId: 'computed:invoice', path: [] }],
	} as unknown as ResumeAsyncBoundaryRecord;
	const tracker = createAsyncBoundarySettleTracker({ boundaries: [boundary] });
	const commits: ArmCommitUpdate[] = [];
	const settle = (status: 'fulfilled' | 'rejected') =>
		settleAsyncBoundaryRange(
			{
				graph: { read: () => status } as never,
				root: {} as never,
				loadSymbol: async () =>
					(async () => ({
						arm: status === 'rejected' ? 2 : 0,
						html: '<b></b>',
						armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
					})) as never,
				renderBranchHtml: undefined,
				elementHandles: { get: () => undefined } as never,
				commitArm: async (_, update) => void commits.push(update),
				settleTracker: tracker,
			},
			boundary,
			{ status },
		);
	return { boundary, commits, settle };
}

test('a rejection over shown @try content commits @catch after it, again and again, until a fulfil replaces the range', async () => {
	const { commits, settle } = harness(ASYNC_BOUNDARY_ARM.try);
	await settle('rejected');
	await settle('rejected');
	await settle('fulfilled');
	await settle('rejected');
	expect(commits.map((update) => [update.arm, update.after === true])).toEqual([
		[ASYNC_BOUNDARY_ARM.catch, true],
		[ASYNC_BOUNDARY_ARM.catch, true],
		[ASYNC_BOUNDARY_ARM.try, false],
		[ASYNC_BOUNDARY_ARM.catch, true],
	]);
});

test('a rejection over @catch, @pending, or a stalled refresh replaces the range', async () => {
	for (const servedArm of [ASYNC_BOUNDARY_ARM.catch, ASYNC_BOUNDARY_ARM.pending]) {
		const { commits, settle } = harness(servedArm);
		await settle('rejected');
		expect(commits.map((update) => update.after === true)).toEqual([false]);
	}
	const stalled = harness(ASYNC_BOUNDARY_ARM.try);
	busyMarks.shown(stalled.boundary, ASYNC_BOUNDARY_ARM.pending);
	await stalled.settle('rejected');
	expect(stalled.commits.map((update) => update.after === true)).toEqual([false]);
});
