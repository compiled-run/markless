// The playlist the State graph figure draws, and its real graph: compiled from the example on the page.
export const TITLE = 'Road trip';
export const FIRST = 'Harbour Lights';
export const NEXT = 'Slow Train';

/** Nodes and readers exactly as the compiler records them for playlist.tsrx. */
export const NODES = {
	playing: { id: 'state:playing', reads: ['heading'] },
	shuffle: { id: 'state:shuffle', reads: [] },
	heading: { id: 'computed:heading', reads: ['p'] },
	p: { id: '<p> text', reads: [] },
} as const;
export type NodeKey = keyof typeof NODES;

export const heading = (playing: string) => 'Now playing: ' + playing;

export function describePick(before: string, after: string): string {
	if (before === after) return `playing is already ${after}. Same value, so the graph stops and nothing on the page changes.`;
	return `playing became ${after}. The change ran along its one path, playing to heading to the paragraph, and only that line changed.`;
}

export const SHUFFLE_SAID = 'shuffle changed, but nothing reads it. No line lit up and the page did not change.';
export const START_SAID = 'A playlist and its state graph. playing is read through heading by the paragraph; shuffle is read by nothing.';

export const NODE_NOTE: Record<NodeKey, string> = {
	playing: 'state:playing, written by Slow Train, read by heading',
	shuffle: 'state:shuffle, written by Shuffle, nothing reads this',
	heading: 'computed:heading, reads playing, read by the paragraph',
	p: 'the <p> text, the only spot on the page in the graph',
};
