import { expect, test } from 'vitest';
import { createFakeClock } from '../../../scripts/test-utils/fake-clock.ts';
import {
	createAsyncBoundarySettleTracker,
	settleAsyncBoundaryRange,
} from '../src/resume-async-wiring.ts';
import { createResettleHold } from '../src/resume-resettle-hold.ts';
import type { ResumeAsyncBoundaryRecord } from '../src/resume-types.ts';

// T119/T120 deadline-gated @pending on RE-settles, property-tested under the
// deterministic fake clock (same discipline as navigation-hold.test.ts and
// settle-tracker-timing.test.ts). When a settled boundary's async computed
// re-runs, the boundary holds the prior settled content; only a refresh still
// pending at the client deadline commits the @pending arm, which then stays
// visible at least the pending minimum before the settled content commits.
// Fast re-settles (the overwhelming case) never touch the DOM before settle.
//
// These tests drive the REAL production units exactly as the runtime wires
// them: the re-settle hold (resume-resettle-hold.ts) raising the settle
// tracker's commit floor BEFORE its pending-arm commit, and the production
// settle path (settleAsyncBoundaryRange) waiting that floor out with its
// supersede re-check.

const DEADLINE = 250; // MARKLESS_PENDING_SETTLE_DEADLINE_MS (shared timing module)
const PENDING_MIN = 200; // MARKLESS_PENDING_MIN_VISIBLE_MS

function boundaryRecord(id: string): ResumeAsyncBoundaryRecord {
	return {
		id,
		updateSymbolId: 'symbol:update',
		asyncReads: [{ graphNodeId: `computed:${id}`, path: [] }],
	} as unknown as ResumeAsyncBoundaryRecord;
}

type ResettleCase = {
	/** Virtual time the refresh's settled snapshot arrives. */
	readonly settleAt: number;
	/** A second refresh's pending snapshot while the first is still pending. */
	readonly secondPendingAt?: number;
	/** Whether the boundary has a client-known @pending arm to commit. */
	readonly available: boolean;
};

type ResettleRun = {
	readonly pendingShownAt: readonly number[];
	readonly committedAt: number;
};

