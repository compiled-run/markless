// A Beanshop takeaway cup: the barista writes the name when it scrolls into view; pressing it ticks a shot box and the lid sticker follows.
import { computed, state } from '@markless/core';
import { add, describe, flip, PRODUCT, SHOTS, SLOTS, START, STICKER } from './model.ts';
import { art } from './wired.art.ts';

export default function IntroAnatomy() @{
	let count = state(START);
	let newest = state('');
	let beat = state('rest');
	const level = computed(() => '--count:' + count);
	const latest = computed(() => art.shots.boxes[Math.max(0, count - 1)]!);
	const tick = computed(() => latest.d);
	const tickLength = computed(() => '--l:' + latest.length);
	const said = computed(() => describe(count, beat !== 'rest'));

	<figure class="anatomy">
		<button
			type="button"
			class="stage"
			aria-label="Add a shot"
			onClick={() => {
				newest = String(count);
				count = add(count);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					count = 0;
					newest = '';
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} data-empty={count === 0 ? 'yes' : 'no'} style={level} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="shadow-wash" d={art.cup.shadow.wash} />
				<path class="hatch deep light" d={art.cup.shadow.hatch} />
				<path class="hatch deep" d={art.cup.shadow.core} />
				<path class="hatch deep" d={art.cup.shadow.foot} />

				<g class="cup">
					<path class="jar-ink thin" d={art.cup.backInk} />
					<path class="kraft" d={art.cup.body.paper} />
					<path class="hatch light" d={art.cup.body.tone} />
					<path class="hatch light" d={art.cup.body.cross} />
					<path class="jar-ink thin" d={art.cup.body.seam} />
					<path class="sleeve" d={art.cup.sleeve.paper} />
					<path class="wash pink" d={art.cup.sleeve.paper} />
					<path class="hatch light" d={art.cup.sleeve.tone} />
					<path class="hatch" d={art.cup.body.under} />
					<path class="jar-ink" d={art.cup.sleeve.ink} />
					<path class="jar-ink" d={art.cup.body.ink} />
					<g class="name">
						@for (const glyph of art.name.marcus; key glyph.key) {
							<text class="marker old-name write" transform={glyph.m} style={'--d:' + glyph.delay + 'ms'}>{glyph.ch}</text>
						}
						@for (const line of art.name.doodle; key line.key) {
							<path class="marker-line draw" d={line.d} style={'--l:' + line.length + ';--d:' + line.delay + 'ms'} />
						}
						<path class="marker-ink eyes" d={art.name.eyes} />
						<path class="marker-line draw thick" d={art.name.strike.d} style={'--l:' + art.name.strike.length + ';--d:' + art.name.strike.delay + 'ms'} />
						@for (const glyph of art.name.markless; key glyph.key) {
							<text class="marker write" transform={glyph.m} style={'--d:' + glyph.delay + 'ms'}>{glyph.ch}</text>
						}
					</g>
					<g class="shots">
						@for (const glyph of art.shots.label; key glyph.key) {
							<text class="printed" transform={glyph.m}>{glyph.ch}</text>
						}
						<path class="jar-ink thin" d={art.shots.rule} />
						@for (const box of art.shots.boxes; key box.key) {
							<path class="jar-ink" d={box.ink} />
							<path class="tick" d={box.d} style={'--i:' + box.key} />
						}
					</g>
					<path class="tick ticking" d={tick} style={tickLength} />
					<path class="lid-paper" d={art.cup.rim.paper} />
					<path class="jar-ink" d={art.cup.rim.ink} />
					<path class="lid-paper" d={art.cup.lid.paper} />
					<path class="hatch" d={art.cup.lid.hatch} />
					<path class="sip" d={art.cup.lid.sip} />
					<path class="jar-ink" d={art.cup.lid.ink} />

					<path class="shadow-wash light" d={art.sticker.cast} />
					<path class="sticker-paper" d={art.sticker.paper} />
					<path class="jar-ink thin" d={art.sticker.ink} />
					<g class="once" transform={art.sticker.matrix}>
						<text class="sticker-text" x="3" y={STICKER.product}>{PRODUCT}</text>
					</g>
					<path class="jar-ink thin" d={art.sticker.rule} />
					<g class="spot">
						<path class="wash yellow" d={art.sticker.spot.wash} />
						<path class="wash yellow pool" d={art.sticker.spot.pool} />
						<path class="wash-edge" d={art.sticker.spot.edge} />
					</g>
					<g transform={art.sticker.matrix}>
						<text class="sticker-text" x="3" y={STICKER.shots}>{SHOTS}</text>
						<g transform={'translate(0 ' + STICKER.shots + ')'}>
							<g class="crossed newest" data-mark={newest === '' ? 'none' : 'new'} style={'--step:' + (SLOTS[1] - SLOTS[0]) + 'px'}>
								<text class="digit old" x={SLOTS[0]}>{newest}</text>
								<path class="strike" d={art.sticker.strike.d} style={'--l:' + art.sticker.strike.length} />
							</g>
							<text class="digit now" x={SLOTS[1]}>{count}</text>
						</g>
					</g>
				</g>

				<g class="steam">
					@for (const wisp of art.steam; key wisp.key) {
						<path class="jar-ink wisp" d={wisp.d} style={'--w:' + wisp.key} />
					}
				</g>
				<path class="pencil" d={art.cup.pencil} />
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a Beanshop takeaway coffee cup on a desk, steam rising from its lid. The barista wrote Marcus on it in
			marker, with a little doodle of his face, crossed it out, and wrote Markless underneath. The pink sleeve has a printed row of
			shot boxes, one ticked per shot. A printed sticker on the lid says {PRODUCT} and
			{SHOTS} with the number in a yellow wash. Press the cup, or Enter or Space, to add a shot: the next box is ticked and the
			sticker's number is crossed out and printed again. Escape starts a fresh cup.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
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
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);
				--kraft: color-mix(in oklch, var(--paper) 48%, oklch(80% 0.07 70));
				--kraft-deep: color-mix(in oklch, var(--paper) 35%, oklch(68% 0.08 62));
				--label-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
					--kraft: oklch(42% 0.05 62);
					--kraft-deep: oklch(34% 0.05 58);
					--label-ink: var(--paper);
				}
			}

			.sticker-paper {
				fill: var(--sheet);
			}

			.jar-ink,
			.marker-ink {
				fill: var(--ink);
			}

			.thin {
				opacity: 0.7;
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

			.lid-paper {
				fill: var(--paper);
			}

			.kraft {
				fill: var(--kraft);
			}

			.sleeve {
				fill: var(--kraft-deep);
			}

			.sip {
				fill: var(--ink);
				opacity: 0.8;
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
				opacity: 0.45;
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

			.marker,
			.printed,
			.sticker-text,
			.digit {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.marker {
				font-size: 11px;
				font-weight: 800;
			}

			.old-name {
				font-size: 9px;
			}

			.printed {
				font-size: 6px;
				font-weight: 600;
				opacity: 0.85;
			}

			.sticker-text {
				font-size: 5px;
				font-weight: 700;
				letter-spacing: 0.02em;
			}

			.digit {
				font-size: 8.5px;
				font-weight: 800;
			}

			.old {
				font-size: 5.5px;
				font-weight: 600;
				opacity: 0.55;
			}

			.sticker-text,
			.digit {
				fill: var(--label-ink);
			}

			.marker-line {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.15;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.thick {
				stroke-width: 1.5;
			}

			.strike {
				fill: none;
				stroke: var(--label-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				stroke-dasharray: var(--l);
			}

			.tick {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.7;
				stroke-linecap: round;
				stroke-linejoin: round;
				opacity: clamp(0, calc(var(--count) - var(--i)), 1);
			}

			.ticking {
				opacity: 0;
				stroke-dasharray: var(--l);
			}

			.scene[data-empty='yes'] .ticking {
				display: none;
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
				--sink: sink-a;
				--draw: draw-a;
				--slide: slide-a;
				--strike: strike-a;
				--ink-in: ink-in-a;
				--wash-in: wash-in-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--draw: draw-b;
				--slide: slide-b;
				--strike: strike-b;
				--ink-in: ink-in-b;
				--wash-in: wash-in-b;
			}

			.cup {
				animation: var(--sink) 360ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.ticking {
				animation: var(--draw) 420ms 80ms ease-out both;
			}

			.scene[data-beat='odd'] .tick,
			.scene[data-beat='even'] .tick {
				transition: opacity 0s 500ms;
			}

			.newest .strike {
				animation: var(--strike) 240ms 620ms ease-out both;
			}

			.crossed {
				animation: var(--slide) 280ms 880ms cubic-bezier(0.3, 0.7, 0.4, 1) both;
			}

			.crossed[data-mark='none'] {
				display: none;
			}

			.now {
				stroke: var(--label-ink);
				stroke-width: 0.2;
				stroke-dasharray: 30;
				animation: var(--ink-in) 520ms 900ms ease-out both;
			}

			.spot {
				animation: var(--wash-in) 480ms 1000ms ease-out both;
			}

			.write {
				stroke: var(--ink);
				stroke-width: 0.25;
				stroke-dasharray: 40;
			}

			.draw {
				stroke-dasharray: var(--l);
			}

			@media (prefers-reduced-motion: no-preference) {
				.wisp {
					animation: rise 4.8s calc(var(--w) * -1.6s) ease-in-out infinite;
				}
			}

			@keyframes rise {
				0%,
				100% {
					opacity: 0.25;
					transform: translateY(2px);
				}

				50% {
					opacity: 0.75;
					transform: translateY(-4px);
				}
			}

			@keyframes sink-a {
				35% {
					transform: translateY(1.5px);
				}
			}

			@keyframes sink-b {
				35% {
					transform: translateY(1.5px);
				}
			}

			@keyframes draw-a {
				from {
					opacity: 1;
					stroke-dashoffset: var(--l);
				}

				99% {
					opacity: 1;
					stroke-dashoffset: 0;
				}

				to {
					opacity: 0;
				}
			}

			@keyframes draw-b {
				from {
					opacity: 1;
					stroke-dashoffset: var(--l);
				}

				99% {
					opacity: 1;
					stroke-dashoffset: 0;
				}

				to {
					opacity: 0;
				}
			}

			@keyframes slide-a {
				from {
					transform: translateX(var(--step));
				}
			}

			@keyframes slide-b {
				from {
					transform: translateX(var(--step));
				}
			}

			@keyframes strike-a {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes strike-b {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes ink-in-a {
				from {
					stroke-dashoffset: 30;
					fill-opacity: 0;
				}

				55% {
					fill-opacity: 0;
				}

				to {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes ink-in-b {
				from {
					stroke-dashoffset: 30;
					fill-opacity: 0;
				}

				55% {
					fill-opacity: 0;
				}

				to {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes wash-in-a {
				from {
					opacity: 0;
				}
			}

			@keyframes wash-in-b {
				from {
					opacity: 0;
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
