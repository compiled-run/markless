import { describe, expect, it } from 'vite-plus/test';
import { createFakeClock } from '../../../scripts/test-utils/fake-clock.ts';
import { createAsyncBoundarySettleTracker } from '../../web/src/resume-async-wiring.ts';
import type { ResumeAsyncBoundaryRecord } from '../../web/src/resume-types.ts';
import { holdNavigationSwapUntilSettled } from '../src/navigation-hold.ts';
import {
	MARKLESS_NAV_PENDING_MIN_MS,
	MARKLESS_NAV_SETTLE_DEADLINE_MS,
} from '../src/navigation-timing.ts';

// Spec D8 timing state machine, property-tested under a deterministic fake
// clock (T116 gate 1). This suite composes the REAL production units exactly
// like the runtime does — holdNavigationSwapUntilSettled (router) racing
// AsyncBoundarySettleTracker.whenAllSettled() against the navigation
// deadline, with holdPendingSettleCommits raising the tracker's commit floor
// and every boundary settle waiting the floor out (the production settle
// path in resume-async-wiring.ts settleAsyncBoundaryRange) — and enumerates
// every ordering of settle vs deadline vs min-duration vs abort.
//
// The browser fixtures in packages/vitest-browser/browser/
// navigation-transitions.test.ts remain as INTEGRATION proof that this
// machine is wired to real route swaps; all timing SEMANTICS live here.
//
// Tie rule: the fake clock resolves same-timestamp waits in registration
// order. Real timer ties are unordered, so the exact-boundary suite asserts
// the machine's invariants hold for EITHER winner.

const DEADLINE = MARKLESS_NAV_SETTLE_DEADLINE_MS;
const PENDING_MIN = MARKLESS_NAV_PENDING_MIN_MS;

type NavigationCase = {
	readonly settleTimesMs: readonly number[];
	readonly abortAtMs?: number;
	/** Register the hold's deadline wait before the settle waits (tie rule flip). */
	readonly holdRegisteredFirst?: boolean;
	/** whenAsyncBoundariesSettled rejects after settling (flush failure). */
	readonly settleRejects?: boolean;
};

type NavigationRun = {
	readonly pendingShownAt: number | undefined;
	readonly swapAt: number;
	readonly swapResult: boolean | void;
	readonly commits: readonly { readonly id: string; readonly at: number }[];
	readonly leakedWaits: number;
};

function boundaryRecord(id: string): ResumeAsyncBoundaryRecord {
	return {
		id,
		asyncReads: [{ graphNodeId: `computed:${id}`, path: [] }],
	} as unknown as ResumeAsyncBoundaryRecord;
}

async function runNavigation(navigationCase: NavigationCase): Promise<NavigationRun> {
	const clock = createFakeClock();
	const ids = navigationCase.settleTimesMs.map((_, index) => `b${index}`);
	const tracker = createAsyncBoundarySettleTracker({
		boundaries: ids.map(boundaryRecord),
		clock,
	});

	let pendingShownAt: number | undefined;
	const commits: { id: string; at: number }[] = [];
	// Mirrors resume-runtime.ts: whenAsyncBoundariesSettled + the pending
	// commit floor, and resume-async-wiring.ts settleAsyncBoundaryRange's
	// floor wait before a settle commit.
	const runtime = {
		whenAsyncBoundariesSettled: () => {
			const settled = tracker.whenAllSettled();
			return navigationCase.settleRejects
				? settled.then(() => Promise.reject(new Error('flush failed')))
				: settled;
		},
		holdPendingSettleCommits: (minVisibleMs: number) => {
			pendingShownAt = clock.now();
			tracker.holdSettleCommitsFor(minVisibleMs);
		},
	};

	const controller = new AbortController();
	if (navigationCase.abortAtMs !== undefined) {
		void clock.wait(navigationCase.abortAtMs).then(() => controller.abort());
	}

	const startBoundarySettles = () => {
		for (const [index, settleAt] of navigationCase.settleTimesMs.entries()) {
			void (async () => {
				await clock.wait(settleAt);
				await tracker.waitOutCommitHold();
				commits.push({ id: ids[index]!, at: clock.now() });
				tracker.markSettled(ids[index]!);
			})();
		}
	};

	let swapAt = -1;
	let swapResult: boolean | void;
	const startHold = () =>
		holdNavigationSwapUntilSettled({
			runtime,
			signal: controller.signal,
			clock,
		}).then((result) => {
			swapResult = result;
			swapAt = clock.now();
		});

	let hold: Promise<void>;
	if (navigationCase.holdRegisteredFirst) {
		hold = startHold();
		startBoundarySettles();
	} else {
		startBoundarySettles();
		hold = startHold();
	}

	const horizon = Math.max(0, ...navigationCase.settleTimesMs) + DEADLINE + PENDING_MIN + 100;
	await clock.advanceTo(Math.max(horizon, navigationCase.abortAtMs ?? 0) + 1);
	await hold;
	if (swapAt < 0) throw new Error('The navigation hold never resolved.');
	return { pendingShownAt, swapAt, swapResult, commits, leakedWaits: clock.pendingWaits() };
}

