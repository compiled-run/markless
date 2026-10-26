import { expect, test } from 'vitest';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import { createFakeClock } from '../../../scripts/test-utils/fake-clock.ts';
import {
	createAsyncBoundarySettleTracker,
	settleAsyncBoundaryRange,
} from '../src/resume-async-wiring.ts';
import { createResettleHold } from '../src/resume-resettle-hold.ts';
import type { ResumeAsyncBoundaryRecord } from '../src/resume-types.ts';

import {
	MARKLESS_PENDING_MIN_VISIBLE_MS as PENDING_MIN,
	MARKLESS_PENDING_REFRESH_STALL_MS as STALL,
} from '../src/pending-timing.ts';

// Spec D8 re-settle under the fake clock: a refresh over settled content keeps
// it busy; only a newest run still pending STALL ms after it started commits
// @pending, which then stays at least PENDING_MIN before the settle commits.
// Drives the real hold and the real settle path (settleAsyncBoundaryRange).

function boundaryRecord(id: string): ResumeAsyncBoundaryRecord {
	return {
		id,
		runnerGraphNodeId: `computed:${id}`,
		initiallyServedArm: ASYNC_BOUNDARY_ARM.try,
		updateSymbolId: 'symbol:update',
		asyncReads: [{ graphNodeId: `computed:${id}`, path: [] }],
	} as unknown as ResumeAsyncBoundaryRecord;
}

type ResettleCase = {
	/** Virtual time the newest run's settled snapshot arrives. */
	readonly settleAt: number;
	/** A newer run starting while the first is still pending. */
	readonly newerRunAt?: number;
	/** Whether the boundary has a client-known @pending arm to commit. */
	readonly available: boolean;
};

type ResettleRun = {
	readonly pendingShownAt: readonly number[];
	readonly busy: readonly { readonly at: number; readonly busy: boolean }[];
	readonly committedAt: number;
};

function createHarness(available: boolean, commitWaitMs = 0, settledAtStart = true) {
	const clock = createFakeClock();
	const boundary = boundaryRecord('report');
	if (!settledAtStart)
		Object.assign(boundary, { initiallyServedArm: ASYNC_BOUNDARY_ARM.pending });
	let status: string = settledAtStart ? 'fulfilled' : 'pending';
	const pendingShownAt: number[] = [];
	const pendingCommittedAt: number[] = [];
	const busy: { at: number; busy: boolean }[] = [];
	const tracker = createAsyncBoundarySettleTracker({
		boundaries: [boundary],
		clock,
	});
	const hold = createResettleHold({
		tracker,
		hasPendingArm: () => available,
		readStatus: () => status,
		commitPendingArm: async () => {
			pendingShownAt.push(clock.now());
			if (commitWaitMs > 0) await clock.wait(commitWaitMs);
			pendingCommittedAt.push(clock.now());
		},
		setBusy: (_, next) => void busy.push({ at: clock.now(), busy: next }),
		clock,
	});
	const settle = (snapshot: unknown) =>
		settleAsyncBoundaryRange(
			{
				graph: { read: () => status, flush: async () => {} } as never,
				root: {} as never,
				loadSymbol: async () =>
					(async () => ({ arm: 0, html: '<p data-arm>done</p>' })) as never,
				renderBranchHtml: undefined,
				elementHandles: { get: () => undefined } as never,
				settleTracker: tracker,
			},
			boundary,
			snapshot,
		);
	let version = 1;
	const startRun = () => {
		status = 'pending';
		version += 1;
		hold(boundary, { status: 'pending', version });
	};
	const finishRun = () => {
		status = 'fulfilled';
		hold(boundary, { status: 'fulfilled', version });
		return settle({ status: 'fulfilled', version });
	};
	return {
		clock,
		boundary,
		hold,
		startRun,
		finishRun,
		setStatus: (next: string) => {
			status = next;
		},
		currentVersion: () => version,
		pendingShownAt,
		pendingCommittedAt,
		busy,
	};
}

async function runResettle(resettleCase: ResettleCase): Promise<ResettleRun> {
	const harness = createHarness(resettleCase.available);
	const { clock } = harness;
	harness.startRun();
	if (resettleCase.newerRunAt !== undefined && resettleCase.newerRunAt < resettleCase.settleAt) {
		await clock.advanceTo(resettleCase.newerRunAt);
		harness.startRun();
	}
	await clock.advanceTo(resettleCase.settleAt);
	let committedAt = -1;
	const settled = harness.finishRun().then((entries) => {
		expect(entries).toHaveLength(2);
		committedAt = clock.now();
	});
	await clock.advanceTo(40_000);
	await settled;
	expect(clock.pendingWaits(), 'leaked timing waits').toBe(0);
	return { pendingShownAt: harness.pendingShownAt, busy: harness.busy, committedAt };
}

