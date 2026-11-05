// The values the player figure shows and the sentences its live region speaks.
export const TRACK = 'Harbour Lights';
export const MINI = 'MiniPlayer';
export const BIG = 'NowPlaying';
/** How far the shared progress moves per tick (100 ms) while playing: one run of the track takes 20 s. */
export const STEP = 0.005;
/** Each player's own volume at the start: widget scope gives them separate copies. */
export const VOLUME = { mini: 0.4, big: 0.7 } as const;
/** The knob turns through 270 degrees, from -135 to 135. */
export const angleOf = (volume: number) => -135 + volume * 270;
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
/** Screen degrees of a point around a centre: 0 straight up, growing clockwise, in (-180, 180]. */
export const bearing = (dx: number, dy: number) => (Math.atan2(dx, -dy) * 180) / Math.PI;
/** A change of bearing folded into (-180, 180], so crossing straight down never jumps a whole turn. */
export const unwrap = (delta: number) => ((((delta + 180) % 360) + 360) % 360) - 180;
/** The volume after the pointer swings `delta` degrees around the knob: 270 degrees is the whole range. */
export const turnBy = (volume: number, delta: number) => clamp(volume + unwrap(delta) / 270);
export const tick = (pos: number) => (pos + STEP >= 1 ? 0 : pos + STEP);
export type Who = 'mini' | 'big';
export const nameOf = (who: Who) => (who === 'mini' ? MINI : BIG);
export const otherOf = (who: Who): Who => (who === 'mini' ? 'big' : 'mini');
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function describePlay(who: Who, playing: boolean): string {
	return playing
		? `Pressed play on ${nameOf(who)}. Both players are playing ${TRACK}: they read one shared() track.`
		: `Paused on ${nameOf(who)}. ${nameOf(otherOf(who))} paused too.`;
}

export function describeScrub(who: Who, pos: number): string {
	return `Scrubbed ${nameOf(who)} to ${percent(pos)}. ${nameOf(otherOf(who))} jumped to the same spot.`;
}

export function describeVolume(who: Who, mine: number, theirs: number): string {
	return `${nameOf(who)} volume ${percent(mine)}. ${nameOf(otherOf(who))} stays at ${percent(theirs)}: each player is its own widget.`;
}
