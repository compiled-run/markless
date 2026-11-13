import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import { installMarklessAsyncPlane } from '../src/fns/async-plane.ts';
import {
	startAsyncBoundaries,
	wireAsyncBoundariesWithoutLoadingCapability,
} from '../src/resume-async-wiring.ts';
import type { ArmCommitUpdate } from '../src/resume-commit-arm.ts';
import type { ResumeAsyncBoundaryRecord } from '../src/resume-types.ts';

installMarklessAsyncPlane();
beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

// Spec D8 re-settle through the real wiring under fake timers: a refresh over shown content keeps it, marked busy,
// however long it waits, and @pending never replaces it. The block mounts showing @pending, as a client render
// mounts it, so the arm a refresh must not bring back is on hand.
async function mountedBlock() {
	const parent = {
		nodeType: 1,
		childNodes: [] as unknown[],
		busy: false,
		setAttribute() {
			parent.busy = true;
		},
		removeAttribute() {
			parent.busy = false;
		},
	};
	const startAnchor = { nodeType: 8, parentNode: parent };
	const endAnchor = {
		nodeType: 8,
		parentNode: parent,
		ownerDocument: { createComment: () => ({ parentNode: parent }) },
		before() {},
	};
	parent.childNodes.push(startAnchor, { nodeType: 1, outerHTML: '<p>Loading</p>', parentNode: parent }, endAnchor);
	const boundary = {
		id: 'report',
		startAnchor,
		endAnchor,
		runnerGraphNodeId: 'computed:report',
		initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
		updateSymbolId: 'symbol:update',
		asyncReads: [{ graphNodeId: 'computed:report', path: [] }],
	} as unknown as ResumeAsyncBoundaryRecord;
	let snapshot: { status: string; version: number; quiet?: true } = { status: 'pending', version: 0 };
	const subscribers: Array<{ run(snapshot: unknown): unknown }> = [];
	const commits: Array<readonly [ArmCommitUpdate['arm'], boolean]> = [];
	const releases: Array<() => void> = [];
	startAsyncBoundaries({
		asyncBoundariesById: new Map([[boundary.id, boundary]]),
		graph: {
			read: (_: string, path: readonly string[]) => (path.length ? snapshot.status : snapshot),
			subscribe: (subscriber: { run(snapshot: unknown): unknown }) => {
				subscribers.push(subscriber);
				return () => {};
			},
			flush: async () => {},
		} as never,
		root: {} as never,
		loadSymbol: async () =>
			(async () => ({
				arm: snapshot.status === 'rejected' ? ASYNC_BOUNDARY_ARM.catch : ASYNC_BOUNDARY_ARM.try,
				html: '<b></b>',
				armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
			})) as never,
		renderBranchHtml: (html: string) => html as never,
		elementHandles: { get: () => undefined } as never,
		storeContainerSubscription: (release) => void releases.push(release),
		commitArm: async (_, update) => void commits.push([update.arm, update.after === true]),
	});
	const publish = async (status: string, quiet?: true) => {
		snapshot = { status, version: snapshot.version + 1, ...(quiet && { quiet }) };
		// As the graph's pass does: a settle hands back its DOM commit, landed once every subscription ran.
		const landing = [];
		for (const subscriber of subscribers) landing.push(await subscriber.run(snapshot));
		for (const commit of landing) if (typeof commit === 'function') await commit();
		await vi.advanceTimersByTimeAsync(0);
	};
	const dispose = () => {
		for (const release of releases.splice(0)) release();
	};
	return { parent, commits, publish, dispose };
}

test('a refresh over shown content keeps it busy for as long as it waits, then updates it in place', async () => {
	for (const waitMs of [100, 300, 4_900, 5_000, 5_200, 6_000, 60_000, 600_000]) {
		const block = await mountedBlock();
		await block.publish('fulfilled');
		expect(block.commits, `waitMs=${waitMs}`).toEqual([[ASYNC_BOUNDARY_ARM.try, false]]);
		await block.publish('pending');
		// The busy marks load with the first refresh over shown content.
		await vi.waitFor(() => expect(block.parent.busy).toBe(true));
		for (let waited = 0; waited < waitMs; waited += 100) {
			await vi.advanceTimersByTimeAsync(Math.min(100, waitMs - waited));
			expect(block.parent.busy, `busy at ${waited} of ${waitMs}`).toBe(true);
		}
		await block.publish('fulfilled');
		expect(block.commits, `waitMs=${waitMs}`).toEqual([[ASYNC_BOUNDARY_ARM.try, false]]);
		expect(block.parent.busy, `waitMs=${waitMs}`).toBe(false);
		block.dispose();
	}
});

