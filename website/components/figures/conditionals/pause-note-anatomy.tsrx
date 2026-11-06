// A paused video with a note field under it: press play and the field leaves the page with what you typed; pause again and a fresh, empty one is built.
// The field is a plain input with no state behind it, so what it holds lives in the element alone and goes when the element goes.
import { state } from '@markless/core';
import { describeNote } from './player-model.ts';
import { art } from './player.art.ts';

export default function PauseNoteAnatomy() @{
	let playing = state(false);
	let hint = state('');
	let said = state('');
	let lastNote = state('');

	<figure
		class="anatomy pause-note"
		onKeyDown={(event) => {
			if (event.key !== 'Escape' || !playing) return;
			playing = false;
			said = describeNote('fresh', '');
		}}
	>
		<div class="scene">
			<svg class="player" viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="A video player, paused, with a note field under it">
				<g
					class="screen"
					onPointerEnter={() => {
						hint = '@if (!playing)';
					}}
					onPointerLeave={() => {
						hint = '';
					}}
				>
					<path class="shadow" d={art.screen.shadow} />
					<path class="hatch" d={art.screen.shadowHatch} />
					<path class="paper" d={art.screen.paper} />
					<path class="hatch light" d={art.screen.sceneHatch} />
					<path class="ink" d={art.screen.scene} />
					<path class="ink" d={art.screen.ink} />
					<path class="ink track" d={art.bar.track} />
					<path class="ink faint" d={art.bar.ticks} />
					<g class="knob">
						<path class="paper" d={art.bar.knob.face} />
						<path class="hatch" d={art.bar.knob.shade} />
						<path class="ink" d={art.bar.knob.ink} />
					</g>
					@if (playing) {
						<g class="card">
							<path class="card-paper" d={art.cards.playing.paper} />
							<path class="wash" d={art.cards.playing.wash} />
							<path class="ink" d={art.cards.playing.ink} />
							<path class="ink" d={art.cards.playing.mark} />
							<text class="word" x={art.cards.playing.textX} y={art.cards.playing.textY}>playing</text>
						</g>
					} @else {
						<g class="card">
							<path class="card-paper" d={art.cards.paused.paper} />
							<path class="wash" d={art.cards.paused.wash} />
							<path class="ink" d={art.cards.paused.ink} />
							<path class="ink" d={art.cards.paused.mark} />
							<text class="word" x={art.cards.paused.textX} y={art.cards.paused.textY}>paused</text>
						</g>
					}
				</g>
				<g
					class="play"
					tabindex="0"
					role="button"
					aria-pressed={playing ? 'true' : 'false'}
					aria-label="Play or pause"
					onClick={() => {
						playing = !playing;
						said = playing ? describeNote('gone', lastNote) : describeNote('fresh', '');
						lastNote = '';
					}}
					onKeyDown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						playing = !playing;
						said = playing ? describeNote('gone', lastNote) : describeNote('fresh', '');
						lastNote = '';
					}}
					onPointerEnter={() => {
						hint = 'playing = !playing';
					}}
					onPointerLeave={() => {
						hint = '';
					}}
				>
					<path class="button-wash" d={art.bar.button.wash} />
					<path class="paper" d={art.bar.button.face} />
					<path class="ink" d={art.bar.button.ink} />
					<path class={playing ? 'ink glyph gone' : 'ink glyph'} d={art.bar.button.play} />
					<path class={playing ? 'ink glyph' : 'ink glyph gone'} d={art.bar.button.pause} />
				</g>
			</svg>
			@if (!playing) {
				<div
					class="field"
					onPointerEnter={() => {
						hint = 'inside @if (!playing)';
					}}
					onPointerLeave={() => {
						hint = '';
					}}
				>
					<svg class="field-art" viewBox={art.field.x + ' ' + art.field.y + ' ' + art.field.w + ' ' + art.field.h} aria-hidden="true">
						<path class="shadow" d={art.field.shadow} />
						<path class="field-paper" d={art.field.paper} />
						<path class="wash" d={art.field.wash} />
						<path class="ink" d={art.field.ink} />
					</svg>
					<span class="caret" aria-hidden="true">|</span>
					<input
						class="note-input"
						type="text"
						placeholder="Type a note"
						aria-label="Note"
						maxlength="24"
						onInput={(event) => {
							lastNote = event.currentTarget.value;
						}}
					/>
				</div>
			}
		</div>
		<p class="under" aria-hidden="true">{hint}</p>
		<figcaption class="sr">
			An ink drawing of a video player, paused, with a note field drawn under the frame. Type a note in the field. Press the play button,
			or Enter on it: the field leaves the page with what you typed, and the card on the screen reads playing. Press again: the video pauses
			and a fresh, empty note field is built.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.pause-note {
				margin: var(--space-m) 0;
			}

			.scene {
				position: relative;
				width: 100%;
				aspect-ratio: 680 / 330;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);

				html.dark & {
					--shade: rgb(0 0 0 / 0.5);
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
				}
			}

			.player {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.screen {
				transform-box: fill-box;
				transform-origin: 50% 50%;
				transition: transform 200ms ease;
			}

			.screen:hover {
				transform: rotate(-0.4deg);
			}

			.card {
				transform-box: fill-box;
				transform-origin: 50% 50%;
				animation: build 320ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.play {
				cursor: pointer;
				outline: none;
				transform-box: fill-box;
				transform-origin: 50% 50%;
				transition: transform 160ms ease, filter 160ms ease;
			}

			.play:hover,
			.play:focus-visible {
				transform: translateY(-2px) scale(1.06);
				filter: drop-shadow(2px 4px 0 var(--shade));
			}

			.play:focus-visible .paper {
				stroke: var(--ink);
				stroke-dasharray: 4 4;
				stroke-width: 1.5;
			}

			.play:active {
				transform: translateY(1px) scale(0.98);
			}

			.glyph {
				transition: opacity 120ms ease;
			}

			.gone {
				opacity: 0;
			}

			.field {
				position: absolute;
				left: 10.29%;
				top: 81.8%;
				width: 79.41%;
				height: 13.33%;
				animation: build 360ms cubic-bezier(0.3, 0.7, 0.4, 1);
				transition: transform 160ms ease;
			}

			.field:hover,
			.field:focus-within {
				transform: translateY(-2px);
			}

			.scene:has(.play:hover) .field:has(.note-input:not(:placeholder-shown)) {
				animation: shiver 360ms ease-in-out infinite;
			}

			.field-art {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.caret {
				position: absolute;
				left: 3%;
				top: 50%;
				transform: translateY(-54%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: clamp(1rem, 2.8cqi, 1.45rem);
				font-weight: 700;
				color: var(--ink);
				animation: blink 1s steps(1) infinite;
				pointer-events: none;

				html.dark & {
					color: var(--paper);
				}
			}

			.field:focus-within .caret,
			.field:has(.note-input:not(:placeholder-shown)) .caret {
				opacity: 0;
				animation: none;
			}

			.note-input {
				position: absolute;
				inset: 8% 14% 8% 3%;
				width: auto;
				border: 0;
				background: none;
				padding: 0 0 0 0.6em;
				cursor: text;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: clamp(0.95rem, 2.6cqi, 1.35rem);
				font-weight: 700;
				color: var(--ink);
				caret-color: var(--ink);
				outline: none;

				html.dark & {
					color: var(--paper);
					caret-color: var(--paper);
				}
			}

			.note-input::placeholder {
				color: var(--ink);
				opacity: 0.45;
				font-style: italic;
				font-weight: 500;

				html.dark & {
					color: var(--paper);
					opacity: 0.65;
				}
			}

			.field:focus-within .field-paper {
				stroke: var(--ink);
				stroke-dasharray: 5 5;
				stroke-width: 1.5;

				html.dark & {
					stroke: var(--paper);
				}
			}

			.under {
				min-height: 1.6em;
				margin: 0.3rem 0 0;
				text-align: center;
				font-family: var(--font-mono, ui-monospace, monospace);
				font-size: 0.85rem;
				color: var(--ink);
				opacity: 0.7;
			}

			.shadow {
				fill: var(--shade);
			}

			.paper {
				fill: var(--sheet);
			}

			.card-paper {
				fill: color-mix(in oklch, var(--yellow) 40%, var(--sheet));
			}

			.field-paper {
				fill: color-mix(in oklch, var(--yellow) 55%, var(--sheet));
			}

			.wash {
				fill: var(--yellow);
				opacity: 0.55;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.3;
				}
			}

			.button-wash {
				fill: var(--pink);
				opacity: 0.45;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.35;
				}
			}

			.ink {
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			.faint {
				opacity: 0.5;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					stroke: var(--paper);
				}
			}

			.light {
				opacity: 0.3;
			}

			.word {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 24px;
				font-weight: 700;
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			@keyframes build {
				from {
					opacity: 0;
					transform: scale(0.94);
				}
			}

			@keyframes blink {
				50% {
					opacity: 0;
				}
			}

			@keyframes shiver {
				25% {
					transform: translate(-1.5px, -2px) rotate(-0.6deg);
				}

				75% {
					transform: translate(1.5px, -2px) rotate(0.6deg);
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
