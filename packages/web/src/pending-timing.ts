// Client pending-UI timing — the single source for BOTH consumers of the
// deadline-gated @pending ruling (spec D8 + T119): router navigation swaps
// (packages/router/src/navigation-hold.ts re-exports these under their
// navigation names) and async-boundary RE-settles (resume-async-wiring.ts).
// All values are structural or latency-decided; there is no per-block or
// per-link configuration. Do not mint new numbers — one vocabulary.
export const MARKLESS_PENDING_SETTLE_DEADLINE_MS = 250;

// Once pending UI is visible it stays visible at least this long before the
// settled content commits (spin-delay minimum-duration semantics; prior art:
// smeijer/spin-delay 500/200, React suspenseConfig busyDelay/busyMinDuration).
export const MARKLESS_PENDING_MIN_VISIBLE_MS = 200;

// Injectable timer so tests control virtual time; production uses setTimeout.
export type PendingTimingClock = {
	readonly wait: (durationMs: number) => Promise<void>;
};

// The shared deadline race: nothing visible is ever replaced by pending UI
// before the deadline, and a settle failure only means "commit now" — the
// failure itself fails loudly in its own flush, never here.
export async function settleOrPendingDeadline(
	settled: Promise<unknown>,
	wait: PendingTimingClock['wait'] = waitMs,
): Promise<'settled' | 'deadline'> {
	return Promise.race([
		settled.then(
			() => 'settled' as const,
			() => 'settled' as const,
		),
		wait(MARKLESS_PENDING_SETTLE_DEADLINE_MS).then(() => 'deadline' as const),
	]);
}

export function waitMs(durationMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, durationMs));
}
