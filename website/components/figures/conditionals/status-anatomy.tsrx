// A video player whose screen shows one status card at a time: press play, or drag the knob along the timeline, and the @switch swaps the card.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import { caseOf, describeStatus, formatSeconds, LENGTH, scrubTo, statusOf, stepSeconds } from './player-model.ts';
import { art } from './player.art.ts';

export default function StatusAnatomy() @{
	let started = state(false);
	let playing = state(false);
	let seconds = state(0);
	let dragging = state(false);
	let fromX = state(0);
	let fromSeconds = state(0);
	let scale = state(1);
	let hint = state('');
	let said = state('');
	const status = computed(() => statusOf(started, playing, seconds));
	const knobPlace = computed(() => 'transform: translateX(' + (seconds / LENGTH) * art.bar.length + 'px)');
	const playedPlace = computed(() => 'transform: scaleX(' + (seconds / LENGTH) * art.bar.length + ')');
	const next = computed(() => (!started || status === 'ended' || !playing ? 'playing' : 'paused'));

	<figure
		class="anatomy status-card"
		onKeyDown={(event) => {
			if (event.key !== 'Escape' || !started) return;
			started = false;
			playing = false;
			seconds = 0;
			said = 'Back to the start: the card reads loading.';
		}}
	>
		<svg class="scene" viewBox={'0 0 ' + art.width + ' ' + art.screenHeight} role="group" aria-label="A video player whose screen shows one status card">
			<g class="screen">
				<path class="shadow" d={art.screen.shadow} />
				<path class="hatch" d={art.screen.shadowHatch} />
				<path class="paper" d={art.screen.paper} />
				<path class="hatch light" d={art.screen.sceneHatch} />
				<path class="ink" d={art.screen.scene} />
				<path class="ink" d={art.screen.ink} />
			</g>
			<g
				class="cards"
				onPointerEnter={() => {
					hint = caseOf(status);
				}}
				onPointerLeave={() => {
					hint = '';
				}}
			>
				@switch (status) {
					@case 'loading': {
						<g class="card">
							<path class="card-paper" d={art.cards.loading.paper} />
							<path class="wash" d={art.cards.loading.wash} />
							<path class="ink" d={art.cards.loading.ink} />
							<path class="ink spin" d={art.cards.loading.mark} />
							<text class="word" x={art.cards.loading.textX} y={art.cards.loading.textY}>loading</text>
						</g>
					}
					@case 'playing': {
						<g class="card">
							<path class="card-paper" d={art.cards.playing.paper} />
							<path class="wash" d={art.cards.playing.wash} />
							<path class="ink" d={art.cards.playing.ink} />
							<path class="ink" d={art.cards.playing.mark} />
							<text class="word" x={art.cards.playing.textX} y={art.cards.playing.textY}>playing</text>
						</g>
					}
					@case 'ended': {
						<g class="card">
							<path class="card-paper" d={art.cards.ended.paper} />
							<path class="wash" d={art.cards.ended.wash} />
							<path class="ink" d={art.cards.ended.ink} />
							<path class="ink" d={art.cards.ended.mark} />
							<text class="word" x={art.cards.ended.textX} y={art.cards.ended.textY}>ended</text>
						</g>
					}
					@default: {
						<g class="card">
							<path class="card-paper" d={art.cards.paused.paper} />
							<path class="wash" d={art.cards.paused.wash} />
							<path class="ink" d={art.cards.paused.ink} />
							<path class="ink" d={art.cards.paused.mark} />
							<text class="word" x={art.cards.paused.textX} y={art.cards.paused.textY}>paused</text>
						</g>
					}
				}
			</g>
			<g class="bar">
				<path class="ink track" d={art.bar.track} />
				<path class="ink faint" d={art.bar.ticks} />
				<path class="played" style={playedPlace} d={art.bar.played} />
				<g
					class={dragging ? 'knob held' : 'knob'}
					style={knobPlace}
					tabindex="0"
					role="slider"
					aria-label="Position in the video"
					aria-valuemin="0"
					aria-valuemax={LENGTH}
					aria-valuenow={seconds}
					aria-valuetext={formatSeconds(seconds)}
					onPointerDown={(event) => {
						capture(event);
						scale = art.width / event.currentTarget.ownerSVGElement!.getBoundingClientRect().width;
						fromX = event.clientX;
						fromSeconds = seconds;
						dragging = true;
						started = true;
					}}
					onPointerMove={(event) => {
						if (!dragging) return;
						seconds = scrubTo(fromSeconds, (event.clientX - fromX) * scale, art.bar.length);
						hint = 'seconds = ' + seconds;
					}}
					onPointerUp={() => {
						if (!dragging) return;
						dragging = false;
						said = describeStatus(statusOf(true, playing, seconds), seconds);
					}}
					onPointerCancel={() => {
						dragging = false;
					}}
					onTouchMove={(event) => event.preventDefault()}
					onPointerEnter={() => {
						hint = 'seconds = ' + seconds;
					}}
					onPointerLeave={() => {
						if (!dragging) hint = '';
					}}
					onKeyDown={(event) => {
						if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'Home' || event.key === 'End') event.preventDefault();
						const to = stepSeconds(seconds, event.key);
						if (to === undefined) return;
						started = true;
						seconds = to;
						hint = 'seconds = ' + to;
						said = describeStatus(statusOf(true, playing, to), to);
					}}
				>
					<path class="paper" d={art.bar.knob.face} />
					<path class="hatch" d={art.bar.knob.shade} />
					<path class="ink" d={art.bar.knob.ink} />
				</g>
			</g>
			<g
				class="play"
				tabindex="0"
				role="button"
				aria-pressed={playing && status !== 'ended' ? 'true' : 'false'}
				aria-label="Play or pause"
				onClick={() => {
					const to = next;
					if (status === 'ended') seconds = 0;
					playing = to === 'playing';
					started = true;
					hint = "status = '" + to + "'";
					said = describeStatus(to, seconds);
				}}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					const to = next;
					if (status === 'ended') seconds = 0;
					playing = to === 'playing';
					started = true;
					said = describeStatus(to, seconds);
				}}
				onPointerEnter={() => {
					hint = "status = '" + next + "'";
				}}
				onPointerLeave={() => {
					hint = '';
				}}
			>
				<path class="button-wash" d={art.bar.button.wash} />
				<path class="paper" d={art.bar.button.face} />
				<path class="ink" d={art.bar.button.ink} />
				<path class={status === 'playing' ? 'ink glyph gone' : 'ink glyph'} d={art.bar.button.play} />
				<path class={status === 'playing' ? 'ink glyph' : 'ink glyph gone'} d={art.bar.button.pause} />
			</g>
		</svg>
		<p class="under" aria-hidden="true">{hint}</p>
		<figcaption class="sr">
			An ink drawing of a video player. A card in the middle of the screen reads loading, playing, paused or ended: one at a time. Press the
			play button, or Enter on it, to play and pause. Drag the knob along the timeline, or use the arrow keys on it, to move through the
			video; at the far end the card reads ended, and play starts it again from the beginning.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.status-card {
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

				html.dark & {
					--shade: rgb(0 0 0 / 0.5);
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
				}
			}

			.cards {
				cursor: help;
			}

			.card {
				transform-box: fill-box;
				transform-origin: 50% 50%;
				animation: build 320ms cubic-bezier(0.3, 0.7, 0.4, 1);
				transition: transform 160ms ease;
			}

			.cards:hover .card {
				transform: translateY(-2px) rotate(-0.8deg);
			}

			.spin {
				transform-box: fill-box;
				transform-origin: 50% 50%;
				animation: spin 1.6s linear infinite;
			}

			.knob {
				cursor: grab;
				outline: none;
				touch-action: none;
				transition: transform 120ms ease;
			}

			.knob:hover .paper,
			.knob:focus-visible .paper {
				filter: drop-shadow(0 2px 0 var(--shade));
			}

			.knob:focus-visible .paper {
				stroke: var(--ink);
				stroke-dasharray: 3 3;
				stroke-width: 1.5;
			}

			.held {
				cursor: grabbing;
				transition: none;
			}

			.played {
				fill: var(--yellow);
				transform-box: view-box;
				transform-origin: 150px 0;
				transition: transform 120ms ease;
			}

			.bar:has(.held) .played {
				transition: none;
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

			@keyframes spin {
				to {
					transform: rotate(360deg);
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
