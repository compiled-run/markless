// Belief: a reload starts state() over; a storage() value reopens where the reader left it.
// Objects: two notebooks, storage and state, and the ribbon in the storage one (the saved value).
// Action and change: press reload; both shut and reopen, and only state is back at page 1. Unchanged: storage, at its page.
// Prevents: "a reload loses every value". Toys: turn pages, pull the ribbon out (then storage starts over too).
import { state } from '@markless/core';
import { BOOKMARK_TOUR, describeReload, flip, KEPT, PLAIN, START, turn } from './model.ts';
import { art } from './bookmark.art.ts';

export default function BookmarkAnatomy() @{
	let kept = state(START);
	let plain = state(START);
	let ribbon = state(true);
	let beat = state('rest');
	let reset = state('');
	let said = state('');
	let touched = state(false);
	let dragFrom = state(-1);
	let dragged = state(false);
	const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const reload = () => {
		const keep = ribbon;
		beat = flip(beat);
		reset = keep ? 'plain' : 'both';
		const settle = () => {
			plain = 1;
			if (!keep) kept = 1;
			said = describeReload(kept, plain, keep);
		};
		if (calm()) settle();
		else setTimeout(settle, 700);
	};
	const pageKeys = (event: KeyboardEvent, which: 'kept' | 'plain') => {
		const by = event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
		if (by === 0) return;
		touched = true;
		if (which === 'kept') kept = turn(kept, by);
		else plain = turn(plain, by);
		said = which === 'kept' ? `The ${KEPT} notebook is at page ${kept}.` : `The ${PLAIN} notebook is at page ${plain}.`;
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
				const next = BOOKMARK_TOUR[step % BOOKMARK_TOUR.length];
				step++;
				if (next === 'reload') {
					kept = START;
					plain = START;
					reload();
				}
			}, 3800);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				kept = START;
				plain = START;
				ribbon = true;
				beat = 'rest';
				reset = '';
				said = 'Back to the start: both notebooks at page 7, the ribbon in place.';
			}
		}}
	>
		<svg class="scene" data-beat={beat} data-reset={reset} data-ribbon={ribbon ? 'in' : 'out'} style={art.pull} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="Two notebooks and a reload button">
			<path class="shadow-wash" d={art.books[0].cast.wash} />
			<path class="hatch deep light" d={art.books[0].cast.hatch} />
			<path class="shadow-wash" d={art.books[1].cast.wash} />
			<path class="hatch deep light" d={art.books[1].cast.hatch} />

			<g
				class="toy book"
				tabindex="0"
				role="button"
				aria-label={'The ' + KEPT + ' notebook, at page ' + kept + '. Press or use the arrow keys to turn a page.'}
				onClick={() => {
					touched = true;
					kept = turn(kept, 1);
					said = `The ${KEPT} notebook is at page ${kept}.`;
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						pageKeys(event, 'kept');
					}
				}}
			>
				<path class="sheet-paper" d={art.books[0].block} />
				<path class="sheet-hatch" d={art.books[0].blockShade} />
				<path class="sheet-ink" d={art.books[0].blockInk} />
				<path class="sheet-paper" d={art.books[0].pages} />
				<path class="sheet-hatch light" d={art.books[0].gutter} />
				<path class="sheet-hatch faint" d={art.books[0].writing} />
				<path class="sheet-ink" d={art.books[0].pagesInk} />
				<g class="spot kept">
					<path class="wash yellow" d={art.books[0].spot.wash} />
					<path class="wash yellow pool" d={art.books[0].spot.pool} />
				</g>
				<text class="number" transform={art.books[0].numberMatrix}>{kept}</text>
				<path class="focus" d={art.books[0].block} />
				<text class="label" transform={art.books[0].labelMatrix}>{KEPT}</text>
			</g>

			<g
				class="toy book"
				tabindex="0"
				role="button"
				aria-label={'The ' + PLAIN + ' notebook, at page ' + plain + '. Press or use the arrow keys to turn a page.'}
				onClick={() => {
					touched = true;
					plain = turn(plain, 1);
					said = `The ${PLAIN} notebook is at page ${plain}.`;
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						pageKeys(event, 'plain');
					}
				}}
			>
				<path class="sheet-paper" d={art.books[1].block} />
				<path class="sheet-hatch" d={art.books[1].blockShade} />
				<path class="sheet-ink" d={art.books[1].blockInk} />
				<path class="sheet-paper" d={art.books[1].pages} />
				<path class="sheet-hatch light" d={art.books[1].gutter} />
				<path class="sheet-hatch faint" d={art.books[1].writing} />
				<path class="sheet-ink" d={art.books[1].pagesInk} />
				<g class="spot plain">
					<path class="wash yellow" d={art.books[1].spot.wash} />
					<path class="wash yellow pool" d={art.books[1].spot.pool} />
				</g>
				<text class="number" transform={art.books[1].numberMatrix}>{plain}</text>
				<path class="focus" d={art.books[1].block} />
				<text class="label" transform={art.books[1].labelMatrix}>{PLAIN}</text>
			</g>

			<g
				class="toy ribbon-toy"
				tabindex="0"
				role="switch"
				aria-checked={ribbon ? 'true' : 'false'}
				aria-label="The ribbon in the storage notebook. Drag it up to pull it out, or down to put it back."
				onPointerdown={(event) => {
					touched = true;
					dragged = false;
					dragFrom = event.clientY;
					(event.currentTarget as Element).setPointerCapture(event.pointerId);
				}}
				onPointermove={(event) => {
					if (dragFrom < 0) return;
					const dy = event.clientY - dragFrom;
					if (dy < -18 && ribbon) {
						ribbon = false;
						dragged = true;
						said = 'Ribbon pulled out. Reload now, and the storage notebook has nothing to keep.';
					} else if (dy > 18 && !ribbon) {
						ribbon = true;
						dragged = true;
						said = 'Ribbon back in place.';
					}
				}}
				onPointerup={() => {
					dragFrom = -1;
				}}
				onClick={() => {
					if (dragged) {
						dragged = false;
						return;
					}
					ribbon = !ribbon;
					said = ribbon ? 'Ribbon back in place.' : 'Ribbon pulled out. Reload now, and the storage notebook has nothing to keep.';
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						ribbon = event.key === 'ArrowUp' ? false : event.key === 'ArrowDown' ? true : !ribbon;
						said = ribbon ? 'Ribbon back in place.' : 'Ribbon pulled out. Reload now, and the storage notebook has nothing to keep.';
					}
				}}
			>
				<path class="ribbon" d={art.ribbon.paper} />
				<path class="sheet-hatch" d={art.ribbon.tone} />
				<path class="sheet-ink" d={art.ribbon.ink} />
			</g>

			<g class="cover">
				<path class="kraft" d={art.books[0].cover} />
				<path class="sheet-hatch light" d={art.books[0].coverTone} />
				<path class="sheet-ink" d={art.books[0].coverInk} />
				<path class="kraft" d={art.books[1].cover} />
				<path class="sheet-hatch light" d={art.books[1].coverTone} />
				<path class="sheet-ink" d={art.books[1].coverInk} />
			</g>

			<g
				class="toy reload"
				tabindex="0"
				role="button"
				aria-label="Reload the page"
				onClick={() => {
					touched = true;
					reload();
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						reload();
					}
				}}
			>
				<path class="sheet-ink" d={art.reload.side} />
				<g class="press" style={art.reload.sink}>
					<path class="sheet-paper" d={art.reload.paper} />
					<path class="wash pink" d={art.reload.wash} />
					<path class="sheet-ink" d={art.reload.ink} />
				</g>
				<path class="focus" d={art.reload.paper} />
			</g>
		</svg>
		<figcaption class="sr">
			Two notebooks lie open on a desk at page 7: {KEPT}, with a ribbon bookmark, and {PLAIN}, without. Press the pink reload button: both
			shut and open again, and only {PLAIN} is back at page 1. Turn either notebook's pages with a press or the arrow keys, and drag the
			ribbon up to pull it out; reload then, and {KEPT} starts over too. Escape puts everything back.
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
			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.number {
				font-size: 15px;
				font-weight: 800;
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

			.cover,
			.spot {
				opacity: 0;
			}

			.cover,
			.spot,
			.label,
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

			.ribbon-toy {
				cursor: grab;
				transition: transform 320ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.scene[data-ribbon='out'] .ribbon-toy {
				transform: translate(var(--pull-x), var(--pull-y));
			}

			.scene[data-ribbon='out'] .ribbon-toy:hover,
			.scene[data-ribbon='out'] .ribbon-toy:focus-visible {
				transform: translate(var(--pull-x), calc(var(--pull-y) - 4px));
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--shut: shut-a;
				--glow: glow-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--shut: shut-b;
				--glow: glow-b;
			}

			.scene:not([data-beat='rest']) .press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.scene:not([data-beat='rest']) .cover {
				animation: var(--shut) 1400ms 150ms ease-in-out both;
			}

			.scene[data-reset='plain'] .spot.plain,
			.scene[data-reset='both'] .spot {
				animation: var(--glow) 1600ms 1300ms ease-out both;
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

			@keyframes shut-a {
				0% {
					opacity: 0;
				}
				30%,
				62% {
					opacity: 1;
				}
				100% {
					opacity: 0;
				}
			}

			@keyframes shut-b {
				0% {
					opacity: 0;
				}
				30%,
				62% {
					opacity: 1;
				}
				100% {
					opacity: 0;
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

				.scene[data-reset='plain'] .spot.plain,
				.scene[data-reset='both'] .spot {
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
