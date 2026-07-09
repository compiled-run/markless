import { expect, test } from 'vitest';
import { createFakeClock } from '../../../scripts/test-utils/fake-clock.ts';
import {
	createAsyncBoundarySettleTracker,
	settleAsyncBoundaryRange,
	wireAsyncBoundariesWithoutLoadingCapability,
} from '../src/resume-async-wiring.ts';
import type { ResumeAsyncBoundaryRecord } from '../src/resume-types.ts';

// Spec D8 settle-side timing semantics under a deterministic fake clock
// (T116 gate 1): the settle tracker's commit floor (pending minimum
// visibility), multi-boundary settle bookkeeping in EVERY order, and the
// production settle path's hold-then-supersede-check behavior. The router
// side of the machine (hold/deadline race) is property-tested in
// packages/router/test/navigation-hold.test.ts; browser fixtures stay as
// integration proof only.

function boundaryRecord(id: string, updateSymbolId?: string): ResumeAsyncBoundaryRecord {
	return {
		id,
		updateSymbolId,
		asyncReads: [{ graphNodeId: `computed:${id}`, path: [] }],
	} as unknown as ResumeAsyncBoundaryRecord;
}

test('whenAllSettled resolves exactly at the last boundary for every settle order (24 permutations)', async () => {
	const ids = ['a', 'b', 'c', 'd'];
	for (const order of permutations(ids)) {
		const tracker = createAsyncBoundarySettleTracker({
			boundaries: ids.map((id) => boundaryRecord(id)),
		});
		let resolved = false;
		void tracker.whenAllSettled().then(() => {
			resolved = true;
		});
		for (const [index, id] of order.entries()) {
			expect(resolved, `order ${order.join(',')} before ${id}`).toBe(false);
			tracker.markSettled(id);
			tracker.markSettled(id); // idempotent: double-settle must not corrupt
			tracker.markSettled('unknown-boundary'); // foreign ids are ignored
			await Promise.resolve();
			await Promise.resolve();
			const isLast = index === ids.length - 1;
			expect(resolved, `order ${order.join(',')} after ${id}`).toBe(isLast);
			expect(tracker.hasSettledContent(id)).toBe(true);
		}
	}
});

test('SSR-resumed boundaries with settled snapshots start settled; pending ones do not', async () => {
	const tracker = createAsyncBoundarySettleTracker({
		boundaries: [boundaryRecord('done'), boundaryRecord('failed'), boundaryRecord('loading')],
		state: {
			computed: [
				{ graphNodeId: 'computed:done', snapshot: { status: 'fulfilled' } },
				{ graphNodeId: 'computed:failed', snapshot: { status: 'rejected' } },
				{ graphNodeId: 'computed:loading', snapshot: { status: 'pending' } },
			],
		} as never,
	});
	expect(tracker.hasSettledContent('done')).toBe(true);
	expect(tracker.hasSettledContent('failed')).toBe(true);
	expect(tracker.hasSettledContent('loading')).toBe(false);
	let resolved = false;
	void tracker.whenAllSettled().then(() => {
		resolved = true;
	});
	tracker.markSettled('loading');
	await Promise.resolve();
	await Promise.resolve();
	expect(resolved).toBe(true);
});

test('commit floor: monotonic max, decays with the clock, waits out exactly the remainder', async () => {
	// The floor's remaining window is observed through when waitOutCommitHold
	// actually resolves under the fake clock (the tracker's public surface).
	const holdUntil = async (holds: readonly { at: number; minVisibleMs: number }[]) => {
		const clock = createFakeClock();
		const tracker = createAsyncBoundarySettleTracker({
			boundaries: [boundaryRecord('a')],
			clock,
		});
		expect(await tracker.waitOutCommitHold()).toBe(false); // no floor yet
		for (const hold of holds) {
			await clock.advanceTo(hold.at);
			tracker.holdSettleCommitsFor(hold.minVisibleMs);
		}
		let heldUntil = -1;
		void tracker.waitOutCommitHold().then((waited) => {
			expect(waited).toBe(true);
			heldUntil = clock.now();
		});
		await clock.advanceTo(10_000);
		expect(await tracker.waitOutCommitHold()).toBe(false); // floor fully decayed
		expect(clock.pendingWaits()).toBe(0);
		return heldUntil;
	};

	// A 200ms floor raised at t=0 holds commits until exactly t=200.
	expect(await holdUntil([{ at: 0, minVisibleMs: 200 }])).toBe(200);
	// A shorter later hold never lowers the floor…
	expect(
		await holdUntil([
			{ at: 0, minVisibleMs: 200 },
			{ at: 120, minVisibleMs: 10 },
		]),
	).toBe(200);
	// …but a longer one raises it.
	expect(
		await holdUntil([
			{ at: 0, minVisibleMs: 200 },
			{ at: 120, minVisibleMs: 300 },
		]),
	).toBe(420);
});

