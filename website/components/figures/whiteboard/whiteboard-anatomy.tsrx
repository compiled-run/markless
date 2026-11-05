// Belief: every component that calls one shared() name reads the same copy, so one write shows in both.
// Objects: one whiteboard (cart) and two desks facing it (Shop, CartBadge).
// Action and change: press the Shop desk; the board's number changes. Unchanged: CartBadge, which owns no copy.
// Prevents: "each component keeps its own copy". Toys: hover a desk to see what it reads; turn the board like a dial.
import { state } from '@markless/core';
import { BOARD, describeOffice, dial, flip, OFFICE_TOUR, READER, WRITER } from './model.ts';
import { art } from './whiteboard.art.ts';

export default function WhiteboardAnatomy() @{
	let bags = state(0);
	let beat = state('rest');
	let look = state('');
	let said = state('');
	let touched = state(false);
	let dragFrom = state(-1);
	const set = (next: number) => {
		bags = next;
		beat = flip(beat);
		look = 'both';
		said = describeOffice(bags);
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let step = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				const next = OFFICE_TOUR[step % OFFICE_TOUR.length];
				step++;
				if (next === 'write') set(dial(bags, 1));
				else look = '';
			}, 2600);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				bags = 0;
				beat = 'rest';
				look = '';
				said = 'The board is wiped back to 0.';
			}
		}}
	>
		<svg class="scene" data-beat={beat} data-look={look} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="A whiteboard and two desks">
			<path class="hatch deep light" d={art.board.cast} />
			<path class="shadow-wash" d={art.desks[0].cast.wash} />
			<path class="hatch deep light" d={art.desks[0].cast.hatch} />
			<path class="shadow-wash" d={art.desks[1].cast.wash} />
			<path class="hatch deep light" d={art.desks[1].cast.hatch} />
			<path class="sight sight-0" d={art.desks[0].sight} />
			<path class="sight sight-1" d={art.desks[1].sight} />

			<g
				class="toy dial"
				tabindex="0"
				role="slider"
				aria-label={'The ' + BOARD + ' board'}
				aria-valuemin="0"
				aria-valuemax="9"
				aria-valuenow={bags}
				onPointerdown={(event) => {
					touched = true;
					dragFrom = event.clientY;
					(event.currentTarget as Element).setPointerCapture(event.pointerId);
				}}
				onPointermove={(event) => {
					if (dragFrom < 0) return;
					const steps = Math.trunc((dragFrom - event.clientY) / 14);
					if (steps === 0) return;
					dragFrom = event.clientY;
					set(dial(bags, steps));
				}}
				onPointerup={() => {
					dragFrom = -1;
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
						event.preventDefault();
						touched = true;
						set(dial(bags, event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1));
					}
				}}
			>
				<path class="frame" d={art.board.frame} />
				<path class="sheet-hatch" d={art.board.frameTone} />
				<path class="board-face" d={art.board.face} />
				<path class="sheet-ink" d={art.board.ink} />
				<g class="spot">
					<path class="wash yellow" d={art.board.spot.wash} />
					<path class="wash yellow pool" d={art.board.spot.pool} />
					<path class="wash-edge" d={art.board.spot.edge} />
				</g>
				<text class="number" transform={art.board.numberMatrix}>{bags}</text>
				<path class="focus" d={art.board.frame} />
				<text class="name" transform={art.board.nameMatrix}>{BOARD}</text>
			</g>

			<g
				class="toy"
				tabindex="0"
				role="button"
				aria-label={'The ' + WRITER + ' desk. Press to write on the board.'}
				onPointerenter={() => {
					look = '0';
				}}
				onPointerleave={() => {
					look = '';
				}}
				onFocus={() => {
					look = '0';
				}}
				onBlur={() => {
					look = '';
				}}
				onClick={() => {
					touched = true;
					set(dial(bags, 1));
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						set(dial(bags, 1));
					}
				}}
			>
				<path class="sheet-paper" d={art.desks[0].paper} />
				<path class="sheet-hatch" d={art.desks[0].shade} />
				<path class="wash pink" d={art.desks[0].wash} />
				<path class="sheet-ink" d={art.desks[0].ink} />
				<path class="focus" d={art.desks[0].paper} />
				<text class="label" transform={art.desks[0].nameMatrix}>{WRITER}</text>
			</g>

			<g
				class="toy"
				tabindex="0"
				role="button"
				aria-label={'The ' + READER + ' desk. Press to see what it reads.'}
				onPointerenter={() => {
					look = '1';
				}}
				onPointerleave={() => {
					look = '';
				}}
				onFocus={() => {
					look = '1';
				}}
				onBlur={() => {
					look = '';
				}}
				onClick={() => {
					touched = true;
					look = '1';
					said = `${READER} reads the ${BOARD} board: ${bags}. It has no copy of its own.`;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						look = '1';
						said = `${READER} reads the ${BOARD} board: ${bags}. It has no copy of its own.`;
					}
				}}
			>
				<path class="sheet-paper" d={art.desks[1].paper} />
				<path class="sheet-hatch" d={art.desks[1].shade} />
				<path class="sheet-ink" d={art.desks[1].ink} />
				<path class="focus" d={art.desks[1].paper} />
				<text class="label" transform={art.desks[1].nameMatrix}>{READER}</text>
			</g>
		</svg>
		<figcaption class="sr">
			A whiteboard labelled {BOARD} and two desks facing it, {WRITER} and {READER}. Press the pink {WRITER} desk and it writes the next number
			on the board. Hover or focus either desk to see a pencil line from it to the one board it reads. Drag the board's number up or down, or use
			the arrow keys on it, to turn it like a dial. {READER} never has a number of its own. Escape wipes the board.
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
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.ink {
				fill: var(--ink);
			}

			.sheet-hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.faint {
				opacity: 0.35;
			}

			.light {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.ribbon {
				fill: color-mix(in oklch, var(--sheet) 70%, oklch(72% 0.07 65));
			}

			.kraft {
				fill: color-mix(in oklch, var(--paper) 72%, oklch(72% 0.07 65));
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.wash-edge {
				fill: none;
				stroke: oklch(72% 0.15 75);
				stroke-width: 1;
				opacity: 0.55;
				mix-blend-mode: multiply;
			}

			.number,
			.label,
			.name {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.number {
				font-size: 26px;
				font-weight: 800;
			} 
			.name {
				font-size: 9px;
				font-weight: 700;
				font-style: italic;
				opacity: 0.8;
			}

			.frame {
				fill: color-mix(in oklch, var(--sheet) 80%, var(--ink));
			}

			.board-face {
				fill: color-mix(in oklch, var(--sheet) 60%, white);
			}

			.dial {
				cursor: ns-resize;
			}

			.sight {
				fill: var(--pencil, color-mix(in srgb, var(--pink) 70%, #e0603c));
				opacity: 0;
				transition: opacity 160ms ease;
				pointer-events: none;
			}

			.scene[data-look='0'] .sight-0,
			.scene[data-look='1'] .sight-1,
			.scene[data-look='both'] .sight {
				opacity: 0.85;
			}


			.label {
				font-size: 13px;
				font-weight: 700;
				fill: var(--ink);
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					opacity: 0.32;
				}
			}

			.spot {
				opacity: 0;
			}

			.spot,
			.label,
			.name,
			.number {
				pointer-events: none;
			}

			.toy {
				cursor: pointer;
				outline: none;
				transition: transform 160ms ease;
			}

			.toy:hover,
			.toy:focus-visible {
				transform: translateY(-4px);
			}

			.toy:focus-visible .focus {
				opacity: 1;
			}

			.focus {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.2;
				stroke-dasharray: 4 4;
				opacity: 0;
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--glow: glow-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--glow: glow-b;
			}

			.scene:not([data-beat='rest']) .press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}


			.scene:not([data-beat='rest']) .spot {
				animation: var(--glow) 1600ms 120ms ease-out both;
			}

			@keyframes sink-a {
				40% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes sink-b {
				40% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}


			@keyframes glow-a {
				0% {
					opacity: 0;
				}
				25% {
					opacity: 1;
				}
				100% {
					opacity: 0.6;
				}
			}

			@keyframes glow-b {
				0% {
					opacity: 0;
				}
				25% {
					opacity: 1;
				}
				100% {
					opacity: 0.6;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}

				.scene:not([data-beat='rest']) .spot {
					opacity: 0.6;
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