test('newer refreshes during a long wait keep the content and its busy mark', async () => {
	const block = await mountedBlock();
	await block.publish('fulfilled');
	await block.publish('pending');
	await vi.advanceTimersByTimeAsync(4_000);
	await block.publish('pending');
	await vi.advanceTimersByTimeAsync(4_000);
	await block.publish('pending');
	await vi.advanceTimersByTimeAsync(30_000);
	expect(block.parent.busy).toBe(true);
	expect(block.commits).toEqual([[ASYNC_BOUNDARY_ARM.try, false]]);
	await block.publish('fulfilled');
	expect(block.parent.busy).toBe(false);
});

test('a quiet refresh stays unmarked and keeps the content however long it waits', async () => {
	const block = await mountedBlock();
	await block.publish('fulfilled');
	await block.publish('pending', true);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(block.parent.busy).toBe(false);
	expect(block.commits).toEqual([[ASYNC_BOUNDARY_ARM.try, false]]);
});

test('a refresh during the first load keeps @pending, marks nothing busy, and the newest run lands', async () => {
	const block = await mountedBlock();
	await block.publish('pending');
	await vi.advanceTimersByTimeAsync(20_000);
	await block.publish('pending');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(block.parent.busy).toBe(false);
	expect(block.commits).toEqual([]);
	await block.publish('fulfilled');
	expect(block.commits).toEqual([[ASYNC_BOUNDARY_ARM.try, false]]);
});

test('a runtime disposed during a long refresh commits nothing', async () => {
	const block = await mountedBlock();
	await block.publish('fulfilled');
	await block.publish('pending');
	await vi.advanceTimersByTimeAsync(1_000);
	block.dispose();
	await vi.advanceTimersByTimeAsync(60_000);
	expect(block.commits).toEqual([[ASYNC_BOUNDARY_ARM.try, false]]);
});

test('a settle in flight when the runtime is disposed commits nothing and flushes nothing', async () => {
	vi.useRealTimers();
	const boundary = {
		id: 'report',
		runnerGraphNodeId: 'computed:report',
		initiallyServedArm: ASYNC_BOUNDARY_ARM.try,
		updateSymbolId: 'symbol:update',
		asyncReads: [{ graphNodeId: 'computed:report', path: [] }],
		rerendersOnRefresh: true,
	} as unknown as ResumeAsyncBoundaryRecord;
	const runs: Array<(snapshot: unknown) => unknown> = [];
	const releases: Array<() => void> = [];
	let flushes = 0;
	let loadUpdate: ((symbol: unknown) => void) | undefined;
	const commitArm = vi.fn(async () => {});
	wireAsyncBoundariesWithoutLoadingCapability({
		asyncBoundariesById: new Map([[boundary.id, boundary]]),
		graph: {
			subscribe: (subscription: { run: (snapshot: unknown) => unknown }) => {
				runs.push(subscription.run);
				return () => {};
			},
			read: () => 'fulfilled',
			flush: async () => void flushes++,
		} as never,
		root: {} as never,
		loadSymbol: () =>
			new Promise((resolve) => {
				loadUpdate = resolve;
			}) as never,
		renderBranchHtml: undefined,
		elementHandles: { get: () => undefined } as never,
		storeContainerSubscription: (release) => void releases.push(release),
		commitArm,
	});
	const settled = runs[0]!({ status: 'fulfilled', version: 2 }) as Promise<unknown>;
	await vi.waitFor(() => expect(loadUpdate).toBeDefined());
	for (const release of releases.splice(0)) release();
	loadUpdate!(async () => ({
		arm: ASYNC_BOUNDARY_ARM.try,
		html: '<p>late</p>',
		armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
	}));
	await settled;
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(commitArm).not.toHaveBeenCalled();
	expect(flushes).toBe(0);
});
