// The Conditionals figures' values: a video's status from its position and whether it plays, how a drag moves the knob, and what the live region says.
export type Status = 'loading' | 'playing' | 'paused' | 'ended';

/** Length of the video on the timeline, in seconds. */
export const LENGTH = 90;
export const MAX_NOTE = 24;

export const clamp = (v: number, lo = 0, hi = LENGTH) => Math.min(hi, Math.max(lo, v));

/** Where the video is after a drag that started at `from` seconds and moved `dx` pixels along a track `length` pixels long. */
export const scrubTo = (from: number, dx: number, length: number) => clamp(Math.round(from + (dx / length) * LENGTH));

/** Where an arrow, Home or End key moves the knob, or undefined for any other key. */
export function stepSeconds(seconds: number, key: string): number | undefined {
	if (key === 'ArrowRight' || key === 'ArrowUp') return clamp(seconds + 5);
	if (key === 'ArrowLeft' || key === 'ArrowDown') return clamp(seconds - 5);
	if (key === 'Home') return 0;
	if (key === 'End') return LENGTH;
	return undefined;
}

/** The one case the switch shows: loading until the first press, ended at the far end, else playing or paused. */
export function statusOf(started: boolean, playing: boolean, seconds: number): Status {
	if (!started) return 'loading';
	if (seconds >= LENGTH) return 'ended';
	return playing ? 'playing' : 'paused';
}

/** The @switch line a status came from, for the caption under the drawing. */
export const caseOf = (status: Status) => (status === 'paused' ? '@default' : `@case '${status}'`);

export const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function describeStatus(status: Status, seconds: number): string {
	const at = `at ${formatSeconds(seconds)}`;
	return status === 'ended'
		? `The video reached the end, so the card reads ended.`
		: `The video is ${status} ${at}, and the card reads ${status}.`;
}

export function describeNote(what: 'gone' | 'fresh', note: string): string {
	return what === 'gone'
		? note === ''
			? 'Playing. The note field left the page.'
			: `Playing. The note field left the page, and "${note}" went with it.`
		: 'Paused. A fresh, empty note field was built.';
}
