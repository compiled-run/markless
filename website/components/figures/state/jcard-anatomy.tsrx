// A cassette J-card wired line by line to a page: add a track and only its line inks in; drag a line and only the lines that changed re-ink.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import { changedSlots, describeSongs, flip, landing, nextSong, ROW_H, START, trackClass } from './jcard-model.ts';
import { art } from './jcard.art.ts';

export default function JCardAnatomy() @{
	let songs = state<string[]>([...START]);
	let inked = state<number[]>([]);
	let beat = state('rest');
	let held = state(-1);
	let fromY = state(0);
	let dragY = state(0);
	let scale = state(1);
	let said = state('');
	const track0 = computed(() => trackClass(songs.length, 0, inked, beat, held));
	const shift0 = computed(() => (held === 0 ? 'transform: translateY(' + dragY + 'px)' : ''));
	const track1 = computed(() => trackClass(songs.length, 1, inked, beat, held));
	const shift1 = computed(() => (held === 1 ? 'transform: translateY(' + dragY + 'px)' : ''));
	const track2 = computed(() => trackClass(songs.length, 2, inked, beat, held));
	const shift2 = computed(() => (held === 2 ? 'transform: translateY(' + dragY + 'px)' : ''));
	const track3 = computed(() => trackClass(songs.length, 3, inked, beat, held));
	const shift3 = computed(() => (held === 3 ? 'transform: translateY(' + dragY + 'px)' : ''));
	const track4 = computed(() => trackClass(songs.length, 4, inked, beat, held));
	const shift4 = computed(() => (held === 4 ? 'transform: translateY(' + dragY + 'px)' : ''));
	function mark(before: string[], action: string) {
		inked = changedSlots(before, songs);
		beat = flip(beat);
		said = describeSongs(action, songs, inked);
	}
	function add() {
		const song = nextSong(songs);
		if (!song) {
			said = 'The tape is full. Rub one out with the eraser first.';
			return;
		}
		const before = [...songs];
		songs.push(song);
		mark(before, 'Added ' + song);
	}
	function remove() {
		if (songs.length === 0) return;
		const before = [...songs];
		const song = songs.pop();
		mark(before, 'Removed ' + song);
	}
	function moveFocus(from: EventTarget | null, a: number, b: number) {
		move(a, b);
		(from as SVGGElement).ownerSVGElement?.querySelectorAll<SVGGElement>('.row')[b]?.focus();
	}
	function move(from: number, to: number) {
		const before = [...songs];
		const [song] = songs.splice(from, 1);
		songs.splice(to, 0, song!);
		mark(before, 'Moved ' + song);
	}
	function drag(event: PointerEvent) {
		if (held < 0 || !event.isPrimary) return;
		const clientY = event.clientY;
		const dy = (clientY - fromY) * scale;
		const to = landing(held, dy, songs.length);
		if (to !== held) {
			move(held, to);
			fromY += ((to - held) * ROW_H) / scale;
			held = to;
		}
		dragY = (clientY - fromY) * scale;
	}
	function drop(event: PointerEvent) {
		if (!event.isPrimary) return;
		held = -1;
		dragY = 0;
	}

	<figure class="anatomy jcard">
		<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="a cassette track list wired line by line to a page">
			<path class="shadow" d={art.card.shadow} />
			<path class="hatch" d={art.card.shadowHatch} />
			<path class="board" d={art.card.card} />
			<path class="spine" d={art.card.spineFill} />
			<path class="ink" d={art.card.ink} />
			<path class="ink faint" d={art.card.rules} />
			<text class="spine-title" x={art.card.spineX} y={art.card.spineY} transform={'rotate(-90 ' + art.card.spineX + ' ' + art.card.spineY + ')'}>MIXTAPE</text>
			<text class="title" x={art.card.titleX} y={art.card.titleY}>songs</text>
			<path class="shadow" d={art.sheet.shadow} />
			<path class="hatch" d={art.sheet.shadowHatch} />
			<path class="paper" d={art.sheet.sheet} />
			<path class="ink" d={art.sheet.ink} />
			<text class="title" x={art.sheet.titleX} y={art.sheet.titleY}>Playlist</text>
			<g role="list" aria-label="songs">
			<g class={track0}>
				<g class="wire">
					<path class="ink desk" d={art.wires[0].ink} />
					<path class="pulse" d={art.wires[0].path} />
				</g>
				<text class="line" x={art.rows[0].pageX} y={art.rows[0].y}>{songs[0] ?? ''}</text>
				<g
					class="row"
					style={shift0}
					tabindex={songs.length > 0 ? '0' : '-1'}
					role="listitem"
					aria-label={'track 1, ' + (songs[0] ?? 'empty') + '. Drag, or use the up and down arrows, to move it.'}
					onPointerDown={(event) => {
						if (songs.length <= 0 || held >= 0 || !event.isPrimary) return;
						capture(event);
						held = 0;
						fromY = event.clientY;
						dragY = 0;
						scale = art.width / (event.currentTarget.ownerSVGElement?.getBoundingClientRect().width ?? art.width);
					}}
					onPointerMove={drag}
					onPointerUp={drop}
					onPointerCancel={drop}
					onTouchMove={(event) => event.preventDefault()}
					onKeyDown={(event) => {
						if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
						event.preventDefault();
						if (event.key === 'ArrowUp') return;
						else if (0 < songs.length - 1) moveFocus(event.currentTarget, 0, 1);
					}}
				>
					<rect class="grab" x="64" y={art.rows[0].y - 30} width="246" height="40" />
					<text class="num" x={art.rows[0].cardX} y={art.rows[0].y}>1.</text>
					<text class="song" x={art.rows[0].cardX + 26} y={art.rows[0].y}>{songs[0] ?? ''}</text>
				</g>
			</g>
			<g class={track1}>
				<g class="wire">
					<path class="ink desk" d={art.wires[1].ink} />
					<path class="pulse" d={art.wires[1].path} />
				</g>
				<text class="line" x={art.rows[1].pageX} y={art.rows[1].y}>{songs[1] ?? ''}</text>
				<g
					class="row"
					style={shift1}
					tabindex={songs.length > 1 ? '0' : '-1'}
					role="listitem"
					aria-label={'track 2, ' + (songs[1] ?? 'empty') + '. Drag, or use the up and down arrows, to move it.'}
					onPointerDown={(event) => {
						if (songs.length <= 1 || held >= 0 || !event.isPrimary) return;
						capture(event);
						held = 1;
						fromY = event.clientY;
						dragY = 0;
						scale = art.width / (event.currentTarget.ownerSVGElement?.getBoundingClientRect().width ?? art.width);
					}}
					onPointerMove={drag}
					onPointerUp={drop}
					onPointerCancel={drop}
					onTouchMove={(event) => event.preventDefault()}
					onKeyDown={(event) => {
						if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
						event.preventDefault();
						if (event.key === 'ArrowUp') moveFocus(event.currentTarget, 1, 0);
						else if (1 < songs.length - 1) moveFocus(event.currentTarget, 1, 2);
					}}
				>
					<rect class="grab" x="64" y={art.rows[1].y - 30} width="246" height="40" />
					<text class="num" x={art.rows[1].cardX} y={art.rows[1].y}>2.</text>
					<text class="song" x={art.rows[1].cardX + 26} y={art.rows[1].y}>{songs[1] ?? ''}</text>
				</g>
			</g>
			<g class={track2}>
				<g class="wire">
					<path class="ink desk" d={art.wires[2].ink} />
					<path class="pulse" d={art.wires[2].path} />
				</g>
				<text class="line" x={art.rows[2].pageX} y={art.rows[2].y}>{songs[2] ?? ''}</text>
				<g
					class="row"
					style={shift2}
					tabindex={songs.length > 2 ? '0' : '-1'}
					role="listitem"
					aria-label={'track 3, ' + (songs[2] ?? 'empty') + '. Drag, or use the up and down arrows, to move it.'}
					onPointerDown={(event) => {
						if (songs.length <= 2 || held >= 0 || !event.isPrimary) return;
						capture(event);
						held = 2;
						fromY = event.clientY;
						dragY = 0;
						scale = art.width / (event.currentTarget.ownerSVGElement?.getBoundingClientRect().width ?? art.width);
					}}
					onPointerMove={drag}
					onPointerUp={drop}
					onPointerCancel={drop}
					onTouchMove={(event) => event.preventDefault()}
					onKeyDown={(event) => {
						if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
						event.preventDefault();
						if (event.key === 'ArrowUp') moveFocus(event.currentTarget, 2, 1);
						else if (2 < songs.length - 1) moveFocus(event.currentTarget, 2, 3);
					}}
				>
					<rect class="grab" x="64" y={art.rows[2].y - 30} width="246" height="40" />
					<text class="num" x={art.rows[2].cardX} y={art.rows[2].y}>3.</text>
					<text class="song" x={art.rows[2].cardX + 26} y={art.rows[2].y}>{songs[2] ?? ''}</text>
				</g>
			</g>
			<g class={track3}>
				<g class="wire">
					<path class="ink desk" d={art.wires[3].ink} />
					<path class="pulse" d={art.wires[3].path} />
				</g>
				<text class="line" x={art.rows[3].pageX} y={art.rows[3].y}>{songs[3] ?? ''}</text>
				<g
					class="row"
					style={shift3}
					tabindex={songs.length > 3 ? '0' : '-1'}
					role="listitem"
					aria-label={'track 4, ' + (songs[3] ?? 'empty') + '. Drag, or use the up and down arrows, to move it.'}
					onPointerDown={(event) => {
						if (songs.length <= 3 || held >= 0 || !event.isPrimary) return;
						capture(event);
						held = 3;
						fromY = event.clientY;
						dragY = 0;
						scale = art.width / (event.currentTarget.ownerSVGElement?.getBoundingClientRect().width ?? art.width);
					}}
					onPointerMove={drag}
					onPointerUp={drop}
					onPointerCancel={drop}
					onTouchMove={(event) => event.preventDefault()}
					onKeyDown={(event) => {
						if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
						event.preventDefault();
						if (event.key === 'ArrowUp') moveFocus(event.currentTarget, 3, 2);
						else if (3 < songs.length - 1) moveFocus(event.currentTarget, 3, 4);
					}}
				>
					<rect class="grab" x="64" y={art.rows[3].y - 30} width="246" height="40" />
					<text class="num" x={art.rows[3].cardX} y={art.rows[3].y}>4.</text>
					<text class="song" x={art.rows[3].cardX + 26} y={art.rows[3].y}>{songs[3] ?? ''}</text>
				</g>
			</g>
			<g class={track4}>
				<g class="wire">
					<path class="ink desk" d={art.wires[4].ink} />
					<path class="pulse" d={art.wires[4].path} />
				</g>
				<text class="line" x={art.rows[4].pageX} y={art.rows[4].y}>{songs[4] ?? ''}</text>
				<g
					class="row"
					style={shift4}
					tabindex={songs.length > 4 ? '0' : '-1'}
					role="listitem"
					aria-label={'track 5, ' + (songs[4] ?? 'empty') + '. Drag, or use the up and down arrows, to move it.'}
					onPointerDown={(event) => {
						if (songs.length <= 4 || held >= 0 || !event.isPrimary) return;
						capture(event);
						held = 4;
						fromY = event.clientY;
						dragY = 0;
						scale = art.width / (event.currentTarget.ownerSVGElement?.getBoundingClientRect().width ?? art.width);
					}}
					onPointerMove={drag}
					onPointerUp={drop}
					onPointerCancel={drop}
					onTouchMove={(event) => event.preventDefault()}
					onKeyDown={(event) => {
						if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
						event.preventDefault();
						if (event.key === 'ArrowUp') moveFocus(event.currentTarget, 4, 3);
						else if (4 < songs.length - 1) moveFocus(event.currentTarget, 4, 5);
					}}
				>
					<rect class="grab" x="64" y={art.rows[4].y - 30} width="246" height="40" />
					<text class="num" x={art.rows[4].cardX} y={art.rows[4].y}>5.</text>
					<text class="song" x={art.rows[4].cardX + 26} y={art.rows[4].y}>{songs[4] ?? ''}</text>
				</g>
			</g>
			</g>
			<g
				class="tool pen"
				tabindex="0"
				role="button"
				aria-label="add a track: songs.push(...)"
				onClick={add}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					add();
				}}
			>
				<rect class="grab" x="76" y="282" width="152" height="56" />
				<path class="pen-body" d={art.pen.body} />
				<path class="ink desk" d={art.pen.ink} />
				<text class="hint" x="192" y="318">add</text>
			</g>
			<g
				class="tool eraser"
				tabindex="0"
				role="button"
				aria-label="remove the last track: songs.pop()"
				onClick={remove}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					remove();
				}}
			>
				<rect class="grab" x="244" y="286" width="140" height="50" />
				<path class="rubber" d={art.eraser.block} />
				<path class="ink desk" d={art.eraser.ink} />
				<text class="hint" x="318" y="318">remove</text>
			</g>
		</svg>
		<figcaption class="sr">
			An ink drawing of a cassette track list. Each line is wired to the same line on a page beside it. Press the pen to add a track:
			one new line inks in on both, with its own wire, and the lines above stay as they were. Press the eraser to take the last track
			off. Drag a line up or down, or focus it and use the arrow keys, to move it: only the lines whose song changed re-ink.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.jcard {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);
				--card: color-mix(in oklch, var(--paper) 72%, oklch(80% 0.08 85));
				--hot: oklch(70% 0.17 60);

				html.dark & {
					--shade: var(--figure-shade);
					--sheet: var(--figure-sheet);
					--card: color-mix(in oklch, var(--figure-sheet) 62%, oklch(58% 0.09 70));
				}
			}

			.shadow {
				fill: var(--shade);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.45;
			}

			.ink {
				fill: var(--ink);
			}

			.faint {
				opacity: 0.35;
			}

			.board {
				fill: var(--card);
			}

			.spine {
				fill: color-mix(in oklch, var(--card) 75%, var(--ink));

				html.dark & {
					fill: color-mix(in oklch, var(--card) 55%, var(--slab));
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.title,
			.spine-title,
			.num,
			.song,
			.line,
			.hint {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.title {
				font-size: 20px;
				font-weight: 800;
			}

			.spine-title {
				font-size: 13px;
				font-weight: 800;
				letter-spacing: 0.25em;
				text-anchor: middle;
				fill: var(--paper);

				html.dark & {
					fill: var(--ink);
				}
			}

			.num {
				font-size: 15px;
				opacity: 0.6;
			}

			.song,
			.line {
				font-size: 19px;
			}

			.hint {
				font-size: 15px;
				opacity: 0.7;
			}

			.track :is(.wire, .line, .song, .num) {
				opacity: 0;
			}

			.track.on :is(.wire, .line, .song) {
				opacity: 1;
				animation: ink-in 500ms ease-out;
			}

			.track.on .num {
				opacity: 0.6;
			}

			.row {
				outline: none;
				cursor: grab;
				touch-action: none;
			}

			.track:not(.on) .row {
				cursor: default;
				pointer-events: none;
			}

			.held .row {
				cursor: grabbing;
			}

			.held .song {
				font-weight: 700;
			}

			.row:focus-visible .grab {
				stroke: var(--ink);
				stroke-dasharray: 4 4;
				stroke-width: 1.2;
			}

			.grab {
				fill: transparent;
			}

			.row:hover .song {
				text-decoration: underline;
				text-decoration-style: wavy;
				text-decoration-thickness: 1px;
			}

			.pulse {
				fill: none;
				stroke: var(--hot);
				stroke-width: 4;
				stroke-linecap: round;
				stroke-dasharray: 14 300;
				stroke-dashoffset: 14;
				opacity: 0;
			}

			.reink-odd .pulse {
				animation: pulse-a 600ms ease-in;
			}

			.reink-even .pulse {
				animation: pulse-b 600ms ease-in;
			}

			.reink-odd :is(.line, .song) {
				animation: reink-a 500ms ease-out;
			}

			.reink-even :is(.line, .song) {
				animation: reink-b 500ms ease-out;
			}

			.tool {
				cursor: pointer;
				outline: none;
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 160ms ease;
			}

			.tool:hover,
			.tool:focus-visible {
				transform: rotate(-4deg) translateY(-2px);
			}

			.tool:focus-visible .grab {
				stroke: var(--ink);
				stroke-dasharray: 4 4;
			}

			.pen-body {
				fill: color-mix(in oklch, var(--paper) 60%, oklch(55% 0.15 260));

				html.dark & {
					fill: color-mix(in oklch longer hue, var(--paper) 35%, oklch(55% 0.15 260));
				}
			}

			.rubber {
				fill: color-mix(in oklch, var(--paper) 60%, oklch(70% 0.12 10));

				html.dark & {
					fill: color-mix(in oklab, var(--paper) 35%, oklch(70% 0.12 10));
				}
			}

			@keyframes ink-in {
				from {
					opacity: 0;
				}
			}

			@keyframes reink-a {
				0% {
					opacity: 0.15;
				}
			}

			@keyframes reink-b {
				0% {
					opacity: 0.15;
				}
			}

			@keyframes pulse-a {
				0% {
					opacity: 1;
					stroke-dashoffset: 14;
				}

				100% {
					opacity: 1;
					stroke-dashoffset: -260;
				}
			}

			@keyframes pulse-b {
				0% {
					opacity: 1;
					stroke-dashoffset: 14;
				}

				100% {
					opacity: 1;
					stroke-dashoffset: -260;
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
		</style>
	</figure>
}
