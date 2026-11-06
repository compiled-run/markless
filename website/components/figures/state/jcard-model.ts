// The State array figure's values: the songs on the tape, the songs that can still be added, and what the live region says.
export const START = ['So What', 'Blue in Green', 'Freddie'] as const;
export const POOL = ['So What', 'Blue in Green', 'Freddie', 'All Blues', 'Milestones'] as const;
export const SLOTS = 5;
export const ROW_H = 42;
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export const nextSong = (songs: readonly string[]) => POOL.find((song) => !songs.includes(song));

/** Where a dragged row lands, from its start slot and how far it moved. */
export const landing = (from: number, dy: number, count: number) => Math.max(0, Math.min(count - 1, from + Math.round(dy / ROW_H)));

/** The slots whose text differs between two orders: the only lines that re-ink. */
export function changedSlots(before: readonly string[], after: readonly string[]): number[] {
	const out: number[] = [];
	for (let i = 0; i < SLOTS; i++) if (before[i] !== after[i]) out.push(i);
	return out;
}

export function describeSongs(action: string, songs: readonly string[], changed: readonly number[]): string {
	const lines = changed.length === 1 ? 'one line' : `${changed.length} lines`;
	return `${action}: ${songs.join(', ')}. Only ${lines} on the page changed; the rest stayed as they were.`;
}

/** A track line's classes: shown once the array reaches it, re-inked only when its own song changed. */
export function trackClass(count: number, slot: number, inked: readonly number[], beat: string, held: number): string {
	let out = slot < count ? 'track on' : 'track';
	if (inked.includes(slot)) out += ' reink-' + beat;
	if (held === slot) out += ' held';
	return out;
}
