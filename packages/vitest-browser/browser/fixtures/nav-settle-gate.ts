// Test-controlled settle gate for the navigation-transition fixtures.
//
// The D8 navigation deadline (MARKLESS_PENDING_SETTLE_DEADLINE_MS = 250) is a
// real wall-clock timer, so a fixture whose async read waits on its own
// wall-clock timer only settles "inside the deadline" while the machine keeps
// its timers punctual. Under full-project parallelism it does not: a nominal
// 80ms setTimeout is pushed well past the 250ms budget, the destination then
// genuinely misses the deadline, and D8 correctly commits its @pending arm —
// which reads as a flaky failure of the fast-swap invariant even though the
// runtime did exactly what the spec requires.
//
// This gate takes the wall clock out of the premise:
//
//   1. the destination's async read suspends on the gate DURING the
//      destination's render, so the boundary is genuinely pending and its
//      @pending arm really is rendered (off-screen) and really could leak;
//   2. `reached` resolves at that exact moment, so the test waits for the
//      suspension instead of polling for it — no timer, no wasted deadline
//      budget, however long the render itself takes;
//   3. `open()` then resumes the read on a microtask, and microtasks always
//      drain before the next macrotask can run, so the settle beats the
//      deadline's timer on any machine at any load.
//
// "The destination settles inside the deadline" therefore holds by
// construction rather than by luck.
export type NavSettleGate = {
	/** Resolves when a destination's async read has reached the gate and suspended. */
	readonly reached: Promise<void>;
	/** Release the suspended read; it settles on a microtask, never a timer. */
	readonly open: () => void;
};

type LiveGate = NavSettleGate & { readonly enter: () => Promise<void> };

function createNavSettleGate(): LiveGate {
	let announceReached!: () => void;
	const reached = new Promise<void>((resolve) => {
		announceReached = resolve;
	});
	let release!: () => void;
	const opened = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		reached,
		open: release,
		enter: () => {
			announceReached();
			return opened;
		},
	};
}

let current = createNavSettleGate();

/** Fresh gate for one navigation; call before dispatching the route update. */
export function armNavSettleGate(): NavSettleGate {
	current = createNavSettleGate();
	return current;
}

/** The fixture side: suspend the destination's async read on the live gate. */
export function reachNavSettleGate(): Promise<void> {
	return current.enter();
}
