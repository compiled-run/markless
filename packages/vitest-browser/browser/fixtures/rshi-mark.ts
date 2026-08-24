// The carousel's shape: the handle's VALUE leaves the widget module as an
// argument to a plain helper, so the read has to be materialized at the call.
export function markTrack(track: Element | undefined, steps: number): void {
	track?.setAttribute('data-rshi-hit', String(steps));
}
