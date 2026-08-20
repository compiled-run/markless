/**
 * Causal phase classification for the CDP network records Witness exposes.
 *
 * Witness records a request only when `Network.loadingFinished` arrives, so
 * `page.networkRequests()` is ordered by COMPLETION, never by start. Splitting
 * the post-click snapshot at `beforeClick.length` therefore counts every request
 * that was still in flight when the click happened as click-caused: a
 * page-parse modulepreload that finishes a few milliseconds after the pre-click
 * snapshot is indistinguishable, by index, from a chunk the click went and
 * fetched. Slower CI machines widen that window, so the miscount is a
 * deterministic red rather than a rare flake.
 *
 * Causality lives in `startTimeMs` - the `Network.requestWillBeSent` monotonic
 * timestamp, in the same timebase as `endTimeMs`. Every request in the pre-click
 * snapshot had already finished when that snapshot was taken, and the click
 * happens strictly after the snapshot, so the click is strictly later than the
 * latest end time in the snapshot. A request that starts at or before that
 * instant provably started before the click; only a request that starts after it
 * can have been caused by the click.
 *
 * The bound stays strict in the direction that keeps the boxes loud: a genuinely
 * click-triggered fetch starts after the click, which is after the bound, so it
 * is still counted and still fails the box.
 */

export type PhaseTimedRequest = {
	readonly startTimeMs: number;
	readonly endTimeMs: number | null;
};

/**
 * Latest instant, in the CDP monotonic timebase, that provably precedes the
 * click that followed this snapshot. Returns `-Infinity` for an empty snapshot:
 * with no evidence about what was already in flight, every later request stays
 * classified as click-caused so the box fails loudly instead of quietly.
 */
export function preClickInstantMs(beforeClick: readonly PhaseTimedRequest[]): number {
	let latest = Number.NEGATIVE_INFINITY;
	for (const request of beforeClick) {
		const observed = request.endTimeMs ?? request.startTimeMs;
		if (observed > latest) latest = observed;
	}
	return latest;
}

/** True when this request started after the click, i.e. the click could have caused it. */
export function startedAfterAction(request: PhaseTimedRequest, actionStartTimeMs: number): boolean {
	return request.startTimeMs > actionStartTimeMs;
}

/** Phase a single observed request by causality rather than by array position. */
export function requestPhase(
	request: PhaseTimedRequest,
	actionStartTimeMs: number,
): 'bootstrap' | 'action' {
	return startedAfterAction(request, actionStartTimeMs) ? 'action' : 'bootstrap';
}

/**
 * The requests in `afterClick` that the click could have caused: those that
 * started after the click. Requests already in flight at click time - including
 * page-parse modulepreloads that only finished after the pre-click snapshot -
 * are excluded, because they were caused by the page parse.
 */
export function clickCausedRequests<T extends PhaseTimedRequest>(
	beforeClick: readonly PhaseTimedRequest[],
	afterClick: readonly T[],
): readonly T[] {
	const actionStartTimeMs = preClickInstantMs(beforeClick);
	return afterClick.filter((request) => startedAfterAction(request, actionStartTimeMs));
}
