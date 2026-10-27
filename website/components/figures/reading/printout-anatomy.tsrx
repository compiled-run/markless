// The guest-list file printed on a sheet on the desk and marked up by hand: yellow on every value, a bracket down the instructions.
import { computed, state } from '@markless/core';
import { describeMarks, flip, MARK_TOUR, SAID } from './model.ts';
import { art } from './printout.art.ts';

export default function PrintoutAnatomy() @{
	const marks = art.marks;
	let beat = state('rest');
	let touched = state(false);
	const said = computed(() => describeMarks(beat !== 'rest'));

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
				const next = MARK_TOUR[step % MARK_TOUR.length];
				step++;
				if (next === 'mark') beat = flip(beat);
			}, 4200);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Mark up the printout again"
			onClick={() => {
				touched = true;
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} viewBox={art.view.x + ' ' + art.view.y + ' ' + art.view.width + ' ' + art.view.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="sheet-paper" d={art.sheet.paper} />

				@for (const slip of marks.slips; key slip.key) {
					<path class="slip" d={slip.d} />
				}
				@for (const mark of marks.swipes; key mark.key) {
					<path class={mark.desk ? 'swipe on-desk' : 'swipe'} d={mark.d} style={'stroke-width:' + mark.width + 'px;--l:' + mark.length + ';--at:' + mark.at + 'ms'} />
				}
				@for (const line of art.lines; key line.key) {
					<g>
						@for (const piece of line.pieces; key piece.key) {
							<text class={piece.tint === '' ? 'code' : 'code tint'} style={piece.tint} transform={piece.matrix}>{piece.text}</text>
						}
					</g>
				}
				<path class="sheet-ink" d={art.sheet.curl.ink} />
				<path class="sheet-ink" d={art.sheet.ink} />

				@for (const mark of marks.pens; key mark.key) {
					<path class={mark.desk ? 'pen' : 'pen on-sheet'} d={mark.d} style={'--l:' + mark.length + ';--at:' + mark.at + 'ms'} />
				}
				@for (const note of marks.notes; key note.key) {
					<text class={'note ' + note.tone} transform={note.matrix} style={'--at:' + note.at + 'ms'}>{note.text}</text>
				}
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a printout of guest-list.tsrx lying on a desk, marked up by hand. {SAID} Press the drawing, or Enter or
			Space, to watch the marks drawn again. Escape stops it.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;

				@media (max-width: 600px) {
					margin-inline: calc(50% - 50vw + 0.4rem);
				}
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
				overflow: hidden;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
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

			.code {
				font-family: 'Recursive', ui-monospace, monospace;
				font-variation-settings: 'MONO' 1, 'CASL' 0;
				font-size: 6.4px;
				font-weight: 500;
				white-space: pre;
				fill: var(--sheet-ink);
			}

			.tint {
				fill: var(--c);
			}

			.swipe {
				fill: none;
				stroke: var(--yellow);
				stroke-linecap: round;
				stroke-linejoin: round;
				opacity: 0.75;
				mix-blend-mode: multiply;
				stroke-dasharray: var(--l);

				html.dark & {
					opacity: 0.45;
					mix-blend-mode: normal;
				}
			}

			.swipe.on-desk {
				html.dark & {
					opacity: 0.85;
				}
			}

			.pen {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.pen.on-sheet {
				stroke: var(--sheet-ink);
			}

			.note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 7px;
				letter-spacing: 0.08em;
				fill: var(--sheet-ink);
			}

			.desk {
				fill: var(--ink);
			}

			.print {
				font-family: system-ui, sans-serif;
				font-size: 5.6px;
				letter-spacing: 0;
				fill: var(--sheet-ink);
			}

			.slip {
				fill: var(--sheet);
			}

			.scene[data-beat='odd'] {
				--draw: draw-a;
				--show: show-a;
			}

			.scene[data-beat='even'] {
				--draw: draw-b;
				--show: show-b;
			}

			.swipe,
			.pen {
				animation: var(--draw) 520ms var(--at) ease-out both;
			}

			.note {
				animation: var(--show) 360ms var(--at) ease-out both;
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
