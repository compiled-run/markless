// A slice of the guest list on a paper slip beside a phone showing what it does; `figure` picks values, steps or blocks.
import { computed, state } from '@markless/core';
import { flip, sketchOf, SKETCH_SAID, describeSketch } from './model.ts';
import { art } from './figures.art.ts';

export default function SketchAnatomy({ figure }: { readonly figure: string }) @{
	const which = sketchOf(figure);
	const pair = which === 'steps' ? art.steps : which === 'blocks' ? art.blocks : art.values;
	const lift = art.steps.lift;
	let beat = state('odd');
	let empty = state(false);
	let touched = state(false);
	const said = computed(() => describeSketch(which, empty, touched));

	<figure class="sketch">
		<button
			type="button"
			class="stage"
			aria-label={which === 'blocks' ? 'Press Clear on the sketched phone' : 'Play the sketch again'}
			onClick={() => {
				touched = true;
				if (which === 'blocks') empty = !empty;
				else beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					empty = false;
				}
			}}
		>
			<svg
				class="scene wide"
				data-beat={beat}
				data-empty={empty ? 'yes' : 'no'}
				viewBox={'0 0 ' + pair.wide.width + ' ' + pair.wide.height}
				style={'--code:' + pair.wide.size + 'px;--lift-x:' + lift.wide.x + 'px;--lift-y:' + lift.wide.y + 'px'}
				aria-hidden="true"
			>
				@for (const s of pair.wide.shapes; key s.key) {
					<path class={s.cls} d={s.d} />
				}
				@for (const s of pair.wide.strokes; key s.key) {
					<path class={s.cls} d={s.d} style={'--l:' + s.length + ';--at:' + s.at + 'ms'} />
				}
				@for (const t of pair.wide.texts; key t.key) {
					<text class={t.cls} x={t.x} y={t.y} style={t.style}>{t.text}</text>
				}
			</svg>
			<svg
				class="scene tall"
				data-beat={beat}
				data-empty={empty ? 'yes' : 'no'}
				viewBox={'0 0 ' + pair.tall.width + ' ' + pair.tall.height}
				style={'--code:' + pair.tall.size + 'px;--lift-x:' + lift.tall.x + 'px;--lift-y:' + lift.tall.y + 'px'}
				aria-hidden="true"
			>
				@for (const s of pair.tall.shapes; key s.key) {
					<path class={s.cls} d={s.d} />
				}
				@for (const s of pair.tall.strokes; key s.key) {
					<path class={s.cls} d={s.d} style={'--l:' + s.length + ';--at:' + s.at + 'ms'} />
				}
				@for (const t of pair.tall.texts; key t.key) {
					<text class={t.cls} x={t.x} y={t.y} style={t.style}>{t.text}</text>
				}
			</svg>
		</button>
		<figcaption class="sr">{SKETCH_SAID[which]} Press the drawing, or Enter or Space, to play it again.</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.sketch {
				margin: var(--space-m) 0;
				container: sketch / inline-size;
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
				--sheet: color-mix(in oklch, var(--paper) 45%, white);
				--body: color-mix(in oklch, var(--paper) 80%, var(--ink));
				--glass: color-mix(in oklch, var(--paper) 25%, white);

				html.dark & {
					--sheet: color-mix(in oklch, var(--paper) 88%, white);
					--body: color-mix(in oklch, var(--paper) 70%, var(--ink));
					--glass: color-mix(in oklch, var(--paper) 80%, white);
				}
			}

			.tall {
				display: none;
			}

			@container sketch (max-width: 560px) {
				.wide {
					display: none;
				}

				.tall {
					display: block;
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.body {
				fill: var(--body);
			}

			.screen {
				fill: var(--glass);
			}

			.shade {
				fill: color-mix(in oklch, var(--ink) 16%, transparent);
			}

			.ink {
				fill: var(--ink);
			}

			.hatch,
			.socket {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.55;
			}

			.socket {
				opacity: 0.35;
			}

			.host {
				fill: var(--yellow);
				opacity: 0.8;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.5;
				}
			}

			.code {
				font-family: 'Recursive', ui-monospace, monospace;
				font-variation-settings: 'MONO' 1, 'CASL' 0;
				font-size: var(--code);
				font-weight: 500;
				white-space: pre;
				fill: var(--ink);
			}

			.tint {
				fill: var(--c);

				html.dark & {
					fill: var(--cd);
				}
			}

			.ui {
				font-family: system-ui, sans-serif;
				font-size: 15px;
				fill: var(--ink);
			}

			.bold {
				font-weight: 700;
			}

			.mid {
				text-anchor: middle;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 16px;
				letter-spacing: 0.05em;
				fill: var(--ink);
			}

			.small {
				font-size: 14px;
			}

			.tiny {
				font-size: 10px;
				opacity: 0.7;
			}

			.tucked {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.8;
				stroke-dasharray: 3 4;
				opacity: 0.45;
			}

			.pen {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.4;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.guide {
				stroke-dasharray: 2 5;
				opacity: 0.5;
			}

			.pulse {
				fill: none;
				stroke: var(--pink);
				stroke-width: 9;
				stroke-linecap: round;
				stroke-dasharray: 0.1 100000;
				opacity: 0;
			}

			.scene[data-beat='odd'] {
				--draw: draw-a;
				--show: show-a;
				--run: run-a;
				--fly: fly-a;
			}

			.scene[data-beat='even'] {
				--draw: draw-b;
				--show: show-b;
				--run: run-b;
				--fly: fly-b;
			}

			.pen:not(.guide) {
				animation: var(--draw) 600ms var(--at) ease-out both;
			}

			.land,
			.shows {
				animation: var(--show) 400ms 1700ms ease-out both;
			}

			.pulse {
				animation: var(--run) 1600ms var(--at) ease-in-out both;
			}

			.lift {
				animation: var(--fly) 1200ms 1500ms ease-in-out both;
			}

			.row {
				transition: opacity 300ms ease-out;
			}

			.flap {
				transform-box: fill-box;
				transform-origin: 50% 0;
				transition: transform 450ms ease-in-out, opacity 450ms;
			}

			.open {
				transform: scaleY(0);
				opacity: 0;
			}

			.scene[data-empty='yes'] {
				.row {
					opacity: 0;
				}

				.open {
					transform: none;
					opacity: 1;
				}

				.shut {
					transform: scaleY(0);
					opacity: 0;
				}
			}

			@keyframes draw-a {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes draw-b {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes show-a {
				from {
					opacity: 0;
				}
			}

			@keyframes show-b {
				from {
					opacity: 0;
				}
			}

			@keyframes run-a {
				from {
					stroke-dashoffset: 0;
					opacity: 1;
				}

				95% {
					opacity: 1;
				}

				to {
					stroke-dashoffset: calc(var(--l) * -1);
					opacity: 0;
				}
			}

			@keyframes run-b {
				from {
					stroke-dashoffset: 0;
					opacity: 1;
				}

				95% {
					opacity: 1;
				}

				to {
					stroke-dashoffset: calc(var(--l) * -1);
					opacity: 0;
				}
			}

			@keyframes fly-a {
				from {
					transform: none;
					opacity: 1;
				}

				80% {
					opacity: 0.9;
				}

				to {
					transform: translate(var(--lift-x), var(--lift-y));
					opacity: 0;
				}
			}

			@keyframes fly-b {
				from {
					transform: none;
					opacity: 1;
				}

				80% {
					opacity: 0.9;
				}

				to {
					transform: translate(var(--lift-x), var(--lift-y));
					opacity: 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}

				.lift {
					opacity: 0;
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