test('re-settle grid: busy from the first run, stall clock restarts on a newer run, fallback keeps its minimum', async () => {
	const settleTimes = [0, 100, 300, 2_000, 4_900, 5_000, 5_100, 6_000, 7_900, 8_000, 8_100, 9_000];
	for (const available of [true, false]) {
		for (const newerRunAt of [undefined, 40, 3_000]) {
			for (const settleAt of settleTimes) {
				if (newerRunAt !== undefined && newerRunAt >= settleAt) continue;
				const label = `settleAt=${settleAt} newer=${String(newerRunAt)} available=${String(available)}`;
				const run = await runResettle({ settleAt, newerRunAt, available });
				const stallAt = (newerRunAt ?? 0) + STALL;
				const fallback = available && settleAt >= stallAt;
				expect(run.busy[0], label).toEqual({ at: 0, busy: true });
				expect(run.busy.every((entry) => entry.busy), label).toBe(true);
				if (!fallback) {
					expect(run.pendingShownAt, label).toEqual([]);
					expect(run.committedAt, label).toBe(settleAt);
				} else {
					expect(run.pendingShownAt, label).toEqual([stallAt]);
					expect(run.committedAt, label).toBe(Math.max(settleAt, stallAt + PENDING_MIN));
				}
			}
		}
	}
});

test('a settle racing the stall exactly: the pending arm is skipped once the graph settled', async () => {
	const harness = createHarness(true);
	const { clock } = harness;
	harness.startRun();
	// The graph already reads fulfilled when the stall fires; the raised floor only holds the prior content a little longer.
	harness.setStatus('fulfilled');
	await clock.advanceTo(STALL);
	let committedAt = -1;
	const settled = harness.finishRun().then(() => {
		committedAt = clock.now();
	});
	await clock.advanceTo(40_000);
	await settled;
	expect(harness.pendingShownAt).toEqual([]);
	expect(committedAt).toBe(STALL + PENDING_MIN);
});

test('two sequential refreshes each get their own stall clock', async () => {
	const harness = createHarness(true);
	const { clock } = harness;
	harness.startRun();
	await clock.advanceTo(100);
	await harness.finishRun();
	expect(harness.pendingShownAt).toEqual([]);

	await clock.advanceTo(150);
	harness.startRun();
	await clock.advanceTo(6_000);
	let committedAt = -1;
	const settled = harness.finishRun().then(() => {
		committedAt = clock.now();
	});
	await clock.advanceTo(40_000);
	await settled;
	expect(harness.pendingShownAt).toEqual([150 + STALL]);
	expect(committedAt).toBe(6_000);
	expect(harness.busy.map((entry) => entry.at)).toEqual([0, 150, 150 + STALL]);
	expect(clock.pendingWaits()).toBe(0);
});

test('re-notifies of the same run never restart the clock, and newer runs never re-commit a shown fallback', async () => {
	const harness = createHarness(true);
	const { clock, boundary, hold } = harness;
	harness.startRun();
	await clock.advanceTo(1_000);
	hold(boundary, { status: 'pending', version: harness.currentVersion() });
	await clock.advanceTo(STALL + 100);
	expect(harness.pendingShownAt).toEqual([STALL]);
	harness.startRun();
	await clock.advanceTo(STALL + 300);
	harness.startRun();
	await clock.advanceTo(3 * STALL);
	const settled = harness.finishRun();
	await clock.advanceTo(40_000);
	await settled;
	expect(harness.pendingShownAt).toEqual([STALL]);
});

test('floor-first ordering: a settle racing an in-flight pending commit lands strictly after it', async () => {
	const harness = createHarness(true, 30);
	const { clock } = harness;
	harness.startRun();
	await clock.advanceTo(STALL);
	let committedAt = -1;
	const settled = harness.finishRun().then(() => {
		committedAt = clock.now();
	});
	await clock.advanceTo(40_000);
	await settled;
	expect(harness.pendingShownAt).toEqual([STALL]);
	expect(harness.pendingCommittedAt).toEqual([STALL + 30]);
	expect(committedAt).toBe(STALL + PENDING_MIN);
	expect(clock.pendingWaits()).toBe(0);
});

test('a run during the first load is neither held nor marked busy', async () => {
	const harness = createHarness(true, 0, false);
	const { clock } = harness;
	harness.startRun();
	await clock.advanceTo(2 * STALL);
	harness.startRun();
	await clock.advanceTo(4 * STALL);
	expect(harness.busy).toEqual([]);
	expect(harness.pendingShownAt).toEqual([]);
});
