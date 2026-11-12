// Client navigation timing — re-exported from the shared pending-UI timing
// module (spec D8 + T119: ONE deadline/min-duration vocabulary for navigation
// swaps and async-boundary re-settles; @markless/web pending-timing.ts is the
// single documented source). All values are structural or latency-decided;
// there is no per-block or per-link configuration.
//
// A client route swap holds the OUTGOING page live and interactive while the
// destination page renders off-screen and its boundary runners start. The
// swap commits as soon as the destination's boundaries settle; only a
// destination still pending at the deadline swaps showing its @pending arms.
//
// This mirrors the server's first-flush deadline tier
// (MARKLESS_STREAM_FIRST_FLUSH_DEADLINE_MS = 10, packages/web/src/
// render-to-stream.ts). The client deadline is larger because a navigation's
// settle includes full fetch round trips, not just local runner starts.
export {
	MARKLESS_PENDING_SETTLE_DEADLINE_MS as MARKLESS_NAV_SETTLE_DEADLINE_MS,
	MARKLESS_PENDING_MIN_VISIBLE_MS as MARKLESS_NAV_PENDING_MIN_MS,
} from '@markless/web/fns/pending-timing';

// The longest an in-place swap waits for what it needs before it commits: the destination's code and stylesheets, and the leaving page's handlers.
export const MARKLESS_NAV_SWAP_DEADLINE_MS = 3000;
