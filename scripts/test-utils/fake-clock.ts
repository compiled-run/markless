// Deterministic fake clock for D8 navigation/pending timing property tests
// (T116). Production timing units accept an injectable clock shaped like
// { now(), wait(ms) }; this fake advances virtual time explicitly so every
// settle-vs-deadline-vs-min-duration ordering is testable without real waits.
//
// Semantics:
// - wait(ms) resolves when virtual time reaches now()+ms during advanceTo().
// - Waiters due at the same virtual timestamp resolve in registration order
//   (documented tie rule; real setTimeout ties are unordered, so tests that
//   exercise exact-boundary ties must hold for either winner).
// - After each waiter resolves, queued microtasks are drained before the next
//   waiter fires, so promise chains behave like they do between real timer
//   ticks. Waits scheduled DURING an advance still fire if they come due
//   before the advance target.
export type FakeClock = {
	readonly now: () => number;
	readonly wait: (durationMs: number) => Promise<void>;
	/** Advance virtual time to an absolute timestamp, firing due waiters. */
	readonly advanceTo: (timeMs: number) => Promise<void>;
	/** Advance virtual time by a relative duration. */
	readonly advance: (durationMs: number) => Promise<void>;
	/** Drain queued microtasks without moving virtual time. */
	readonly flushMicrotasks: () => Promise<void>;
	/** Waiters not yet resolved (leak/pending-timer assertions). */
	readonly pendingWaits: () => number;
};

export function createFakeClock(): FakeClock {
	let time = 0;
	let sequence = 0;
	const waiters: { at: number; seq: number; resolve: () => void }[] = [];

	const flushMicrotasks = async (): Promise<void> => {
		// Enough turns for chained then/await sequences between timer ticks.
		for (let turn = 0; turn < 25; turn++) await Promise.resolve();
	};

	const advanceTo = async (timeMs: number): Promise<void> => {
		await flushMicrotasks();
		for (;;) {
			let next: { at: number; seq: number; resolve: () => void } | undefined;
			for (const waiter of waiters) {
				if (waiter.at > timeMs) continue;
				if (
					!next ||
					waiter.at < next.at ||
					(waiter.at === next.at && waiter.seq < next.seq)
				) {
					next = waiter;
				}
			}
			if (!next) break;
			waiters.splice(waiters.indexOf(next), 1);
			time = Math.max(time, next.at);
			next.resolve();
			await flushMicrotasks();
		}
		time = Math.max(time, timeMs);
	};

	return {
		now: () => time,
		wait(durationMs) {
			return new Promise((resolve) => {
				waiters.push({ at: time + Math.max(0, durationMs), seq: sequence++, resolve });
			});
		},
		advanceTo,
		advance: (durationMs) => advanceTo(time + durationMs),
		flushMicrotasks,
		pendingWaits: () => waiters.length,
	};
}
