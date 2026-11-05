// One key, the event card it drops, and the open hand that is your handler: press the key (or type on your own keyboard) and the browser's event lands in the hand.
import { computed, state } from '@markless/core';
import { capOf, cardText, describeKey, flip } from './keycard-model.ts';
import { art } from './keycard.art.ts';

export default function KeycardAnatomy() @{
	let key = state('a');
	let beat = state('rest');
	const cap = computed(() => capOf(key));
	const text = computed(() => cardText(key));
	const said = computed(() => (beat === 'rest' ? '' : describeKey(key)));

	<figure class="anatomy keycard">
		<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="A key, an event card and a hand">
			<g class="hand">
				<path class="hand-paper" d={art.hand.paper} />
				<path class="hatch" d={art.hand.shade} />
				<path class="ink" d={art.hand.ink} />
			</g>

			<g class="card">
				<path class="card-paper" d={art.card.paper} />
				<path class="wash" d={art.card.wash} />
				<path class="ink" d={art.card.ink} />
				<text class="card-head" x="14" y="20">event</text>
				<text class="card-text" x="14" y="56">{text}</text>
			</g>

			<g
				class="key"
				tabindex="0"
				role="button"
				aria-label="Press the key, or type any key while it is focused"
				onPointerDown={() => {
					key = 'a';
					beat = flip(beat);
				}}
				onKeyDown={(event) => {
					if (event.key === 'Tab') return;
					event.preventDefault();
					key = event.key;
					beat = flip(beat);
				}}
			>
				<path class="key-base" d={art.key.base} />
				<path class="hatch" d={art.key.baseHatch} />
				<path class="key-cap" d={art.key.cap} />
				<path class="ink" d={art.key.ink} />
				<text class="key-letter" x={art.key.letterX} y={art.key.letterY}>{cap}</text>
			</g>
		</svg>
		<figcaption class="sr">
			An ink drawing of one keyboard key, an empty open hand, and nothing between them. Press the key, or focus it and type any key on
			your own keyboard: the key sinks, and a card labelled event slides out to land in the hand, reading which key it was. With no press,
			no card arrives.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.keycard {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 22%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
				}
			}

			.key,
			.hand {
				transform-box: fill-box;
				transform-origin: 50% 100%;
				transition: transform 160ms cubic-bezier(0.3, 0.7, 0.4, 1);
				outline: none;
			}

			.key {
				cursor: pointer;
			}

			.key:hover,
			.key:focus-visible {
				transform: translateY(-4px) rotate(-1deg);
			}

			.key:focus-visible .key-cap {
				stroke: var(--ink);
				stroke-dasharray: 4 4;
				stroke-width: 1.5;
			}

			.hand:hover {
				transform: rotate(-2deg) translateY(-2px);
			}

			.key-base {
				fill: color-mix(in oklch, var(--ink) 35%, var(--paper));
			}

			.key-cap,
			.card-paper,
			.hand-paper {
				fill: var(--sheet);
			}

			.ink {
				fill: var(--ink);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;
			}

			.wash {
				fill: var(--yellow);
				opacity: 0.7;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.35;
				}
			}

			.key-letter,
			.card-head,
			.card-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.key-letter,
			.card-head,
			.card-text {
				html.dark & {
					fill: var(--paper);
				}
			}

			.key-letter {
				font-size: 54px;
				font-weight: 800;
				text-anchor: middle;
			}

			.card-head {
				font-size: 13px;
				font-weight: 700;
				opacity: 0.7;
			}

			.card-text {
				font-family: ui-monospace, 'SFMono-Regular', monospace;
				font-size: 19px;
				font-weight: 700;
			}

			.card {
				opacity: 0;
				transform: translate(448px, 104px) rotate(-3deg);
			}

			.scene[data-beat='odd'] .card {
				animation: drop-a 760ms cubic-bezier(0.3, 0.7, 0.3, 1) both;
			}

			.scene[data-beat='even'] .card {
				animation: drop-b 760ms cubic-bezier(0.3, 0.7, 0.3, 1) both;
			}

			.scene[data-beat='odd'] .key {
				animation: sink-a 300ms ease-out;
			}

			.scene[data-beat='even'] .key {
				animation: sink-b 300ms ease-out;
			}

			@keyframes drop-a {
				0% {
					opacity: 0;
					transform: translate(44px, 150px) rotate(4deg) scale(0.8);
				}

				25% {
					opacity: 1;
				}

				55% {
					transform: translate(260px, 40px) rotate(-6deg);
				}

				100% {
					opacity: 1;
					transform: translate(448px, 104px) rotate(-3deg);
				}
			}

			@keyframes drop-b {
				0% {
					opacity: 0;
					transform: translate(44px, 150px) rotate(4deg) scale(0.8);
				}

				25% {
					opacity: 1;
				}

				55% {
					transform: translate(260px, 40px) rotate(-6deg);
				}

				100% {
					opacity: 1;
					transform: translate(448px, 104px) rotate(-3deg);
				}
			}

			@keyframes sink-a {
				40% {
					transform: translateY(6px);
				}
			}

			@keyframes sink-b {
				40% {
					transform: translateY(6px);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}

				.scene:not([data-beat='rest']) .card {
					opacity: 1;
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