// The production settle path (tier-4 update symbol): a settle landing during
// the pending minimum waits the floor out, then re-checks the graph for a
// superseding newer run before committing.
function settleHarness(input: { readonly statusAfterHold: string }) {
	const clock = createFakeClock();
	const tracker = createAsyncBoundarySettleTracker({
		boundaries: [boundaryRecord('slow', 'symbol:update')],
		clock,
	});
	const journal: unknown[] = [];
	const settle = async (snapshot: unknown) => {
		const entries = await settleAsyncBoundaryRange(
			{
				graph: { read: () => input.statusAfterHold, flush: async () => {} } as never,
				root: {} as never,
				loadSymbol: async () =>
					(async () => ({ arm: 0, html: '<p data-arm>done</p>' })) as never,
				renderBranchHtml: undefined,
				elementHandles: { get: () => undefined } as never,
				settleTracker: tracker,
			},
			boundaryRecord('slow', 'symbol:update'),
			snapshot,
		);
		if (entries) journal.push(...(entries as unknown[]));
		return entries;
	};
	return { clock, tracker, journal, settle };
}

test('settle during the pending minimum: commit waits out the floor, then lands once', async () => {
	const { clock, tracker, journal, settle } = settleHarness({ statusAfterHold: 'fulfilled' });
	tracker.holdSettleCommitsFor(200);
	let committedAt = -1;
	void settle({ status: 'fulfilled' }).then(() => {
		committedAt = clock.now();
	});
	await clock.advance(50);
	expect(journal).toHaveLength(0); // still inside the minimum-visibility window
	await clock.advanceTo(5_000);
	expect(committedAt).toBe(200);
	expect(journal).toHaveLength(2); // removeRange + insertRange, exactly once
	expect(tracker.hasSettledContent('slow')).toBe(true);
});

test('superseded during the hold: the stale settle commits nothing', async () => {
	const { clock, tracker, journal, settle } = settleHarness({ statusAfterHold: 'pending' });
	tracker.holdSettleCommitsFor(200);
	let result: unknown = 'unset';
	void settle({ status: 'fulfilled' }).then((entries) => {
		result = entries;
	});
	await clock.advanceTo(5_000);
	expect(result).toBeUndefined();
	expect(journal).toHaveLength(0);
	// The newer run owns the commit; the stale one must not mark settled.
	expect(tracker.hasSettledContent('slow')).toBe(false);
});

test('no active floor: the settle commits immediately without registering a wait', async () => {
	const { clock, journal, settle } = settleHarness({ statusAfterHold: 'fulfilled' });
	await settle({ status: 'fulfilled' });
	expect(journal).toHaveLength(2);
	expect(clock.now()).toBe(0);
	expect(clock.pendingWaits()).toBe(0);
});

test('settle render failures report loudly and reroute through the rejected arm', async () => {
	const tracker = createAsyncBoundarySettleTracker({
		boundaries: [boundaryRecord('faulty', 'symbol:update')],
	});
	const reported: unknown[] = [];
	const committed: unknown[] = [];
	const failure = new Error('derived panel crashed');
	const entries = await settleAsyncBoundaryRange(
		{
			graph: { read: () => 'fulfilled', flush: async () => {} } as never,
			root: {} as never,
			loadSymbol: async () =>
				((context: { readonly status: string }) => {
					if (context.status === 'fulfilled') throw failure;
					return { arm: 1, html: '<p data-catch>contained</p>' };
				}) as never,
			renderBranchHtml: undefined,
			elementHandles: { get: () => undefined } as never,
			settleTracker: tracker,
			reportRuntimeError(error) {
				reported.push(error);
			},
		},
		boundaryRecord('faulty', 'symbol:update'),
		{ status: 'fulfilled' },
	);
	if (entries) committed.push(...(entries as unknown[]));

	expect(committed).toEqual([
		{ type: 'removeRange', locator: 'async-boundary:faulty' },
		{
			type: 'insertRange',
			locator: 'async-boundary:faulty:start',
			fragment: '<p data-catch>contained</p>',
		},
	]);
	expect(tracker.hasSettledContent('faulty')).toBe(true);
	expect(reported).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REGION_RENDER_ERROR',
			boundaryId: 'faulty',
			message:
				'MARKLESS_REGION_RENDER_ERROR: async boundary "faulty" failed while rendering: derived panel crashed',
		}),
	]);
});

