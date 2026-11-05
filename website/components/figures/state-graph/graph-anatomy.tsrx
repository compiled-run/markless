// Build a music page by dragging pieces onto it, and watch the state graph grow: a piece that reads `playing` inks a node and an edge; the heading reads nothing and draws none.
import { computed, state } from '@markless/core';
import { describeDrop, describePick, FIRST, PIECES, type PieceKey, SONGS, START_SAID, updatesFor } from './model.ts';
import { art } from './inspector.art.ts';

export default function GraphAnatomy() @{
	let playing = state<string>(FIRST);
	let onLabel = state(false);
	let onCover = state(false);
	let onHeading = state(false);
	let beat = state('rest');
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
	const placed = computed(() => ({ label: onLabel, cover: onCover, heading: onHeading }));
	const updates = computed(() => updatesFor(placed));
	const place = (key: PieceKey, on: boolean, dx: number, dy: number) => {
		const piece = art.pieces[key];
		const x = (on ? piece.shift[0] : 0) + (held === key ? dx : 0);
		const y = (on ? piece.shift[1] : 0) + (held === key ? dy : 0);
		return 'transform:translate(' + x + 'px,' + y + 'px)';
	};
	const labelStyle = computed(() => place('label', onLabel, dragX, dragY));
	const coverStyle = computed(() => place('cover', onCover, dragX, dragY));
	const headingStyle = computed(() => place('heading', onHeading, dragX, dragY));
	const caption = computed(() => {
		if (hover.startsWith('piece:')) {
			const piece = PIECES[hover.slice(6) as PieceKey];
			return piece.name + (piece.reads ? ': reads playing' : ': reads nothing');
		}
		if (hover.startsWith('row:')) return 'press to play ' + hover.slice(4);
		if (hover === 'node:list') return 'the song list: its marked row reads playing';
		if (hover === 'node:label') return onLabel ? 'the Now playing label: one text update' : 'not on the page yet';
		if (hover === 'node:cover') return onCover ? 'the album cover: src and alt, two updates' : 'not on the page yet';
		if (hover === 'node:source') return 'state:playing, one value';
		return 'Drag a piece onto the page, then pick a song.';
	});
	const set = (key: PieceKey, on: boolean) => {
		if (key === 'label') onLabel = on;
		if (key === 'cover') onCover = on;
		if (key === 'heading') onHeading = on;
		said = describeDrop(key, on, updatesFor({ ...placed, [key]: on }));
	};
	const pick = (song: string) => {
		said = describePick(song, playing, updates);
		if (song !== playing) beat = beat === 'odd' ? 'even' : 'odd';
		playing = song;
	};
	const reset = () => {
		playing = FIRST;
		onLabel = false;
		onCover = false;
		onHeading = false;
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

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				hover = hover === 'piece:label' ? '' : 'piece:label';
			}, 1800);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Build a music page and watch its state graph. Drag a piece onto the page or off it, or press it. Press a song to play it. Keys 1, 2 and 3 move the label, the cover and the heading; arrow keys change the song; Escape starts again."
			onClick={(event) => {
				if (Date.now() - dropped < 400) return;
				touched = true;
				const key = keyOf(event.target);
				if (key.startsWith('piece:')) {
					const piece = key.slice(6) as PieceKey;
					set(piece, !placed[piece]);
				} else if (key.startsWith('row:')) pick(key.slice(4));
				else pick(SONGS[(SONGS.indexOf(playing as (typeof SONGS)[number]) + 1) % SONGS.length]!);
			}}
			onKeyDown={(event) => {
				touched = true;
				if (event.key === '1') set('label', !onLabel);
				if (event.key === '2') set('cover', !onCover);
				if (event.key === '3') set('heading', !onHeading);
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					event.preventDefault();
					const at = SONGS.indexOf(playing as (typeof SONGS)[number]);
					pick(SONGS[(at + (event.key === 'ArrowDown' ? 1 : 2)) % SONGS.length]!);
				}
				if (event.key === 'Escape') reset();
			}}
		>
			<svg
				class="scene"
				data-beat={beat}
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
						const x = piece.text.x - 10 + (on ? piece.shift[0] : 0) + dragX;
						const y = piece.text.y - 17 + (on ? piece.shift[1] : 0) + dragY;
						const [px, py, pw, ph] = art.page;
						const inside = x > px - 20 && x < px + pw - 20 && y > py && y < py + ph - 20;
						if (inside !== on) set(key, inside);
						else said = on ? 'Still on the page.' : 'Drop it on the page to add it.';
						dropped = Date.now();
					}
					held = '';
					dragX = 0;
					dragY = 0;
				}}
				onPointerleave={(event) => {
					held = '';
					if (event.pointerType !== 'touch') hover = '';
				}}
			>
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				@for (const row of art.rows; key row.key) {
					<g class="row" data-key={'row:' + row.key} data-on={playing === row.key ? 'yes' : 'no'}>
						<path class="hit" d={row.hit} />
						<path class="wash yellow dot" d={row.dot} />
						<path class="ink" d={row.dotInk} />
					</g>
				}
				<g class="piece" data-key="piece:heading" data-on={onHeading ? 'yes' : 'no'} data-held={held === 'heading' ? 'yes' : 'no'} style={headingStyle}>
					<path class="hit" d={art.pieces.heading.hit} />
					@for (const words of art.pieces.heading.words; key words.key) {
						<text class={words.cls} transform={words.matrix}>{words.text}</text>
					}
				</g>
				<g class="piece" data-key="piece:cover" data-on={onCover ? 'yes' : 'no'} data-held={held === 'cover' ? 'yes' : 'no'} data-beat={beat} style={coverStyle}>
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
				<g class="piece" data-key="piece:label" data-on={onLabel ? 'yes' : 'no'} data-held={held === 'label' ? 'yes' : 'no'} style={labelStyle}>
					@for (const layer of art.pieces.label.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
					<text class="print small-print" x={art.pieces.label.text.x} y={art.pieces.label.text.y}>Now playing: {playing}</text>
					<path class="hit" d={art.pieces.label.hit} />
				</g>
				<g class="node" data-key="node:source" data-beat={beat}>
					<path class="paper" d={art.source.poly} />
					<path class="wash yellow glow" d={art.source.wash} />
					<path class="ink" d={art.source.ink} />
					<text class="code" x={art.source.x} y={art.source.y}>playing</text>
				</g>
				<g class="reader" data-key="node:list" data-on="yes" data-beat={beat}>
					<path class="edge" d={art.readers.list.edge.d} style={'--len:' + art.readers.list.edge.length} />
					<path class="paper" d={art.readers.list.node.poly} />
					<path class="wash yellow glow" d={art.readers.list.node.wash} />
					<path class="ink" d={art.readers.list.node.ink} />
					<text class="code" x={art.readers.list.node.x} y={art.readers.list.node.y}>{'<button> class'}</text>
				</g>
				<g class="reader" data-key="node:label" data-on={onLabel ? 'yes' : 'no'} data-beat={beat}>
					<path class="edge" d={art.readers.label.edge.d} style={'--len:' + art.readers.label.edge.length} />
					<path class="paper" d={art.readers.label.node.poly} />
					<path class="wash yellow glow" d={art.readers.label.node.wash} />
					<path class="ink" d={art.readers.label.node.ink} />
					<text class="code" x={art.readers.label.node.x} y={art.readers.label.node.y}>{'<p> text'}</text>
				</g>
				<g class="reader" data-key="node:cover" data-on={onCover ? 'yes' : 'no'} data-beat={beat}>
					<path class="edge" d={art.readers.cover.edge.d} style={'--len:' + art.readers.cover.edge.length} />
					<path class="paper" d={art.readers.cover.node.poly} />
					<path class="wash yellow glow" d={art.readers.cover.node.wash} />
					<path class="ink" d={art.readers.cover.node.ink} />
					<text class="code" x={art.readers.cover.node.x} y={art.readers.cover.node.y}>{'<img> src, alt'}</text>
				</g>
				<text class="pencil-text heading-note" data-on={onHeading ? 'yes' : 'no'} x={art.headingNote.x} y={art.headingNote.y}>My playlist: plain HTML, no node</text>
				<text class="print tally" x={art.tally.x} y={art.tally.y}>a song pick = {updates} update{updates === 1 ? '' : 's'}</text>
			</svg>
		</button>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of a music page that starts with only a song list, a tray of pieces below it, and a state graph beside it.
			The graph starts with one node, playing, and one edge to the song list. Drag the Now playing label or the album cover onto the page,
			or press it, or press 1 or 2: it reads playing, so a node and an edge ink themselves into the graph. Drag the My playlist heading
			on, or press 3: it reads nothing, so no edge appears. Pick a song by pressing it, or with the arrow keys: only the edges to pieces
			on the page pulse, and only those pieces change. Drag a piece back to the tray and its edge is erased; the tally shows one write now
			makes fewer updates. Escape starts again.
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

			.glow,
			.spot-on {
				opacity: 0;
				transition: opacity 250ms ease;
			}

			.spot-on[data-on='yes'] {
				opacity: 0.8;
			}

			.piece {
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

			.reader {
				transition: opacity 300ms ease;
			}

			.reader[data-on='no'] {
				opacity: 0;
				pointer-events: none;
			}

			.edge {
				fill: var(--sheet-ink);
				stroke: none;
			}

			.reader[data-on='yes'] .edge {
				animation: ink-in 600ms ease both;
			}

			.reader[data-on='yes'][data-beat='odd'] .glow,
			.node[data-beat='odd'] .glow {
				animation: pulse-a 900ms ease;
			}

			.reader[data-on='yes'][data-beat='even'] .glow,
			.node[data-beat='even'] .glow {
				animation: pulse-b 900ms ease;
			}

			.reader[data-on='yes'][data-beat='odd'] .edge {
				animation: edge-a 900ms ease;
			}

			.reader[data-on='yes'][data-beat='even'] .edge {
				animation: edge-b 900ms ease;
			}

			.glow {
				opacity: 0;
			}

			@keyframes ink-in {
				from {
					opacity: 0;
				}
			}

			@keyframes pulse-a {
				30% {
					opacity: 1;
				}
			}

			@keyframes pulse-b {
				30% {
					opacity: 1;
				}
			}

			@keyframes edge-a {
				30% {
					fill: color-mix(in srgb, var(--pink) 70%, #c0403c);
				}
			}

			@keyframes edge-b {
				30% {
					fill: color-mix(in srgb, var(--pink) 70%, #c0403c);
				}
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
