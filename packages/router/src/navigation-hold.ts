// Spec D8 (specs/framework/12-arm-rendering.md): the navigation-hold state
// machine, extracted pure so its timing semantics are property-tested under a
// fake clock (test/navigation-hold.test.ts). A client route swap holds the
// OUTGOING page live and interactive while the destination page renders
// unmounted; the swap commits as soon as the destination's boundaries settle,
// and only a destination still pending at the deadline swaps showing its
// @pending arms — which then stay visible at least the pending minimum
// (holdPendingSettleCommits raises the settle tracker's commit floor).
// The settle-vs-deadline race itself is the SHARED pending-timing machine
// (@markless/web pending-timing.ts) that also gates re-settle @pending (T120).
import { settleOrPendingDeadline } from '@markless/web';
import { MARKLESS_NAV_PENDING_MIN_MS } from './navigation-timing.ts';

// Injectable timer so tests control virtual time; production uses setTimeout.
export type NavigationHoldClock = {
	readonly wait: (durationMs: number) => Promise<void>;
};

// The settle-transition surface a rendered page's runtime may expose
// (@markless/web ResumeRuntime); pages without async boundaries mount as-is.
export type NavigationHoldRuntime = {
	readonly whenAsyncBoundariesSettled?: () => Promise<void>;
	readonly holdPendingSettleCommits?: (minVisibleMs: number) => Promise<void> | void;
};

// Hold the swap until the destination's boundaries settle or the navigation
// deadline passes (D8: nothing visible is ever replaced by fallback UI).
// A superseded navigation (aborted signal) cancels the mount entirely by
// resolving false.
export async function holdNavigationSwapUntilSettled(input: {
	readonly runtime: NavigationHoldRuntime;
	readonly signal?: AbortSignal;
	readonly clock?: NavigationHoldClock;
}): Promise<boolean | void> {
	const settled = input.runtime.whenAsyncBoundariesSettled?.();
	if (settled) {
		const outcome = await settleOrPendingDeadline(settled, input.clock?.wait);
		if (outcome === 'deadline') {
			await input.runtime.holdPendingSettleCommits?.(MARKLESS_NAV_PENDING_MIN_MS);
		}
	}
	if (input.signal?.aborted) return false;
}