function createHarness(available: boolean, commitWaitMs = 0) {
	const clock = createFakeClock();
	const boundary = boundaryRecord('report');
	let status: string = 'fulfilled';
	const pendingShownAt: number[] = [];
	const pendingCommittedAt: number[] = [];
	const tracker = createAsyncBoundarySettleTracker({
		boundaries: [boundary],
		state: {
			computed: [{ graphNodeId: 'computed:report', snapshot: { status: 'fulfilled' } }],
		} as never,
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
	return {
		clock,
		boundary,
		tracker,
		hold,
		settle,
		setStatus: (next: string) => {
			status = next;
		},
		pendingShownAt,
		pendingCommittedAt,
	};
}

async function runResettle(resettleCase: ResettleCase): Promise<ResettleRun> {
	const harness = createHarness(resettleCase.available);
	const { clock, boundary, hold } = harness;

	// The mutation re-runs the async computed: a pending snapshot arrives for
	// a boundary that already shows settled content (prior-value retention).
	harness.setStatus('pending');
	hold(boundary, { status: 'pending' });

	if (
		resettleCase.secondPendingAt !== undefined &&
		resettleCase.secondPendingAt < resettleCase.settleAt
	) {
		await clock.advanceTo(resettleCase.secondPendingAt);
		hold(boundary, { status: 'pending' });
	}

	await clock.advanceTo(resettleCase.settleAt);
	harness.setStatus('fulfilled');
	hold(boundary, { status: 'fulfilled' });
	let committedAt = -1;
	const settled = harness.settle({ status: 'fulfilled' }).then((entries) => {
		expect(entries).toHaveLength(2);
		committedAt = clock.now();
	});

	await clock.advanceTo(10_000);
	await settled;
	expect(clock.pendingWaits(), 'leaked timing waits').toBe(0);
	return { pendingShownAt: harness.pendingShownAt, committedAt };
}

test('re-settle ordering grid: deadline gate, min-duration, second-refresh, unavailable pending arm', async () => {
	for (const available of [true, false]) {
		for (const secondPendingAt of [undefined, 40, 300]) {
			for (let settleAt = 0; settleAt <= 600; settleAt += 50) {
				if (secondPendingAt !== undefined && secondPendingAt >= settleAt) continue;
				const label = `settleAt=${settleAt} second=${String(secondPendingAt)} available=${String(available)}`;
				const run = await runResettle({ settleAt, secondPendingAt, available });

				if (!available) {
					// No client-known @pending arm (server-settled boundary): no
					// deadline race at all — prior behavior, commit at settle.
					expect(run.pendingShownAt, label).toEqual([]);
					expect(run.committedAt, label).toBe(settleAt);
				} else if (settleAt < DEADLINE) {
					// Fast re-settle: no pending frame, commit exactly at settle.
					expect(run.pendingShownAt, label).toEqual([]);
					expect(run.committedAt, label).toBe(settleAt);
				} else {
					// Slow re-settle: @pending commits exactly at the deadline —
					// a second refresh never restarts the deadline timer — and
					// the settled content waits out the pending minimum.
					expect(run.pendingShownAt, label).toEqual([DEADLINE]);
					expect(run.committedAt, label).toBe(Math.max(settleAt, DEADLINE + PENDING_MIN));
				}
			}
		}
	}
});

test('a settle racing the deadline exactly: the pending arm is skipped once the graph settled', async () => {
	const harness = createHarness(true);
	const { clock, boundary, hold } = harness;
	harness.setStatus('pending');
	hold(boundary, { status: 'pending' });
	// The deadline waiter fires during this advance while the graph already
	// reads fulfilled (the settle write landed, its notification has not run
	// yet): the pending commit must bail. Documented tie rule: the floor was
	// raised before the bail, so the settle commit waits it out — prior
	// content simply stays a little longer; nothing flashes.
	harness.setStatus('fulfilled');
	await clock.advanceTo(DEADLINE);
	hold(boundary, { status: 'fulfilled' });
	let committedAt = -1;
	const settled = harness.settle({ status: 'fulfilled' }).then(() => {
		committedAt = clock.now();
	});
	await clock.advanceTo(10_000);
	await settled;
	expect(harness.pendingShownAt).toEqual([]);
	expect(committedAt).toBe(DEADLINE + PENDING_MIN);
});

test('two sequential refreshes each get their own deadline epoch', async () => {
	const harness = createHarness(true);
	const { clock, boundary, hold } = harness;

	// Refresh 1 settles fast at t=100: no pending frame.
	harness.setStatus('pending');
	hold(boundary, { status: 'pending' });
	await clock.advanceTo(100);
	harness.setStatus('fulfilled');
	hold(boundary, { status: 'fulfilled' });
	await harness.settle({ status: 'fulfilled' });
	expect(harness.pendingShownAt).toEqual([]);

	// Refresh 2 starts at t=150 and settles slow at t=700: deadline at 150+250.
	await clock.advanceTo(150);
	harness.setStatus('pending');
	hold(boundary, { status: 'pending' });
	await clock.advanceTo(700);
	harness.setStatus('fulfilled');
	hold(boundary, { status: 'fulfilled' });
	let committedAt = -1;
	const settled = harness.settle({ status: 'fulfilled' }).then(() => {
		committedAt = clock.now();
	});
	await clock.advanceTo(10_000);
	await settled;
	expect(harness.pendingShownAt).toEqual([400]);
	expect(committedAt).toBe(700); // settle landed after the min-duration window
	expect(clock.pendingWaits()).toBe(0);
});

test('pending snapshots while the pending arm is showing never re-commit it', async () => {
	const harness = createHarness(true);
	const { clock, boundary, hold } = harness;
	harness.setStatus('pending');
	hold(boundary, { status: 'pending' });
	await clock.advanceTo(300); // deadline passed at 250, pending arm shown
	hold(boundary, { status: 'pending' }); // still-pending re-notify
	await clock.advanceTo(320);
	hold(boundary, { status: 'pending' });
	await clock.advanceTo(500);
	harness.setStatus('fulfilled');
	hold(boundary, { status: 'fulfilled' });
	const settled = harness.settle({ status: 'fulfilled' });
	await clock.advanceTo(10_000);
	await settled;
	expect(harness.pendingShownAt).toEqual([250]); // exactly one pending commit
});

test('floor-first ordering: a settle racing an in-flight pending commit lands strictly after it', async () => {
	// The pending-arm commit itself takes 30 virtual ms; the settle snapshot
	// arrives while it is still committing. The floor (raised BEFORE the
	// commit) makes the settle wait out the pending minimum, so the settled
	// content can never be stomped by the pending arm.
	const harness = createHarness(true, 30);
	const { clock, boundary, hold } = harness;
	harness.setStatus('pending');
	hold(boundary, { status: 'pending' });
	await clock.advanceTo(DEADLINE); // deadline fires; pending commit in flight (until 280)
	harness.setStatus('fulfilled');
	hold(boundary, { status: 'fulfilled' });
	let committedAt = -1;
	const settled = harness.settle({ status: 'fulfilled' }).then(() => {
		committedAt = clock.now();
	});
	await clock.advanceTo(10_000);
	await settled;
	expect(harness.pendingShownAt).toEqual([DEADLINE]);
	expect(harness.pendingCommittedAt).toEqual([DEADLINE + 30]);
	expect(committedAt).toBe(DEADLINE + PENDING_MIN); // strictly after the pending commit
	expect(clock.pendingWaits()).toBe(0);
});
