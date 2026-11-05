// A thermometer, its °F tag and an advice sign: drag the mercury and °F re-inks every degree, but the sign flips only when °F crosses 50.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import { adviceOf, clampC, describeChain, dial, fahrenheitOf, flip, mercuryTop, RANGE, REFUSED, START } from './thermometer-model.ts';
import { art } from './thermometer.art.ts';

export default function ThermometerAnatomy() @{
	let celsius = state<number>(START);
	let dragging = state(false);
	let fromY = state(0);
	let fromValue = state(0);
	let beat = state('rest');
	let swing = state('rest');
	let shake = state('rest');
	let said = state('');
	const fahrenheit = computed(() => fahrenheitOf(celsius));
	const advice = computed(() => adviceOf(fahrenheit));
	const top = computed(() => mercuryTop(celsius));
	const height = computed(() => art.thermometer.columnBottom - top);
	function setTo(next: number) {
		if (next === celsius) return;
		const flipped = adviceOf(fahrenheitOf(next)) !== advice;
		celsius = next;
		beat = flip(beat);
		if (flipped) swing = flip(swing);
		said = describeChain(next, flipped);
	}
	function refuse() {
		shake = flip(shake);
		said = REFUSED;
	}

	<figure class="anatomy thermometer">
		<svg class="scene" data-beat={beat} data-swing={swing} data-shake={shake} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="a thermometer, a °F tag worked out from it, and a sign worked out from the tag">
			<g
				class={dragging ? 'glass held' : 'glass'}
				tabindex="0"
				role="slider"
				aria-label="°C"
				aria-valuenow={celsius}
				aria-valuemin={RANGE.min}
				aria-valuemax={RANGE.max}
				onPointerDown={(event) => {
					capture(event);
					dragging = true;
					fromY = event.clientY;
					fromValue = celsius;
				}}
				onPointerMove={(event) => {
					if (!dragging) return;
					setTo(dial(fromValue, fromY, event.clientY));
				}}
				onPointerUp={() => {
					dragging = false;
				}}
				onTouchMove={(event) => event.preventDefault()}
				onWheel={(event) => {
					event.preventDefault();
					setTo(clampC(celsius + (event.deltaY < 0 ? 1 : -1)));
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
						event.preventDefault();
						setTo(clampC(celsius + 1));
					} else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
						event.preventDefault();
						setTo(clampC(celsius - 1));
					}
				}}
			>
				<rect class="grab" x="60" y="10" width="110" height="285" />
				<path class="shadow" d={art.thermometer.shadow} />
				<path class="hatch" d={art.thermometer.shadowHatch} />
				<path class="tube" d={art.thermometer.glass} />
				<path class="mercury" d={art.thermometer.bulbFill} />
				<rect class="mercury column" x={art.thermometer.columnX} y={top} width={art.thermometer.columnW} height={height} rx="5" />
				<path class="ink" d={art.thermometer.ink} />
				<path class="gleam" d={art.thermometer.gleam} />
				<path class="ink desk" d={art.thermometer.ticks} />
				<text class="tick" x={art.thermometer.labelX} y={art.thermometer.labels[0].y}>{art.thermometer.labels[0].text}</text>
				<text class="tick" x={art.thermometer.labelX} y={art.thermometer.labels[1].y}>{art.thermometer.labels[1].text}</text>
				<text class="tick" x={art.thermometer.labelX} y={art.thermometer.labels[2].y}>{art.thermometer.labels[2].text}</text>
				<text class="tick" x={art.thermometer.labelX} y={art.thermometer.labels[3].y}>{art.thermometer.labels[3].text}</text>
				<text class="tick" x={art.thermometer.labelX} y={art.thermometer.labels[4].y}>{art.thermometer.labels[4].text}</text>
				<text class="reading" x="156" y={top + 6}>{celsius}°C</text>
			</g>
			<path class="ink desk" d={art.tag.string} />
			<g class="tag" tabindex="0" role="img" aria-label={fahrenheit + '°F, worked out from °C'} onPointerDown={refuse} onKeyDown={(event) => {
				if (event.key === ' ' || event.key === 'Enter') {
					event.preventDefault();
					refuse();
				}
			}}>
				<path class="shadow" d={art.tag.shadow} />
				<path class="hatch" d={art.tag.shadowHatch} />
				<path class="card" d={art.tag.card} />
				<path class="ink" d={art.tag.ink} />
				<text class="value" x={art.tag.textX} y={art.tag.textY}>{fahrenheit}°F</text>
			</g>
			<path class="ink desk" d={art.sign.hook} />
			<g class="sign" tabindex="0" role="img" aria-label={'sign: ' + advice + ', worked out from °F'} onPointerDown={refuse} onKeyDown={(event) => {
				if (event.key === ' ' || event.key === 'Enter') {
					event.preventDefault();
					refuse();
				}
			}}>
				<path class="ink desk" d={art.sign.strings} />
				<path class="shadow" d={art.sign.shadow} />
				<path class="hatch" d={art.sign.shadowHatch} />
				<path class="board" d={art.sign.board} />
				<path class="hatch grain" d={art.sign.grain} />
				<path class="ink" d={art.sign.ink} />
				<text class="value advice" x={art.sign.textX} y={art.sign.textY}>{advice}</text>
			</g>
		</svg>
		<figcaption class="sr">
			An ink drawing of a glass thermometer, a paper tag tied to it showing the temperature in °F, and a wooden sign on a hook that says
			whether to bring a coat. Drag the mercury up or down, scroll on it, or focus it and use the arrow keys: the °F tag re-inks every
			degree, and the sign flips only when °F crosses 50.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.thermometer {
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
				--wood: color-mix(in oklch, var(--paper) 70%, oklch(72% 0.07 65));
				--glass: color-mix(in oklch, var(--paper) 85%, oklch(90% 0.03 220));
				--hot: oklch(58% 0.2 27);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
					--wood: color-mix(in oklch, var(--ink) 75%, oklch(55% 0.07 65));
					--glass: color-mix(in oklch, var(--ink) 85%, oklch(60% 0.03 220));
				}
			}

			.glass {
				touch-action: none;
				cursor: ns-resize;
				outline: none;
			}

			.grab {
				fill: transparent;
			}

			.glass:focus-visible .tube,
			.glass:hover .tube {
				stroke: var(--ink);
				stroke-width: 1;
				stroke-dasharray: 4 4;
			}

			.tube {
				fill: var(--glass);
			}

			.mercury {
				fill: var(--hot);
			}

			.column {
				transition: y 140ms ease, height 140ms ease;
			}

			.held .column {
				transition: none;
			}

			.gleam {
				fill: var(--paper);
				opacity: 0.7;
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

			.ink {
				fill: var(--ink);

				html.dark &:not(.desk) {
					fill: var(--paper);
				}
			}

			.card {
				fill: var(--sheet);
			}

			.board {
				fill: var(--wood);
			}

			.tag,
			.sign {
				cursor: not-allowed;
				outline: none;
				transform-box: fill-box;
			}

			.tag {
				transform-origin: 10% 50%;
			}

			.sign {
				transform-origin: 50% 0%;
			}

			.tag:focus-visible .card,
			.sign:focus-visible .board {
				stroke: var(--ink);
				stroke-dasharray: 5 5;
				stroke-width: 1.5;
			}

			.tick,
			.reading,
			.value {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.tick {
				font-size: 16px;
				text-anchor: end;
			}

			.reading {
				font-size: 18px;
				font-weight: 700;
				transition: y 140ms ease;
			}

			.value {
				font-size: 30px;
				font-weight: 800;
				text-anchor: middle;
				font-variant-numeric: tabular-nums;
			}

			.advice {
				font-size: 24px;
			}

			.value {
				html.dark & {
					fill: var(--paper);
				}
			}

			.scene[data-beat='odd'] .tag .value {
				animation: reink-a 480ms ease-out;
			}

			.scene[data-beat='even'] .tag .value {
				animation: reink-b 480ms ease-out;
			}

			.scene[data-swing='odd'] .sign {
				animation: swing-a 900ms ease-out;
			}

			.scene[data-swing='even'] .sign {
				animation: swing-b 900ms ease-out;
			}

			.scene[data-shake='odd'] :is(.tag, .sign) {
				animation: refuse-a 420ms ease-in-out;
			}

			.scene[data-shake='even'] :is(.tag, .sign) {
				animation: refuse-b 420ms ease-in-out;
			}

			@keyframes reink-a {
				0% {
					opacity: 0.2;
				}
			}

			@keyframes reink-b {
				0% {
					opacity: 0.2;
				}
			}

			@keyframes swing-a {
				20% {
					transform: rotate(8deg);
				}

				45% {
					transform: rotate(-5deg);
				}

				70% {
					transform: rotate(2deg);
				}
			}

			@keyframes swing-b {
				20% {
					transform: rotate(-8deg);
				}

				45% {
					transform: rotate(5deg);
				}

				70% {
					transform: rotate(-2deg);
				}
			}

			@keyframes refuse-a {
				25% {
					transform: translateX(-6px);
				}

				55% {
					transform: translateX(5px);
				}
			}

			@keyframes refuse-b {
				25% {
					transform: translateX(-6px);
				}

				55% {
					transform: translateX(5px);
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
