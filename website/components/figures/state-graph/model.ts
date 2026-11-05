// The player the State graph figure builds, and its graph: the nodes and edges a compile of PLAYER_SOURCE records (checked in inspector.test.ts).
export const SONGS = ['Harbour Lights', 'Slow Train', 'Northbound'] as const;
export const FIRST = SONGS[0];

export const PLAYER_SOURCE = `import { computed, state } from '@markless/core';

const SONGS = ['Harbour Lights', 'Slow Train', 'Northbound'];

export default function Player() @{
	let playing = state('Harbour Lights');
	let liked = state(new Set<string>());
	let volume = state(6);
	const isLiked = computed(() => liked.has(playing));
	const title = computed(() => playing.toUpperCase());
	const cover = computed(() => '/covers/' + playing + '.jpg');

	<section>
		<h2>{title}</h2>
		<button
			class={isLiked ? 'heart on' : 'heart'}
			onClick={() => (liked = new Set([...liked, playing]))}
		>
			♥
		</button>
		<ul>
			@for (const song of SONGS; key song) {
				<li
					class={song === playing ? 'row on' : 'row'}
					onClick={() => (playing = song)}
				>
					{song}
				</li>
			}
		</ul>
		<img src={cover} alt="" />
		<label>
			Volume {volume}
			<input
				type="range"
				max="10"
				onInput={(e) => (volume = Number(e.target.value))}
			/>
		</label>
	</section>
}
`;

export type StateKey = 'playing' | 'liked' | 'volume';
export type PieceKey = 'header' | 'heart' | 'cover' | 'knob' | 'heading';

/** Every node in the graph, by column: the states, the computed values, and the spots on the page that read them. */
export const NODES = {
	playing: { column: 0, label: 'playing', id: 'state:playing' },
	liked: { column: 0, label: 'liked', id: 'state:liked' },
	volume: { column: 0, label: 'volume', id: 'state:volume' },
	cover: { column: 1, label: 'cover', id: 'computed:cover' },
	title: { column: 1, label: 'title', id: 'computed:title' },
	isLiked: { column: 1, label: 'isLiked', id: 'computed:isLiked' },
	img: { column: 2, label: '<img> src', id: 'h5 src' },
	h2: { column: 2, label: '<h2> text', id: 'h1 text' },
	heartClass: { column: 2, label: 'heart class', id: 'h2 class' },
	rowClass: { column: 2, label: 'row class', id: 'h4 class' },
	volumeText: { column: 2, label: 'volume text', id: 'h6 text' },
} as const;
export type NodeKey = keyof typeof NODES;

/** Every edge, from the value read to its reader, with the states a write to which travels along it. */
export const EDGES = [
	{ key: 'playing-cover', from: 'playing', to: 'cover', roots: ['playing'] },
	{ key: 'playing-title', from: 'playing', to: 'title', roots: ['playing'] },
	{ key: 'playing-isLiked', from: 'playing', to: 'isLiked', roots: ['playing'] },
	{ key: 'liked-isLiked', from: 'liked', to: 'isLiked', roots: ['liked'] },
	{ key: 'playing-rowClass', from: 'playing', to: 'rowClass', roots: ['playing'] },
	{ key: 'cover-img', from: 'cover', to: 'img', roots: ['playing'] },
	{ key: 'title-h2', from: 'title', to: 'h2', roots: ['playing'] },
	{ key: 'isLiked-heartClass', from: 'isLiked', to: 'heartClass', roots: ['playing', 'liked'] },
	{ key: 'volume-volumeText', from: 'volume', to: 'volumeText', roots: ['volume'] },
] as const satisfies ReadonlyArray<{ key: string; from: NodeKey; to: NodeKey; roots: readonly StateKey[] }>;

/** The pieces the reader can drag onto the page, and the nodes each one brings into the graph; the song list is there from the start. */
export const PIECES: Record<PieceKey, { readonly name: string; readonly nodes: readonly NodeKey[] }> = {
	header: { name: 'Now playing header', nodes: ['title', 'h2'] },
	heart: { name: 'heart button', nodes: ['isLiked', 'heartClass'] },
	cover: { name: 'album cover', nodes: ['cover', 'img'] },
	knob: { name: 'volume knob', nodes: ['volumeText'] },
	heading: { name: 'My playlist heading', nodes: [] },
};
export const ALWAYS: readonly NodeKey[] = ['playing', 'liked', 'volume', 'rowClass'];

export const shownNodes = (on: Readonly<Record<PieceKey, boolean>>): NodeKey[] => [...ALWAYS, ...(Object.keys(PIECES) as PieceKey[]).flatMap((key) => (on[key] ? PIECES[key].nodes : []))];
/** The readers on the page a write to `root` reaches. */
export const reachOf = (root: StateKey, shown: readonly NodeKey[]) =>
	EDGES.filter((edge) => NODES[edge.to].column === 2 && (edge.roots as readonly StateKey[]).includes(root) && shown.includes(edge.to)).length;

const plural = (n: number) => `${n} reader${n === 1 ? '' : 's'}`;

export function describeDrop(key: PieceKey, placed: boolean, songReach: number): string {
	const piece = PIECES[key];
	if (piece.nodes.length === 0) return placed ? `The ${piece.name} is plain HTML. It reads nothing, so no node was drawn.` : `The ${piece.name} is off the page. It never had a node.`;
	return placed
		? `The ${piece.name} reads a value, so its nodes and edges were drawn. A song pick now reaches ${plural(songReach)}.`
		: `The ${piece.name} is off the page, so its edges were erased. A song pick now reaches ${plural(songReach)}.`;
}

export const describePick = (song: string, before: string, reach: number) =>
	song === before ? `${song} is already playing. Same value, so nothing ran.` : `Now playing ${song}. One write to playing reached ${plural(reach)}: only the pieces with an edge changed.`;
export const describeLike = (song: string, reach: number) => `Liked ${song}. The write to liked went through isLiked to ${plural(reach)}; nothing that reads only playing ran.`;
export const describeVolume = (volume: number) => `Volume ${volume}. The write to volume reached only its own text.`;

export const START_SAID = 'A music page with just a song list, and its state graph: three states, and playing read by the list. Drag pieces onto the page.';
