// Belief (11 words): a child is cut once; the parent's value shows through it live.
// Objects (2): the stencil card = CartBadge, cut as {bags}; the paint pot = bags, its paint = the value. Nothing left over.
// Action and change: give the pot new paint (press, drag up or down, arrows); only the letters' colour changes. The card never does.
// Prevents: "a new prop value runs the child again". Surprise: try to change the card and it shakes and stays the same.
import { computed, state } from '@markless/core';
import { CHILD, DIAL, describePaint, flip, nextPaint, type Paint, PROP, REFUSE, STENCIL_TOUR } from './model.ts';
import { art } from './stencil.art.ts';

export default function StencilAnatomy() @{
	let paint = state<Paint>('yellow');
	let beat = state('rest');
	let nudge = state('rest');
	let touched = state(false);
	let said = state('');
	let dragFrom = state<number | null>(null);
	let dragged = state(false);
	const pour = (step: number) => {
		touched = true;
		paint = nextPaint(paint, step);
		beat = flip(beat);
		said = describePaint(paint);
	};
	const refuse = () => {
		touched = true;
		nudge = flip(nudge);
		said = REFUSE;
	};
	const label = computed(() => '"' + paint + '"');

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
				const next = STENCIL_TOUR[step % STENCIL_TOUR.length];
				step++;
				if (next === 'paint') {
					paint = nextPaint(paint, 1);
					beat = flip(beat);
				}
			}, 1800);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				paint = 'yellow';
				beat = 'rest';
				said = '';
			}
		}}
	>
		<svg class="scene" data-paint={paint} data-beat={beat} data-nudge={nudge} viewBox={'0 0 ' + art.width + ' ' + art.height}>
			<path class="pencil" d={art.pencil} />
			<path class="shadow-wash" d={art.card.cast} />
			<path class="hatch light" d={art.card.castHatch} />
			<path class="shadow-wash" d={art.pot.cast} />
			<path class="hatch light" d={art.pot.castHatch} />

			<g
				class="obj card once"
				role="button"
				tabindex="0"
				aria-label={CHILD + ', the stencil'}
				onClick={refuse}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						refuse();
					}
				}}
			>
				<path class="card-paper" d={art.card.paper} />
				<path class="hatch faint" d={art.card.grain} />
				<path class="hatch" d={art.card.shade} />
				<path class="ink" d={art.card.ink} />
				<text class="name" transform={art.card.nameMatrix}>{CHILD}</text>
				<text class="letters" transform={art.card.lettersMatrix}>{'{bags}'}</text>
			</g>

			<g
				class="obj pot"
				role="button"
				tabindex="0"
				aria-label={PROP + ', the paint pot. Press for new paint, or use the arrow keys.'}
				onClick={() => {
					if (dragged) {
						dragged = false;
						return;
					}
					pour(1);
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowUp' || event.key === 'ArrowRight') {
						event.preventDefault();
						pour(1);
					}
					if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
						event.preventDefault();
						pour(-1);
					}
				}}
				onPointerdown={(event) => {
					(event.currentTarget as Element).setPointerCapture(event.pointerId);
					dragFrom = event.clientY;
					dragged = false;
				}}
				onPointermove={(event) => {
					if (dragFrom === null) return;
					const moved = dragFrom - event.clientY;
					if (Math.abs(moved) < DIAL) return;
					dragFrom = event.clientY;
					dragged = true;
					pour(moved > 0 ? 1 : -1);
				}}
				onPointerup={() => {
					dragFrom = null;
				}}
			>
				<path class="hit" d={art.pot.hit} />
				<path class="pot-paper" d={art.pot.body} />
				<path class="hatch" d={art.pot.shade} />
				<path class="paint" d={art.pot.paint} />
				<path class="paint drip" d={art.pot.drip} />
				<path class="pot-paper" d={art.pot.label} />
				<path class="action" d={art.pot.label} />
				<path class="ink" d={art.pot.labelInk} />
				<path class="ink" d={art.pot.ink} />
				<text class="tag" transform={art.pot.tagMatrix}>{PROP}</text>
				<text class="value" transform={art.pot.valueAt}>{label}</text>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink drawing of two things on a desk: a card stencil, {CHILD}, with {'{bags}'} cut through it, and a paint pot tagged
			{PROP}. The pot's paint shows through the cut letters. Press the pot, drag it up or down, or use the arrow keys for new paint: the
			letters take the new colour at once. The stencil itself never changes; press it and it only shakes. Escape goes back to yellow.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				--card: color-mix(in oklch, var(--paper) 62%, oklch(74% 0.06 70));
				--tin: color-mix(in oklch, var(--paper) 80%, white);
				--shade: color-mix(in oklch, var(--ink) 22%, transparent);
				--paint: var(--yellow);

				html.dark & {
					--card: color-mix(in oklch, var(--paper) 70%, oklch(55% 0.05 70));
					--tin: color-mix(in oklch, var(--paper) 85%, var(--ink));
					--shade: rgb(0 0 0 / 0.5);
				}
			}

			.scene[data-paint='sky'] {
				--paint: oklch(74% 0.11 235);
			}

			.scene[data-paint='mint'] {
				--paint: oklch(80% 0.12 160);
			}

			.obj {
				cursor: pointer;
				outline: none;
				transform-box: fill-box;
				transform-origin: 50% 100%;
				transition: transform 160ms ease;
			}

			.obj:hover,
			.obj:focus-visible {
				transform: translateY(-4px);
			}

			.card:hover,
			.card:focus-visible {
				transform: translateY(-3px) rotate(-0.6deg);
			}

			.pot {
				cursor: ns-resize;
			}

			.obj:focus-visible .ink {
				stroke: var(--ink);
				stroke-width: 0.6;
			}

			.hit {
				fill: transparent;
			}

			.card-paper {
				fill: var(--card);
			}

			.pot-paper {
				fill: var(--tin);
			}

			.action {
				fill: var(--pink);
				opacity: 0.55;
				mix-blend-mode: multiply;
			}

			.ink {
				fill: var(--ink);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.faint {
				opacity: 0.35;
			}

			.light {
				opacity: 0.55;
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.paint {
				fill: var(--paint);
				stroke: var(--paint);
				transition: fill 300ms ease, stroke 300ms ease;
			}

			.letters {
				font-family: var(--font-mono, ui-monospace, monospace);
				font-size: 46px;
				font-weight: 800;
				fill: var(--paint);
				stroke: var(--ink);
				stroke-width: 1.3;
				paint-order: stroke;
				transition: fill 300ms ease 120ms;
			}

			.name,
			.tag,
			.value {
				font-family: var(--font-mono, ui-monospace, monospace);
				font-weight: 700;
				fill: var(--ink);
			}

			.name {
				font-size: 11px;
			}

			.tag,
			.value {
				font-size: 12px;
				text-anchor: middle;
			}

			.value {
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.pot:hover .value,
			.pot:focus-visible .value,
			.scene:not([data-beat='rest']) .value {
				opacity: 1;
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

			.scene[data-beat='odd'] {
				--tip: tip-a;
			}

			.scene[data-beat='even'] {
				--tip: tip-b;
			}

			.scene[data-nudge='odd'] {
				--shake: shake-a;
			}

			.scene[data-nudge='even'] {
				--shake: shake-b;
			}

			.pot > * {
				transform-box: view-box;
			}

			.scene:not([data-beat='rest']) .pot {
				animation: var(--tip) 420ms ease-out;
			}

			.scene:not([data-nudge='rest']) .card {
				animation: var(--shake) 420ms ease-out;
			}

			@keyframes tip-a {
				40% {
					transform: translateY(-4px) rotate(-5deg);
				}
			}

			@keyframes tip-b {
				40% {
					transform: translateY(-4px) rotate(-5deg);
				}
			}

			@keyframes shake-a {
				20% {
					transform: translateX(-5px);
				}
				45% {
					transform: translateX(4px);
				}
				70% {
					transform: translateX(-2px);
				}
			}

			@keyframes shake-b {
				20% {
					transform: translateX(-5px);
				}
				45% {
					transform: translateX(4px);
				}
				70% {
					transform: translateX(-2px);
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