// Invariants that must hold for ANY same-timestamp tie resolution.
function expectUniversalInvariants(run: NavigationRun, navigationCase: NavigationCase): void {
	const label = JSON.stringify(navigationCase);
	// Every boundary commits exactly once — no double commits, no drops.
	expect(run.commits.map((commit) => commit.id).sort(), label).toEqual(
		navigationCase.settleTimesMs.map((_, index) => `b${index}`).sort(),
	);
	for (const [index, settleAt] of navigationCase.settleTimesMs.entries()) {
		const commit = run.commits.find((entry) => entry.id === `b${index}`)!;
		if (run.pendingShownAt === undefined) {
			// No pending UI ever showed: commits land exactly at their settle.
			expect(commit.at, label).toBe(settleAt);
		} else {
			// Once pending UI showed, a commit either landed before it or waited
			// out the full minimum-visibility window. Never in between (blink).
			const immediate = settleAt <= run.pendingShownAt && commit.at === settleAt;
			const heldToFloor = commit.at === Math.max(settleAt, run.pendingShownAt + PENDING_MIN);
			expect(immediate || heldToFloor, `${label} commit ${commit.id}@${commit.at}`).toBe(
				true,
			);
		}
	}
	if (run.pendingShownAt !== undefined) {
		// Pending UI only ever appears at the navigation deadline.
		expect(run.pendingShownAt, label).toBe(DEADLINE);
		expect(run.swapAt, label).toBe(DEADLINE);
	}
	// The machine leaves no timers behind at the horizon.
	expect(run.leakedWaits, label).toBe(0);
	// A superseded navigation reports false; an active one reports undefined.
	const expectAborted =
		navigationCase.abortAtMs !== undefined && navigationCase.abortAtMs < run.swapAt;
	if (navigationCase.abortAtMs !== run.swapAt) {
		expect(run.swapResult, label).toBe(expectAborted ? false : undefined);
	}
}

// Deterministic expectations under the documented registration-order tie
// rule (settle waits registered before the hold => settled wins exact ties).
function expectSettledFirstModel(run: NavigationRun, navigationCase: NavigationCase): void {
	const label = JSON.stringify(navigationCase);
	const lastSettle = Math.max(0, ...navigationCase.settleTimesMs);
	if (lastSettle > DEADLINE) {
		expect(run.pendingShownAt, label).toBe(DEADLINE);
	} else {
		expect(run.pendingShownAt, label).toBeUndefined();
		expect(run.swapAt, label).toBe(navigationCase.settleTimesMs.length ? lastSettle : 0);
	}
}

