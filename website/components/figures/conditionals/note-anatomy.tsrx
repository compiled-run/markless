// A sheet, a sticky note and a bin: close the note (drag it to the bin, its ×, or Delete) and it is gone with what you wrote; click the sheet and a fresh blank note is built.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import { addLetter, BIN_REACH, describeNote, MAX_TEXT, WRITE_FIRST } from './note-model.ts';
import { art } from './note.art.ts';

export default function NoteAnatomy() @{
	let open = state(true);
	let text = state('');
	let binned = state(0);
	let dragX = state(0);
	let dragY = state(0);
	let fromX = state(0);
	let fromY = state(0);
	let scale = state(1);
	let dragging = state(false);
	let said = state('');
	let hinted = state(false);
	let hint = state(false);
	let focused = state(false);
	const place = computed(() => 'transform: translate(' + dragX + 'px, ' + dragY + 'px)');

	<figure class="anatomy sticky">
		<svg class="scene" viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="A sheet with a sticky note, and a waste bin">
			<g
				class="sheet"
				tabindex="0"
				role="button"
				aria-label="Open a note"
				onClick={() => {
					if (open) return;
					open = true;
					text = '';
					said = describeNote('open');
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' && !open) {
						open = true;
						text = '';
						said = describeNote('open');
					}
				}}
			>
				<path class="shadow" d={art.sheet.shadow} />
				<path class="paper" d={art.sheet.paper} />
				<path class="ink" d={art.sheet.ink} />
			</g>

			<g class="bin">
				<path class="shadow" d={art.bin.shadow} />
				<path class="hatch" d={art.bin.shadowHatch} />
				<path class="bin-body" d={art.bin.body} />
				<path class="hatch" d={art.bin.shade} />
				<path class="bin-inside" d={art.bin.inside} />
				<path class="hatch deep" d={art.bin.insideHatch} />
				@for (const ball of art.bin.balls; index i; key ball.paper) {
					<g class={binned > i ? 'ball in' : 'ball'}>
						<path class="note-paper" d={ball.paper} />
						<path class="hatch" d={ball.shade} />
						<path class="ink" d={ball.ink} />
					</g>
				}
				<path class="ink" d={art.bin.ink} />
			</g>

			@if (open) {
				<g
					class={dragging ? 'note held' : 'note'}
					style={place}
					tabindex="0"
					role="textbox"
					aria-label="A note. Type on it; drag it to the bin, or press Delete, to close it."
					onPointerDown={(event) => {
						capture(event);
						scale = art.width / event.currentTarget.ownerSVGElement!.getBoundingClientRect().width;
						fromX = event.clientX;
						fromY = event.clientY;
						dragging = true;
					}}
					onPointerMove={(event) => {
						if (!dragging) return;
						dragX = (event.clientX - fromX) * scale;
						dragY = (event.clientY - fromY) * scale;
					}}
					onPointerUp={(event) => {
						dragging = false;
						if (dragX > BIN_REACH) {
							if (text === '' && !hinted) {
								hinted = true;
								hint = true;
								said = WRITE_FIRST;
							} else {
								open = false;
								binned = binned + 1;
								hint = false;
								said = describeNote('binned');
							}
						} else if (Math.abs(dragX) + Math.abs(dragY) < 6) (event.currentTarget as SVGGElement).focus();
						dragX = 0;
						dragY = 0;
					}}
					onFocus={() => {
						focused = true;
					}}
					onBlur={() => {
						focused = false;
					}}
					onKeyDown={(event) => {
						if (event.key === 'Delete' || event.key === 'Escape') {
							open = false;
							binned = binned + 1;
							said = describeNote('binned');
						} else if (event.key === 'Backspace') text = text.slice(0, -1);
						else if (event.key.length === 1 && text.length < MAX_TEXT) text = addLetter(text, event.key);
					}}
				>
					<path class="note-paper" d={art.note.paper} />
					<path class="wash" d={art.note.wash} />
					<path class="hatch" d={art.note.curl} />
					<path class="ink" d={art.note.ink} />
					<text class="note-text" x={art.note.textX} y={art.note.textY}>
						{text}
						<tspan class={focused ? 'caret on' : 'caret'}>|</tspan>
					</text>
					<text class={text === '' ? 'prompt' : 'prompt gone'} x={art.note.textX + 14} y={art.note.textY}>write here</text>
					<text class={hint && text === '' ? 'hint on' : 'hint'} x={art.note.textX} y={art.note.textY + 60}>write first?</text>
					<g
						class="close"
						onPointerDown={(event) => event.stopPropagation()}
						onPointerUp={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation();
							open = false;
							binned = binned + 1;
							said = describeNote('binned');
						}}
					>
						<path class="ink" d={art.note.close} />
					</g>
				</g>
			}
		</svg>
		<figcaption class="sr">
			An ink drawing of a sheet of paper with a yellow sticky note on it, and a waste bin beside it. Type on the note. Close it by
			dragging it into the bin, pressing its little cross, or pressing Delete: the note goes in the bin with what you wrote, and the
			sheet underneath is bare. Click the sheet, or press Enter on it, to open a note again: a fresh, blank one is built.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.sticky {
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

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
				}
			}

			.sheet {
				cursor: copy;
				outline: none;
			}

			.sheet:focus-visible .paper {
				stroke: var(--ink);
				stroke-dasharray: 5 5;
				stroke-width: 1.5;
			}

			.note {
				touch-action: none;
				cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M3 21l3-1 13-13-2-2L4 18z' fill='%23222' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E") 2 22, text;
				outline: none;
				transform-box: fill-box;
				transition: transform 260ms cubic-bezier(0.3, 0.7, 0.4, 1);
				animation: build 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.note:hover,
			.note:focus-visible {
				filter: drop-shadow(3px 5px 0 var(--shade));
			}

			.held {
				cursor: grabbing;
				transition: none;
				filter: drop-shadow(6px 10px 0 var(--shade));
			}

			.close {
				cursor: pointer;
			}

			.bin {
				transform-box: fill-box;
				transform-origin: 50% 100%;
				transition: transform 160ms ease;
			}

			.bin:hover {
				transform: rotate(2deg);
			}

			.ball {
				opacity: 0;
				transform-box: fill-box;
				transform-origin: 50% 100%;
			}

			.in {
				opacity: 1;
				animation: drop 380ms cubic-bezier(0.5, 0, 0.7, 1.4);
			}

			@keyframes drop {
				from {
					transform: translateY(-40px) rotate(-30deg);
				}
			}

			.shadow {
				fill: var(--shade);
			}

			.paper,
			.bin-body {
				fill: var(--sheet);
			}

			.bin-inside {
				fill: color-mix(in oklch, var(--ink) 30%, var(--sheet));
			}

			.deep {
				opacity: 0.8;
			}

			.note-paper {
				fill: color-mix(in oklch, var(--yellow) 55%, var(--sheet));
			}

			.wash {
				fill: var(--yellow);
				opacity: 0.6;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.3;
				}
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

			.note-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 24px;
				font-weight: 700;
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			.caret {
				opacity: 0;
			}

			.caret.on {
				animation: blink 1s steps(1) infinite;
			}

			.note:hover .caret {
				opacity: 1;
			}

			.prompt,
			.hint {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 17px;
				font-style: italic;
				fill: var(--ink);
				opacity: 0.4;
			}

			.gone {
				opacity: 0;
			}

			.hint {
				opacity: 0;
			}

			.hint.on {
				opacity: 0.6;
			}

			@keyframes blink {
				50% {
					opacity: 0;
				}
			}

			@keyframes build {
				from {
					opacity: 0;
					transform: scale(0.94) rotate(-2deg);
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
