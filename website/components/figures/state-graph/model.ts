// The player the State graph figure builds, and its real graph: compiled from player.tsrx on the page.
export const SONGS = ['Harbour Lights', 'Slow Train', 'Northbound'] as const;
export const FIRST = SONGS[0];

/** Each piece the reader can drag onto the page, with what it reads and how many updates the compiler gives it. */
export const PIECES = {
	label: { name: 'Now playing label', reads: true, updates: 1, node: '<p> text' },
	cover: { name: 'album cover', reads: true, updates: 2, node: '<img> src, alt' },
	heading: { name: 'My playlist heading', reads: false, updates: 0, node: '' },
} as const;
export type PieceKey = keyof typeof PIECES;
/** The song list is on the page from the start: its marked row reads playing through one class update. */
export const LIST_UPDATES = 1;

export const updatesFor = (on: Readonly<Record<PieceKey, boolean>>) =>
	LIST_UPDATES + (Object.keys(PIECES) as PieceKey[]).reduce((n, key) => n + (on[key] ? PIECES[key].updates : 0), 0);

const plural = (n: number) => `${n} update${n === 1 ? '' : 's'}`;

export function describeDrop(key: PieceKey, placed: boolean, updates: number): string {
	const piece = PIECES[key];
	if (!piece.reads) return placed ? `The ${piece.name} is plain HTML. It reads nothing, so no edge was drawn.` : `The ${piece.name} is off the page. It never had an edge.`;
	return placed
		? `The ${piece.name} reads playing, so a new node and edge were drawn. A song pick now makes ${plural(updates)}.`
		: `The ${piece.name} is off the page, so its edge was erased. A song pick now makes ${plural(updates)}.`;
}

export const describePick = (song: string, before: string, updates: number) =>
	song === before ? `${song} is already playing. Same value, so nothing ran.` : `Now playing ${song}. One write, ${updates} update${updates === 1 ? '' : 's'}: only the pieces with an edge changed.`;

export const START_SAID = 'A music page with just a song list, and its state graph: playing, read by the list. Drag pieces onto the page.';