describe('D8 navigation hold state machine (fake clock)', () => {
	it('single boundary: full settle grid across deadline and min-duration boundaries', async () => {
		const settleTimes: number[] = [];
		for (let at = 0; at <= 600; at += 10) settleTimes.push(at);
		settleTimes.push(249, 251, 449, 451); // exact-boundary neighbours
		for (const settleAt of settleTimes) {
			const navigationCase = { settleTimesMs: [settleAt] };
			const run = await runNavigation(navigationCase);
			expectUniversalInvariants(run, navigationCase);
			expectSettledFirstModel(run, navigationCase);
			const commit = run.commits[0]!;
			if (settleAt <= DEADLINE) {
				// Fast settle: one swap straight to settled content.
				expect(commit.at, `settle@${settleAt}`).toBe(settleAt);
			} else {
				// Slow settle: pending shows at the deadline and stays visible the
				// minimum duration; the settle commit waits out the remainder.
				expect(commit.at, `settle@${settleAt}`).toBe(
					Math.max(settleAt, DEADLINE + PENDING_MIN),
				);
			}
		}
	});

	it('exact settle==deadline tie is safe for either winner', async () => {
		const settledWins = await runNavigation({ settleTimesMs: [DEADLINE] });
		expectUniversalInvariants(settledWins, { settleTimesMs: [DEADLINE] });
		expect(settledWins.pendingShownAt).toBeUndefined();
		expect(settledWins.commits[0]!.at).toBe(DEADLINE);

		const deadlineWins = await runNavigation({
			settleTimesMs: [DEADLINE],
			holdRegisteredFirst: true,
		});
		expectUniversalInvariants(deadlineWins, {
			settleTimesMs: [DEADLINE],
			holdRegisteredFirst: true,
		});
		expect(deadlineWins.pendingShownAt).toBe(DEADLINE);
		expect(deadlineWins.commits[0]!.at).toBe(DEADLINE + PENDING_MIN);
	});

	it('multiple boundaries: every settle order across the deadline windows', async () => {
		const settleSets = [
			[50, 120, 200], // all inside the deadline
			[50, 240, 260], // straddling the deadline
			[260, 300, 500], // all past the deadline
			[100, 251, 470], // one fast, one in min-duration, one past it
			[60, 240, 260, 460], // four boundaries across every window
		];
		let cases = 0;
		for (const settleSet of settleSets) {
			for (const settleTimesMs of permutations(settleSet)) {
				const navigationCase = { settleTimesMs };
				const run = await runNavigation(navigationCase);
				expectUniversalInvariants(run, navigationCase);
				expectSettledFirstModel(run, navigationCase);
				cases++;
			}
		}
		expect(cases).toBe(6 * 4 + 24);
	});

	it('a settle failure commits the swap immediately (fails loudly in its own flush)', async () => {
		const navigationCase = { settleTimesMs: [100], settleRejects: true };
		const run = await runNavigation(navigationCase);
		expectUniversalInvariants(run, navigationCase);
		expect(run.pendingShownAt).toBeUndefined();
		expect(run.swapAt).toBe(100);
	});

	it('no boundaries: the swap commits without waiting for the deadline', async () => {
		const run = await runNavigation({ settleTimesMs: [] });
		expect(run.pendingShownAt).toBeUndefined();
		expect(run.swapAt).toBe(0);
		expect(run.leakedWaits).toBe(0);

		// A page runtime without the settle surface at all skips the race.
		let resolvedImmediately = false;
		void holdNavigationSwapUntilSettled({ runtime: {}, clock: createFakeClock() }).then(() => {
			resolvedImmediately = true;
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(resolvedImmediately).toBe(true);
	});

	it('abort/supersede lands anywhere in the hold: mount cancels iff aborted before the swap', async () => {
		let cases = 0;
		for (const settleAt of [100, 300, 500]) {
			for (const abortAtMs of [51, 149, 251, 301, 449, 501, 649]) {
				const navigationCase = { settleTimesMs: [settleAt], abortAtMs };
				const run = await runNavigation(navigationCase);
				expectUniversalInvariants(run, navigationCase);
				expectSettledFirstModel(run, navigationCase);
				cases++;
			}
		}
		expect(cases).toBe(21);
	});

	it('seeded random property: invariants hold for arbitrary settle/abort orderings', async () => {
		const random = createSeededRandom(116);
		for (let index = 0; index < 150; index++) {
			const boundaryCount = 1 + Math.floor(random() * 4);
			// Even settle times + odd abort times: abort can never tie the swap.
			const settleTimesMs = Array.from(
				{ length: boundaryCount },
				() => Math.floor(random() * 351) * 2,
			);
			const abortAtMs = random() < 0.3 ? Math.floor(random() * 350) * 2 + 1 : undefined;
			const navigationCase = { settleTimesMs, abortAtMs };
			const run = await runNavigation(navigationCase);
			expectUniversalInvariants(run, navigationCase);
			expectSettledFirstModel(run, navigationCase);
		}
	});
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

// Deterministic LCG (Numerical Recipes constants) — reproducible cases.
function createSeededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}
