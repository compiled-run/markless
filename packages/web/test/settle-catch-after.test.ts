import { expect, test, vi } from 'vitest';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import {
	createAsyncBoundarySettleTracker,
	settleAsyncBoundaryRange,
	startAsyncBoundaries,
} from '../src/resume-async-wiring.ts';
import type { ArmCommitUpdate } from '../src/resume-commit-arm.ts';
import type { ResumeAsyncBoundaryRecord } from '../src/resume-types.ts';
import { installMarklessAsyncPlane } from '../src/fns/async-plane.ts';

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

test('a rejection over shown @try content commits @catch after it, again and again, until a fulfil clears that @catch and keeps the content', async () => {
	const { commits, settle } = harness(ASYNC_BOUNDARY_ARM.try);
	await settle('rejected');
	await settle('rejected');
	await settle('fulfilled');
	await settle('fulfilled');
	await settle('rejected');
	expect(commits.map((update) => [update.arm, update.after === true, update.nodes?.length])).toEqual([
		[ASYNC_BOUNDARY_ARM.catch, true, undefined],
		[ASYNC_BOUNDARY_ARM.catch, true, undefined],
		[undefined, true, 0],
		[ASYNC_BOUNDARY_ARM.catch, true, undefined],
	]);
});

test('a rejection over @catch or @pending replaces the range', async () => {
	for (const servedArm of [ASYNC_BOUNDARY_ARM.catch, ASYNC_BOUNDARY_ARM.pending]) {
		const { commits, settle } = harness(servedArm);
		await settle('rejected');
		expect(commits.map((update) => update.after === true)).toEqual([false]);
	}
});

test('a rejection after a refresh held for a minute keeps the content and commits @catch after it', async () => {
	vi.useFakeTimers();
	try {
		const parent: { childNodes: unknown[] } = { childNodes: [] };
		const startAnchor = { nodeType: 8, parentNode: parent };
		const endAnchor = {
			nodeType: 8,
			parentNode: parent,
			ownerDocument: { createComment: () => ({ parentNode: parent }) },
			before() {},
		};
		parent.childNodes.push(startAnchor, { nodeType: 1, outerHTML: '<p>Loading</p>', parentNode: parent }, endAnchor);
		const boundary = {
			id: 'invoice',
			startAnchor,
			endAnchor,
			runnerGraphNodeId: 'computed:invoice',
			initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
			updateSymbolId: 'symbol:update',
			asyncReads: [{ graphNodeId: 'computed:invoice', path: [] }],
		} as unknown as ResumeAsyncBoundaryRecord;
		let status = 'pending';
		let version = 0;
		const subscribers: Array<{ run(snapshot: unknown): unknown }> = [];
		const commits: ArmCommitUpdate[] = [];
		startAsyncBoundaries({
			asyncBoundariesById: new Map([[boundary.id, boundary]]),
			graph: {
				read: (_: string, path: readonly string[]) => (path.length ? status : { status, version }),
				subscribe: (subscriber: { run(snapshot: unknown): unknown }) => {
					subscribers.push(subscriber);
					return () => {};
				},
				flush: async () => {},
			} as never,
			root: {} as never,
			loadSymbol: async () =>
				(async () => ({
					arm: status === 'rejected' ? ASYNC_BOUNDARY_ARM.catch : ASYNC_BOUNDARY_ARM.try,
					html: '<b></b>',
					armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
				})) as never,
			renderBranchHtml: (html: string) => html as never,
			elementHandles: { get: () => undefined } as never,
			storeContainerSubscription: () => {},
			commitArm: async (_, update) => void commits.push(update),
		});
		const publish = async (next: string) => {
			status = next;
			version++;
			for (const subscriber of subscribers) await subscriber.run({ status, version });
		};
		await publish('fulfilled');
		await publish('pending');
		await vi.advanceTimersByTimeAsync(60_000);
		await publish('rejected');
		expect(commits.map((update) => [update.arm, update.after === true])).toEqual([
			[ASYNC_BOUNDARY_ARM.try, false],
			[ASYNC_BOUNDARY_ARM.catch, true],
		]);
	} finally {
		vi.useRealTimers();
	}
});