test('settle commit failures report loudly and commit the rejected arm', async () => {
	const tracker = createAsyncBoundarySettleTracker({
		boundaries: [boundaryRecord('faulty-commit', 'symbol:update')],
	});
	const reported: unknown[] = [];
	const committed: unknown[] = [];
	const failure = new Error('arm commit crashed');
	let commitAttempts = 0;
	const entries = await settleAsyncBoundaryRange(
		{
			graph: { read: () => 'fulfilled', flush: async () => {} } as never,
			root: {} as never,
			loadSymbol: async () =>
				((context: { readonly status: string }) => ({
					arm: context.status === 'rejected' ? 1 : 0,
					html:
						context.status === 'rejected'
							? '<p data-catch>contained</p>'
							: '<p data-try>ready</p>',
					armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
				})) as never,
			renderBranchHtml: undefined,
			elementHandles: { get: () => undefined } as never,
			settleTracker: tracker,
			async commitArm(_boundary, update) {
				commitAttempts += 1;
				if (commitAttempts === 1) throw failure;
				committed.push(update);
			},
			reportRuntimeError(error) {
				reported.push(error);
			},
		},
		boundaryRecord('faulty-commit', 'symbol:update'),
		{ status: 'fulfilled' },
	);

	expect(entries).toBeUndefined();
	expect(committed).toEqual([
		{
			html: '<p data-catch>contained</p>',
			armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
		},
	]);
	expect(tracker.hasSettledContent('faulty-commit')).toBe(true);
	expect(reported).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REGION_RENDER_ERROR',
			boundaryId: 'faulty-commit',
			message:
				'MARKLESS_REGION_RENDER_ERROR: async boundary "faulty-commit" failed while rendering: arm commit crashed',
		}),
	]);
});

// D8 part B at the wiring level: once a boundary shows settled content, a
// re-run's structural @pending journal is suppressed (mutations racing a
// navigation never flash), and every subscription is accounted for.
test('re-settle keeps the prior snapshot: pending re-runs are suppressed after settle', () => {
	const boundary = boundaryRecord('report');
	const tracker = createAsyncBoundarySettleTracker({ boundaries: [boundary] });
	const runs: ((snapshot: unknown) => unknown)[] = [];
	const releases: string[] = [];
	const stored: (() => void)[] = [];
	wireAsyncBoundariesWithoutLoadingCapability({
		asyncBoundariesById: new Map([[boundary.id, boundary]]),
		graph: {
			subscribe(subscription: { id: string; run: (snapshot: unknown) => unknown }) {
				runs.push(subscription.run);
				return () => releases.push(subscription.id);
			},
			read: () => undefined,
		} as never,
		root: {} as never,
		loadSymbol: async () => (() => undefined) as never,
		renderBranchHtml: undefined,
		elementHandles: { get: () => undefined } as never,
		storeContainerSubscription: (release) => stored.push(release),
		settleTracker: tracker,
	});
	// One subscription per async read, each stored for container disposal.
	expect(runs).toHaveLength(1);
	expect(stored).toHaveLength(1);

	// First appearance: pending renders (journal entries returned).
	expect(runs[0]!({ status: 'pending' })).toHaveLength(2);
	// Settled content commits and is tracked.
	expect(runs[0]!({ status: 'fulfilled' })).toHaveLength(2);
	expect(tracker.hasSettledContent('report')).toBe(true);
	// A re-run's pending snapshot no longer replaces visible settled content.
	expect(runs[0]!({ status: 'pending' })).toBeUndefined();
	// A newer settled snapshot still commits (latest semantics).
	expect(runs[0]!({ status: 'rejected' })).toHaveLength(2);

	// No leaked subscriptions: disposal releases everything that was stored.
	for (const release of stored) release();
	expect(releases).toHaveLength(1);
});

function permutations<Value>(values: readonly Value[]): Value[][] {
	if (values.length <= 1) return [values.slice()];
	const result: Value[][] = [];
	for (let index = 0; index < values.length; index++) {
		const rest = values.slice(0, index).concat(values.slice(index + 1));
		for (const tail of permutations(rest)) result.push([values[index]!, ...tail]);
	}
	return result;
}
