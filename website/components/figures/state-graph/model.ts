// The playlist the State graph figure draws: one `playing` value, read by two spots, and a title that reads nothing.
export const TITLE = 'Road trip';
export const SONGS = ['Harbour Lights', 'Slow Train', 'Northbound'] as const;
export const START = SONGS[0];

export const describePlay = (playing: string, changed: boolean) =>
	changed
		? `Now playing ${playing}. The write to playing reached only the two spots ruled to it: the header and the marked row. The title, ${TITLE}, reads nothing and stayed as it was.`
		: `A playlist called ${TITLE}. The value playing is ruled to two spots: the header and the marked row. Pick a song.`;
