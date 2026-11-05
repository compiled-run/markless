// Build a music page by dragging pieces onto it, and watch its state graph grow left to right: three states, the computed values that read them, and the spots on the page that read those. One state feeds several readers, and one computed reads two states.
import { computed, state } from '@markless/core';
import { describeDrop, describeLike, describePick, describeVolume, FIRST, PIECES, type PieceKey, reachOf, shownNodes, SONGS, START_SAID } from './model.ts';
import { art } from './inspector.art.ts';

const KEYS: PieceKey[] = ['header', 'heart', 'cover', 'knob', 'heading'];

export default function GraphAnatomy() @{
	let playing = state<string>(FIRST);
	let liked = state<string[]>([]);
	let volume = state(6);
	let placed = state<Record<PieceKey, boolean>>({ header: false, heart: false, cover: false, knob: false, heading: false });
	let wave = state('');
	let said = state(START_SAID);
	let hover = state('');
	let touched = state(false);
	let held = state('');
	let dragX = state(0);
	let dragY = state(0);
	let fromX = state(0);
	let fromY = state(0);
	let ratio = state(1);
	let dropped = state(0);
	const shown = computed(() => shownNodes(placed));
	const songReach = computed(() => reachOf('playing', shown));
	const title = computed(() => playing.toUpperCase());
	const isLiked = computed(() => liked.includes(playing));
	const tick = computed(() => {
		const [x, y] = art.pieces.knob.box;
		const angle = (-135 + volume * 27) * (Math.PI / 180);
		return 'M' + (x + 20) + ' ' + (y + 20) + 'L' + (x + 20 + Math.sin(angle) * 10).toFixed(1) + ' ' + (y + 20 - Math.cos(angle) * 10).toFixed(1);
	});
	const styles = computed(() =>
		Object.fromEntries(
			KEYS.map((key) => {
				const piece = art.pieces[key];
				const x = (placed[key] ? piece.shift[0] : 0) + (held === key ? dragX : 0);
				const y = (placed[key] ? piece.shift[1] : 0) + (held === key ? dragY : 0);
				return [key, 'transform:translate(' + x + 'px,' + y + 'px)'];
			}),
		),
	);
	const caption = computed(() => {
		if (hover.startsWith('piece:')) {
			const key = hover.slice(6) as PieceKey;
			const piece = PIECES[key];
			if (placed[key] && key === 'heart') return 'press the heart to like ' + playing;
			if (placed[key] && key === 'knob') return 'press the knob to turn the volume up';
			return piece.name + (piece.nodes.length ? ': reads ' + (key === 'heart' ? 'isLiked' : key === 'header' ? 'title' : key === 'cover' ? 'cover' : 'volume') : ': reads nothing');
		}
		if (hover.startsWith('row:')) return 'press to play ' + hover.slice(4);
		if (hover.startsWith('node:')) {
			const node = art.nodes.find((n) => n.key === hover.slice(5));
			if (!node) return '';
			if (!shown.includes(node.key)) return node.label + ': not on the page yet';
			return node.column === 0 ? 'state: ' + node.label : node.column === 1 ? 'computed: ' + node.label + ', reads ' + node.roots.split(' ').join(' and ') : node.label + ': a spot on the page';
		}
		return 'Drag a piece onto the page, then pick a song.';
	});
	const pulse = (root: string) => {
		wave = wave === root + '-a' ? root + '-b' : root + '-a';
	};
	const set = (key: PieceKey, on: boolean) => {
		const next = { ...placed, [key]: on };
		placed = next;
		said = describeDrop(key, on, reachOf('playing', shownNodes(next)));
	};
	const pick = (song: string) => {
		said = describePick(song, playing, songReach);
		if (song !== playing) pulse('playing');
		playing = song;
	};
	const like = () => {
		if (!liked.includes(playing)) liked = [...liked, playing];
		pulse('liked');
		said = describeLike(playing, reachOf('liked', shown));
	};
	const turn = () => {
		volume = (volume + 1) % 11;
		pulse('volume');
		said = describeVolume(volume);
	};
	const reset = () => {
		playing = FIRST;
		liked = [];
		volume = 6;
		placed = { header: false, heart: false, cover: false, knob: false, heading: false };
		said = START_SAID;
	};
	const keyOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key') ?? '';
	const grab = (event: PointerEvent) => {
		const key = keyOf(event.target);
		if (!key.startsWith('piece:')) return;
		touched = true;
		held = key.slice(6);
		fromX = event.clientX;
		fromY = event.clientY;
		dragX = 0;
		dragY = 0;
		const box = (event.target as Element | null)?.closest?.('svg')?.getBoundingClientRect();
		ratio = box && box.width > 0 ? art.width / box.width : 1;
	};

	<figure class="anatomy">
		<button
			type="button"
			class="stage"
			aria-label="Build a music page and watch its state graph. Drag a piece onto the page or off it, or press it in the tray. Press a song to play it, the heart to like it, the knob to turn the volume. Keys 1 to 5 move the header, heart, cover, knob and heading; arrow keys change the song; L likes, V turns the volume; Escape starts again."
			onClick={(event) => {
				if (Date.now() - dropped < 400) return;
				touched = true;
				const key = keyOf(event.target);
				if (key.startsWith('piece:')) {
					const piece = key.slice(6) as PieceKey;
					if (placed[piece] && piece === 'heart') like();
					else if (placed[piece] && piece === 'knob') turn();
					else if (!placed[piece]) set(piece, true);
				} else if (key.startsWith('row:')) pick(key.slice(4));
				else if (!key) pick(SONGS[(SONGS.indexOf(playing as (typeof SONGS)[number]) + 1) % SONGS.length]!);
			}}
			onKeyDown={(event) => {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') event.preventDefault();
				touched = true;
				const index = Number(event.key) - 1;
				if (index >= 0 && index < KEYS.length) set(KEYS[index]!, !placed[KEYS[index]!]);
				if (event.key === 'l' || event.key === 'L') like();
				if (event.key === 'v' || event.key === 'V') turn();
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					const at = SONGS.indexOf(playing as (typeof SONGS)[number]);
					pick(SONGS[(at + (event.key === 'ArrowDown' ? 1 : 2)) % SONGS.length]!);
				}
				if (event.key === 'Escape') reset();
			}}
		>
			<svg
				class="scene"
				data-wave={wave}
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerover={(event) => {
					touched = true;
					const key = keyOf(event.target);
					if (key) hover = key;
				}}
				onPointerdown={(event) => {
					const key = keyOf(event.target);
					if (key) hover = key;
					grab(event);
				}}
				onPointermove={(event) => {
					if (!held) return;
					dragX = (event.clientX - fromX) * ratio;
					dragY = (event.clientY - fromY) * ratio;
				}}
				onPointerup={() => {
					if (!held) return;
					const key = held as PieceKey;
					if (Math.hypot(dragX, dragY) > 6) {
						const piece = art.pieces[key];
						const on = placed[key];
						const x = piece.box[0] + (on ? piece.shift[0] : 0) + dragX + piece.box[2] / 2;
						const y = piece.box[1] + (on ? piece.shift[1] : 0) + dragY + piece.box[3] / 2;
						const [px, py, pw, ph] = art.page;
						const inside = x > px && x < px + pw && y > py && y < py + ph;
						if (inside !== on) set(key, inside);
						else said = on ? 'Still on the page.' : 'Drop it on the page to add it.';
						dropped = Date.now();
					}
					held = '';
					dragX = 0;
					dragY = 0;
				}}
				onPointercancel={() => {
					held = '';
					dragX = 0;
					dragY = 0;
				}}
				onPointerleave={(event) => {
					held = '';
					if (event.pointerType !== 'touch') hover = '';
				}}
			>
				<g>
					@for (const layer of art.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
				</g>
				<g>
					@for (const words of art.words; key words.key) {
						<text class={words.cls} transform={words.matrix}>{words.text}</text>
					}
				</g>
				<g>
					@for (const row of art.rows; key row.key) {
						<g class="row" data-key={'row:' + row.key} data-roots="playing" data-on={playing === row.key ? 'yes' : 'no'}>
							<path class="hit" d={row.hit} />
							<path class="wash yellow dot" d={row.dot} />
							<path class="ink" d={row.dotInk} />
						</g>
					}
				</g>
				<g class="piece" onTouchmove={(event) => event.preventDefault()} data-key="piece:heading" data-on={placed.heading ? 'yes' : 'no'} data-held={held === 'heading' ? 'yes' : 'no'} style={styles.heading}>
					@for (const words of art.pieces.heading.words; key words.key) {
						<text class={words.cls} transform={words.matrix}>{words.text}</text>
					}
					<path class="hit" d={art.pieces.heading.hit} />
				</g>
				<g class="piece" onTouchmove={(event) => event.preventDefault()} data-key="piece:cover" data-on={placed.cover ? 'yes' : 'no'} data-held={held === 'cover' ? 'yes' : 'no'} data-roots="playing" style={styles.cover}>
					@for (const layer of art.pieces.cover.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
					<g class="pic" data-on={playing === art.pictures[0]!.key ? 'yes' : 'no'}>
						@for (const layer of art.pictures[0]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
					</g>
					<g class="pic" data-on={playing === art.pictures[1]!.key ? 'yes' : 'no'}>
						@for (const layer of art.pictures[1]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
					</g>
					<g class="pic" data-on={playing === art.pictures[2]!.key ? 'yes' : 'no'}>
						@for (const layer of art.pictures[2]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
					</g>
					<path class="hit" d={art.pieces.cover.hit} />
				</g>
				<g class="piece" onTouchmove={(event) => event.preventDefault()} data-key="piece:header" data-on={placed.header ? 'yes' : 'no'} data-held={held === 'header' ? 'yes' : 'no'} data-roots="playing" style={styles.header}>
					@for (const layer of art.pieces.header.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
					<text class="print small-print" x={art.pieces.header.text.x} y={art.pieces.header.text.y}>{title}</text>
					<path class="hit" d={art.pieces.header.hit} />
				</g>
				<g class="piece" onTouchmove={(event) => event.preventDefault()} data-key="piece:heart" data-on={placed.heart ? 'yes' : 'no'} data-held={held === 'heart' ? 'yes' : 'no'} data-roots="playing liked" style={styles.heart}>
					@for (const layer of art.pieces.heart.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
					<text class="heart-mark" data-liked={isLiked ? 'yes' : 'no'} x={art.pieces.heart.text.x + 3} y={art.pieces.heart.text.y + 1}>♥</text>
					<path class="hit" d={art.pieces.heart.hit} />
				</g>
				<g class="piece" onTouchmove={(event) => event.preventDefault()} data-key="piece:knob" data-on={placed.knob ? 'yes' : 'no'} data-held={held === 'knob' ? 'yes' : 'no'} data-roots="volume" style={styles.knob}>
					@for (const layer of art.pieces.knob.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
					<path class="knob-tick" d={tick} />
					<text class="print small-print" x={art.pieces.knob.text.x + 34} y={art.pieces.knob.text.y}>Volume {volume}</text>
					<path class="hit" d={art.pieces.knob.hit} />
				</g>
				<g>
					@for (const edge of art.edges; key edge.key) {
						<g class="edge" data-roots={edge.roots} data-on={shown.includes(edge.to) ? 'yes' : 'no'} style={'--len:' + edge.length}>
							<path class="edge-glow" d={edge.d} />
							<path class="edge-line" d={edge.d} />
							<path class="edge-head" d={edge.head} />
						</g>
					}
				</g>
				<g>
					@for (const node of art.nodes; key node.key) {
						<g class="node" data-key={'node:' + node.key} data-roots={node.roots} data-on={shown.includes(node.key) ? 'yes' : 'no'} data-column={node.column}>
							<path class="paper" d={node.poly} />
							<path class="wash yellow glow" d={node.wash} />
							<path class="ink" d={node.ink} />
							<text class="code" x={node.x} y={node.y}>{node.label}</text>
						</g>
					}
				</g>
				<text class="pencil-text heading-note" data-on={placed.heading ? 'yes' : 'no'} x={art.headingNote.x} y={art.headingNote.y}>My playlist: plain HTML, no node</text>
				<text class="print tally" x={art.tally.x} y={art.tally.y}>a song pick reaches {songReach} reader{songReach === 1 ? '' : 's'}</text>
			</svg>
		</button>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of a music page that starts with only a song list, a tray of pieces below it, and a state graph beside it,
			laid out left to right: states, computed values, and the spots on the page that read them. The graph starts with three states,
			playing, liked and volume, and one edge from playing to the song list's row class. Drag the Now playing header, the heart, the album
			cover or the volume knob onto the page, or press it in the tray, or press 1 to 4: its computed value and its reader ink themselves
			in. The heart brings isLiked, which reads both liked and playing. The My playlist heading, key 5, reads nothing and draws no node.
			Pick a song: only playing's branch pulses. Press the heart, or L: only liked, isLiked and the heart pulse. Press the knob, or V:
			only volume and its text pulse. Drag a piece back to the tray and its edges are erased. Escape starts again.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
			}

			.stage {
				display: block;
				width: 100%;
				padding: 0;
				border: 0;
				background: none;
				color: inherit;
				cursor: pointer;
				border-radius: 12px;
			}

			.stage:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				touch-action: pan-y;
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade-fill: color-mix(in oklch, var(--ink) 20%, transparent);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade-fill: rgb(0 0 0 / 0.5);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.kraft-fill {
				fill: color-mix(in oklch, var(--sheet) 70%, oklch(72% 0.07 65));
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.faint {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.55;
			}

			.shadow {
				fill: var(--shade-fill);
			}

			.desk-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.4;
			}

			.desk-ink {
				fill: var(--ink);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.8;
				stroke-linecap: round;
				opacity: 0.6;
			}

			.print,
			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 5px;
				font-weight: 600;
				fill: var(--sheet-ink);
			}

			.title {
				font-size: 5.6px;
				font-weight: 800;
			}

			.label {
				font-size: 4.4px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 5.4px;
				fill: var(--sheet-ink);
			}

			.pencil-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 4.6px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			.cue {
				opacity: 0;
				transition: opacity 450ms ease;
			}

			.scene[data-on='yes'] .cue {
				opacity: 1;
			}

			@container anatomy (max-width: 520px) {
				.note {
					font-size: 21px;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.code {
				font-family: var(--font-mono);
				font-size: 4.4px;
				font-variation-settings: 'MONO' 1;
				fill: var(--sheet-ink);
			}

			.hover-caption {
				margin: 0.3rem 0 0;
				min-height: 1.4em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.95rem;
				text-align: center;
				color: var(--ink);
			}

			.hit {
				fill: transparent;
				cursor: pointer;
			}

			.url {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 9px;
				fill: var(--sheet-ink);
				opacity: 0.8;
			}

			.scene .print,
			.scene .label {
				font-size: 13px;
			}

			.scene .big {
				font-size: 20px;
			}

			.scene .title {
				font-size: 14px;
			}

			.scene .code {
				font-size: 12px;
			}

			.scene .hand {
				font-size: 14px;
			}

			.scene .pencil-text {
				font-size: 12px;
			}

			.spot-on {
				opacity: 0;
				transition: opacity 250ms ease;
			}

			.spot-on[data-on='yes'] {
				opacity: 0.8;
			}

			.piece {
				touch-action: none;
				cursor: grab;
				transition: transform 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.piece[data-held='yes'] {
				cursor: grabbing;
				transition: none;
			}

			.pic {
				opacity: 0;
			}

			.pic[data-on='yes'] {
				opacity: 1;
			}

			.row {
				cursor: pointer;
			}

			.dot {
				opacity: 0;
			}

			.row[data-on='yes'] .dot {
				opacity: 1;
			}

			.scene .small-print {
				font-size: 12px;
			}

			.node,
			.edge {
				transition: opacity 400ms ease;
			}

			.node[data-on='no'][data-column='1'],
			.node[data-on='no'][data-column='2'] {
				opacity: 0.12;
			}

			.edge-line,
			.edge-glow {
				fill: none;
				stroke-linecap: round;
			}

			.edge-line {
				stroke: var(--sheet-ink);
				stroke-width: 1.5;
				stroke-dasharray: var(--len);
				stroke-dashoffset: var(--len);
				transition: stroke-dashoffset 600ms ease;
			}

			.edge[data-on='yes'] .edge-line {
				stroke-dashoffset: 0;
			}

			.edge-head {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.5;
				stroke-linecap: round;
				stroke-linejoin: round;
				opacity: 0;
				transition: opacity 200ms ease 450ms;
			}

			.edge[data-on='yes'] .edge-head {
				opacity: 1;
			}

			.edge-glow {
				stroke: var(--yellow);
				stroke-width: 7;
				opacity: 0;
			}

			.glow {
				opacity: 0;
			}

			.scene[data-wave='playing-a'] [data-roots~='playing'][data-on='yes'] :is(.edge-glow, .glow),
			.scene[data-wave='liked-a'] [data-roots~='liked'][data-on='yes'] :is(.edge-glow, .glow),
			.scene[data-wave='volume-a'] [data-roots~='volume'][data-on='yes'] :is(.edge-glow, .glow) {
				animation: pulse-a 900ms ease;
			}

			.scene[data-wave='playing-b'] [data-roots~='playing'][data-on='yes'] :is(.edge-glow, .glow),
			.scene[data-wave='liked-b'] [data-roots~='liked'][data-on='yes'] :is(.edge-glow, .glow),
			.scene[data-wave='volume-b'] [data-roots~='volume'][data-on='yes'] :is(.edge-glow, .glow) {
				animation: pulse-b 900ms ease;
			}

			@keyframes pulse-a {
				30% {
					opacity: 0.9;
				}
			}

			@keyframes pulse-b {
				30% {
					opacity: 0.9;
				}
			}

			.heart-mark {
				font-size: 18px;
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.2;
			}

			.heart-mark[data-liked='yes'] {
				fill: color-mix(in srgb, var(--pink) 80%, #c0403c);
			}

			.knob-tick {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 2;
				stroke-linecap: round;
			}

			.heading-note {
				opacity: 0;
				transition: opacity 300ms ease;
			}

			.heading-note[data-on='yes'] {
				opacity: 1;
			}

			.scene .tally {
				font-size: 14px;
				font-weight: 800;
			}
		</style>
	</figure>
}
