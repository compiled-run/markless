// Two paint dabs on a palette and the swatch they mix to: turn either dab like a dial and the swatch re-mixes live; the brush can't paint the swatch itself.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import { blueOf, clamp, describeMix, dial, flip, mixOf, redOf, REFUSED, START } from './mixer-model.ts';
import { art } from './mixer.art.ts';

export default function MixerAnatomy() @{
	let red = state<number>(START.red);
	let blue = state<number>(START.blue);
	let dragging = state('');
	let fromY = state(0);
	let fromValue = state(0);
	let skid = state('rest');
	let said = state('');
	const mix = computed(() => mixOf(red, blue));
	const redFill = computed(() => 'fill: ' + redOf(red));
	const blueFill = computed(() => 'fill: ' + blueOf(blue));
	const mixFill = computed(() => 'fill: ' + mix);
	const redSize = computed(() => 'transform: scale(' + (0.3 + red * 0.08) + ')');
	const blueSize = computed(() => 'transform: scale(' + (0.3 + blue * 0.08) + ')');

	<figure class="anatomy mixer">
		<svg class="scene" data-skid={skid} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="red and blue mix to a swatch">
			<path class="shadow" d={art.palette.shadow} />
			<path class="hatch" d={art.palette.shadowHatch} />
			<path class="board" d={art.palette.board} />
			<path class="hatch grain" d={art.palette.grain} />
			<path class="desk" d={art.palette.hole} />
			<path class="ink" d={art.palette.ink} />
			<path class="ink" d={art.plus} />
			<path class="ink" d={art.equals} />
			<g
				class={dragging === 'red' ? 'dab held' : 'dab'}
				tabindex="0"
				role="slider"
				aria-label="red"
				aria-valuenow={red}
				aria-valuemin="0"
				aria-valuemax="10"
				onPointerDown={(event) => {
					capture(event);
					dragging = 'red';
					fromY = event.clientY;
					fromValue = red;
				}}
				onPointerMove={(event) => {
					if (dragging !== 'red') return;
					const next = dial(fromValue, fromY, event.clientY);
					if (next !== red) {
						red = next;
						said = describeMix(red, blue);
					}
				}}
				onPointerUp={() => {
					dragging = '';
				}}
				onWheel={(event) => {
					event.preventDefault();
					red = clamp(red + (event.deltaY < 0 ? 1 : -1));
					said = describeMix(red, blue);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();if (event.key === 'ArrowUp' || event.key === 'ArrowRight') red = clamp(red + 1);
					else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') red = clamp(red - 1);
					else return;
					said = describeMix(red, blue);
				}}
			>
				<circle class="grab" cx={art.dabs[0].cx} cy={art.dabs[0].cy} r="70" />
				<g class="blob" style={redSize}>
					<path class="paint" style={redFill} d={art.dabs[0].blob} />
					<path class="hatch" d={art.dabs[0].shade} />
					<path class="ink" d={art.dabs[0].ink} />
				</g>
				<text class="label" x={art.dabs[0].cx} y="250">red</text>
			</g>
			<g
				class={dragging === 'blue' ? 'dab held' : 'dab'}
				tabindex="0"
				role="slider"
				aria-label="blue"
				aria-valuenow={blue}
				aria-valuemin="0"
				aria-valuemax="10"
				onPointerDown={(event) => {
					capture(event);
					dragging = 'blue';
					fromY = event.clientY;
					fromValue = blue;
				}}
				onPointerMove={(event) => {
					if (dragging !== 'blue') return;
					const next = dial(fromValue, fromY, event.clientY);
					if (next !== blue) {
						blue = next;
						said = describeMix(red, blue);
					}
				}}
				onPointerUp={() => {
					dragging = '';
				}}
				onWheel={(event) => {
					event.preventDefault();
					blue = clamp(blue + (event.deltaY < 0 ? 1 : -1));
					said = describeMix(red, blue);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();if (event.key === 'ArrowUp' || event.key === 'ArrowRight') blue = clamp(blue + 1);
					else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') blue = clamp(blue - 1);
					else return;
					said = describeMix(red, blue);
				}}
			>
				<circle class="grab" cx={art.dabs[1].cx} cy={art.dabs[1].cy} r="70" />
				<g class="blob" style={blueSize}>
					<path class="paint" style={blueFill} d={art.dabs[1].blob} />
					<path class="hatch" d={art.dabs[1].shade} />
					<path class="ink" d={art.dabs[1].ink} />
				</g>
				<text class="label" x={art.dabs[1].cx} y="250">blue</text>
			</g>

			<g
				class="swatch"
				tabindex="0"
				role="img"
				aria-label="mix, worked out from red and blue"
				onPointerDown={() => {
					skid = flip(skid);
					said = REFUSED;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Tab') return;
					skid = flip(skid);
					said = REFUSED;
				}}
			>
				<path class="shadow" d={art.swatch.shadow} />
				<path class="hatch" d={art.swatch.shadowHatch} />
				<path class="card" d={art.swatch.card} />
				<path class="paint" style={mixFill} d={art.swatch.patch} />
				<path class="ink" d={art.swatch.ink} />
				<path class="streak" d="M470 220 C 520 200, 560 260, 640 230" />
				<text class="label" x={art.swatch.labelX} y={art.swatch.labelY}>mix</text>
			</g>
		</svg>
		<figcaption class="sr">
			An ink drawing of a wooden palette with a red dab and a blue dab, and beside it a swatch card painted with their mix. Drag a dab up
			or down like a dial, scroll on it, or focus it and use the arrow keys: the dab grows or shrinks and the swatch re-mixes live. Try to
			paint the swatch itself and the brush skids off, because the mix is worked out, not set.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.mixer {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: none;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);
				--wood: color-mix(in oklch, var(--paper) 70%, oklch(72% 0.07 65));

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
					--wood: color-mix(in oklch, var(--ink) 75%, oklch(55% 0.07 65));
				}
			}

			.dab {
				touch-action: none;
				cursor: ns-resize;
				outline: none;
			}

			.blob {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 160ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.dab:hover .ink,
			.dab:focus-visible .ink {
				stroke: var(--ink);
				stroke-width: 1;
			}

			.grab {
				fill: transparent;
			}

			.held .blob {
				transition: none;
			}

			.swatch {
				cursor: crosshair;
				outline: none;
				transform-box: fill-box;
				transform-origin: 50% 100%;
			}

			.swatch:hover {
				transform: rotate(0.8deg);
			}

			.swatch:focus-visible .card {
				stroke: var(--ink);
				stroke-dasharray: 5 5;
				stroke-width: 1.5;
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

			.grain {
				opacity: 0.25;
			}

			.board {
				fill: var(--wood);
			}

			.desk {
				fill: var(--paper);
			}

			.card {
				fill: var(--sheet);
			}

			.paint {
				transition: fill 200ms ease;
			}

			.ink {
				fill: var(--ink);
			}

			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 22px;
				font-weight: 800;
				text-anchor: middle;
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			.streak {
				fill: none;
				stroke: var(--ink);
				stroke-width: 6;
				stroke-linecap: round;
				stroke-dasharray: 220;
				stroke-dashoffset: 220;
				opacity: 0;
			}

			.scene[data-skid='odd'] .streak {
				animation: skid-a 700ms ease-out;
			}

			.scene[data-skid='even'] .streak {
				animation: skid-b 700ms ease-out;
			}

			.scene[data-skid='odd'] .swatch {
				animation: refuse-a 420ms ease-in-out;
			}

			.scene[data-skid='even'] .swatch {
				animation: refuse-b 420ms ease-in-out;
			}

			@keyframes skid-a {
				0% {
					opacity: 0.8;
					stroke-dashoffset: 220;
				}

				60% {
					opacity: 0.6;
					stroke-dashoffset: 0;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: -220;
				}
			}

			@keyframes skid-b {
				0% {
					opacity: 0.8;
					stroke-dashoffset: 220;
				}

				60% {
					opacity: 0.6;
					stroke-dashoffset: 0;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: -220;
				}
			}

			@keyframes refuse-a {
				25% {
					transform: translateX(-6px) rotate(-1.5deg);
				}

				55% {
					transform: translateX(5px) rotate(1deg);
				}
			}

			@keyframes refuse-b {
				25% {
					transform: translateX(-6px) rotate(-1.5deg);
				}

				55% {
					transform: translateX(5px) rotate(1deg);
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
