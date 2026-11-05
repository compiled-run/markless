// Belief (13 words): a handle is a ticket for an element; handing it in gives the element.
// Objects (2): the ticket = field, the handle; the coat rack with its coat = the <input> on the page. Nothing left over.
// Action and change: hand the ticket over (press, drag, Enter); the coat comes to it and the ticket reads <input>. The ticket itself never changes.
// Prevents: "the handle is a copy" and "the element is always there". Surprise: take the coat off the rack first, and the ticket comes back undefined while the hook swings.
import { state } from '@markless/core';
import { COAT, COAT_TOUR, describeHand, describeStand, fetched, flip, HANDLE } from './model.ts';
import { art } from './coat-check.art.ts';

export default function CoatAnatomy() @{
	let coatHere = state(true);
	let beat = state('rest');
	let swing = state('rest');
	let value = state('');
	let touched = state(false);
	let said = state('');
	let dragFrom = state<number | null>(null);
	let dragged = state(false);
	const hand = () => {
		touched = true;
		value = '= ' + fetched(coatHere);
		said = describeHand(coatHere);
		if (coatHere) beat = flip(beat);
		else swing = flip(swing);
	};
	const toggleCoat = () => {
		touched = true;
		coatHere = !coatHere;
		value = '';
		said = describeStand(coatHere);
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
				const next = COAT_TOUR[step % COAT_TOUR.length];
				step++;
				if (next === 'hand') {
					value = '= ' + fetched(coatHere);
					beat = flip(beat);
				}
			}, 2400);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				coatHere = true;
				value = '';
				beat = 'rest';
				swing = 'rest';
				said = '';
			}
		}}
	>
		<svg class="scene" data-coat={coatHere ? 'here' : 'gone'} data-beat={beat} data-swing={swing} style={art.travel} viewBox={'0 0 ' + art.width + ' ' + art.height}>
			<path class="pencil" d={art.pencil} />
			<path class="shadow-wash" d={art.ticket.cast} />
			<path class="hatch light" d={art.ticket.castHatch} />

			<g
				class="obj ticket"
				role="button"
				tabindex="0"
				aria-label={'The ticket ' + HANDLE + '. Hand it over.'}
				onClick={() => {
					if (dragged) {
						dragged = false;
						return;
					}
					hand();
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
						event.preventDefault();
						hand();
					}
				}}
				onPointerdown={(event) => {
					(event.currentTarget as Element).setPointerCapture(event.pointerId);
					dragFrom = event.clientX;
					dragged = false;
				}}
				onPointermove={(event) => {
					if (dragFrom === null || dragged) return;
					if (event.clientX - dragFrom < 40) return;
					dragged = true;
					hand();
				}}
				onPointerup={() => {
					dragFrom = null;
				}}
			>
				<path class="ticket-paper" d={art.ticket.paper} />
				<path class="hatch" d={art.ticket.shade} />
				<path class="desk-hole" d={art.ticket.hole} />
				<path class="ink" d={art.ticket.perf} />
				<path class="ink" d={art.ticket.ink} />
				<text class="number" transform={art.ticket.numberMatrix}>7</text>
				<text class="name" transform={art.ticket.nameMatrix}>{HANDLE}</text>
				<g class="value-spot">
					<path class="wash yellow" d={art.ticket.spot.wash} />
				</g>
				<text class="value" transform={art.ticket.valueMatrix}>{value}</text>
			</g>

			<g
				class="obj stand"
				role="button"
				tabindex="0"
				aria-label={coatHere ? 'The coat rack, with the ' + COAT + ' coat on it. Press to take the coat off the page.' : 'The coat rack, empty. Press to hang the coat back.'}
				onClick={toggleCoat}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						toggleCoat();
					}
				}}
			>
				<path class="shadow-wash" d={art.stand.cast} />
				<path class="wood" d={art.stand.plank} />
				<path class="hatch" d={art.stand.plankShade} />
				<path class="ink" d={art.stand.plankInk} />
				<g class="swing" style={art.stand.pivot}>
					<path class="brass" d={art.stand.hook} />
				</g>
				<g class="coat" style={art.coat.origin}>
					<path class="shadow-wash" d={art.coat.cast} />
					<path class="coat-spot wash yellow" d={art.coat.spot} />
					<path class="coat-paper" d={art.coat.paper} />
					<path class="wash coat-wash" d={art.coat.wash} />
					<path class="hatch" d={art.coat.shade} />
					<path class="ink" d={art.coat.ink} />
				</g>
				<text class="label here" transform={art.coat.labelAt}>{COAT}</text>
				<text class="label gone" transform={art.coat.labelAt}>undefined</text>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink drawing of two things: a coat-check ticket on a desk, number 7, named {HANDLE}, and a coat rack with a coat, the
			{COAT}, on its hook. Hand the ticket over by pressing it, dragging it right, or pressing Enter: the coat comes to it and the
			ticket reads {COAT}. Press the rack to take the coat off the page first, and handing the ticket over brings back undefined while
			the hook swings empty. The ticket itself never changes. Escape puts everything back.
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
				--ticket: color-mix(in oklch, var(--paper) 72%, oklch(80% 0.07 80));
				--wood: color-mix(in oklch, var(--paper) 70%, oklch(62% 0.07 55));
				--coat: color-mix(in oklch, var(--paper) 78%, white);
				--shade: color-mix(in oklch, var(--ink) 22%, transparent);

				html.dark & {
					--ticket: color-mix(in oklch, var(--paper) 72%, oklch(55% 0.05 80));
					--wood: color-mix(in oklch, var(--paper) 72%, oklch(50% 0.06 55));
					--coat: color-mix(in oklch, var(--paper) 85%, var(--ink));
					--shade: rgb(0 0 0 / 0.5);
				}
			}

			.obj {
				cursor: pointer;
				outline: none;
				transform-box: fill-box;
				transform-origin: 50% 100%;
				transition: transform 160ms ease;
			}

			.ticket {
				cursor: grab;
			}

			.ticket:hover,
			.ticket:focus-visible {
				transform: translateY(-4px) rotate(-1deg);
			}

			.stand:hover .swing,
			.stand:focus-visible .swing,
			.stand:hover .coat,
			.stand:focus-visible .coat {
				transform: rotate(1.5deg);
			}

			.swing,
			.coat {
				transition: transform 200ms ease, opacity 260ms ease;
			}

			.obj:focus-visible .ink {
				stroke: var(--ink);
				stroke-width: 0.6;
			}

			.ticket-paper {
				fill: var(--ticket);
			}

			.wood {
				fill: var(--wood);
			}

			.coat-paper {
				fill: var(--coat);
			}

			.desk-hole {
				fill: color-mix(in oklch, var(--ink) 25%, var(--paper));
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

			.light {
				opacity: 0.55;
			}

			.shadow-wash {
				fill: var(--shade);
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

			.coat-wash {
				fill: var(--ink);
				stroke: none;
				opacity: 0.06;
			}

			.brass {
				fill: color-mix(in oklch, var(--ink) 70%, oklch(60% 0.12 75));
			}

			.number,
			.name,
			.value,
			.label {
				font-family: var(--font-mono, ui-monospace, monospace);
				font-weight: 700;
				fill: var(--ink);
				text-anchor: middle;
			}

			.number {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 28px;
				font-weight: 800;
			}

			.name {
				font-size: 16px;
			}

			.value {
				font-size: 10px;
			}

			.label {
				font-size: 12px;
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.stand:hover .label.here,
			.stand:focus-visible .label.here {
				opacity: 1;
			}

			.scene[data-coat='gone'] .stand:hover .label.here,
			.scene[data-coat='gone'] .stand:focus-visible .label.here {
				opacity: 0;
			}

			.scene[data-coat='gone'] .stand:hover .label.gone,
			.scene[data-coat='gone'] .stand:focus-visible .label.gone {
				opacity: 1;
			}

			.scene[data-coat='gone'] .coat {
				opacity: 0;
			}

			.coat-spot,
			.value-spot {
				opacity: 0;
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
				--fetch: fetch-a;
				--glow: glow-a;
			}

			.scene[data-beat='even'] {
				--fetch: fetch-b;
				--glow: glow-b;
			}

			.scene[data-swing='odd'] {
				--sway: sway-a;
			}

			.scene[data-swing='even'] {
				--sway: sway-b;
			}

			.scene:not([data-beat='rest'])[data-coat='here'] .coat {
				animation: var(--fetch) 1100ms ease-in-out;
			}

			.scene:not([data-beat='rest'])[data-coat='here'] .coat-spot,
			.scene:not([data-beat='rest'])[data-coat='here'] .value-spot {
				animation: var(--glow) 1600ms ease-out both;
			}

			.scene:not([data-swing='rest']) .swing {
				animation: var(--sway) 900ms ease-out;
			}

			@keyframes fetch-a {
				45% {
					transform: translate(var(--to-x), var(--to-y)) rotate(-6deg);
				}
			}

			@keyframes fetch-b {
				45% {
					transform: translate(var(--to-x), var(--to-y)) rotate(-6deg);
				}
			}

			@keyframes glow-a {
				0% {
					opacity: 0;
				}
				30% {
					opacity: 0.9;
				}
				100% {
					opacity: 0.5;
				}
			}

			@keyframes glow-b {
				0% {
					opacity: 0;
				}
				30% {
					opacity: 0.9;
				}
				100% {
					opacity: 0.5;
				}
			}

			@keyframes sway-a {
				20% {
					transform: rotate(5deg);
				}
				50% {
					transform: rotate(-3deg);
				}
				75% {
					transform: rotate(1.5deg);
				}
			}

			@keyframes sway-b {
				20% {
					transform: rotate(5deg);
				}
				50% {
					transform: rotate(-3deg);
				}
				75% {
					transform: rotate(1.5deg);
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
