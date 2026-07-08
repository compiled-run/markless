// Client navigation timing — the single documented source (spec D8,
// specs/framework/12-arm-rendering.md). All values are structural or
// latency-decided; there is no per-block or per-link configuration.
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
export const MARKLESS_NAV_SETTLE_DEADLINE_MS = 250;

// Once pending UI is visible it stays visible at least this long before the
// settled content commits — a settle landing just past the deadline must not
// blink the pending UI (spin-delay minimum-duration semantics; prior art:
// smeijer/spin-delay 500/200, React FALLBACK_THROTTLE_MS).
export const MARKLESS_NAV_PENDING_MIN_MS = 200;
