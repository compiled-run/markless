// A surveyor's field book: one sketch per .tsrx file, and the map that joins them, inked and stamped at build time.
import { computed, state } from '@markless/core';
import { describeSurvey } from './model.ts';
import { art } from './survey.art.ts';

export default function SurveyAnatomy() @{
	let on = state(false);
	let touched = state(false);

	const lit = computed(() => (on ? 'yes' : 'no'));
	const said = computed(() => describeSurvey(on));
	const press = () => {
		on = !on;
	};
	const reset = () => {
		on = false;
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				press();
			}, 3200);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Finish the survey"
			onClick={() => {
				touched = true;
				press();
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					reset();
				}
			}}
		>
			<svg class="scene" data-on={lit} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<g class="cue">
					@for (const layer of art.inked.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
					@for (const words of art.inked.words; key words.key) {
						<text class={words.cls} transform={words.matrix}>{words.text}</text>
					}
				</g>
				<g class="cue seal">
					@for (const layer of art.seal.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
					@for (const words of art.seal.words; key words.key) {
						<text class={words.cls} transform={words.matrix}>{words.text}</text>
					}
				</g>
				<path class="desk-ink" d={art.note.arrow} />
				<text class="note" x={art.note.x} y={art.note.y}>MAPPED BEFORE ANYONE VISITS</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a surveyor's field book open on a desk. The left page has one small sketch per file: page.tsrx,
			header.tsrx and cart.tsrx, with two yellow dots in cart.tsrx marking the spots that can change, and a pencilled note: every file
			read before anyone visits. The right page holds the survey map in pencil. Press the drawing, or Enter or Space, to finish the
			survey: the map is inked, showing page.tsrx holding header.tsrx and cart.tsrx with the two changing spots, and a stamp reads
			surveyed at build. Press again or Escape to go back to pencil.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
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
				--sheet-ink: var(--ink);
				--shade-fill: color-mix(in oklch, var(--ink) 20%, transparent);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade-fill: rgb(0 0 0 / 0.5);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.kraft-fill {
				fill: color-mix(in oklch, var(--sheet) 70%, oklch(72% 0.07 65));
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.faint {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.55;
			}

			.shadow {
				fill: var(--shade-fill);
			}

			.desk-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.4;
			}

			.desk-ink {
				fill: var(--ink);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.8;
				stroke-linecap: round;
				opacity: 0.6;
			}

			.print,
			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 5px;
				font-weight: 600;
				fill: var(--sheet-ink);
			}

			.title {
				font-size: 5.6px;
				font-weight: 800;
			}

			.label {
				font-size: 4.4px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 5.4px;
				fill: var(--sheet-ink);
			}

			.pencil-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 4.6px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			.cue {
				opacity: 0;
				transition: opacity 450ms ease;
			}

			.scene[data-on='yes'] .cue {
				opacity: 1;
			}

			@container anatomy (max-width: 520px) {
				.note {
					font-size: 21px;
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

			.code {
				font-family: var(--font-mono);
				font-size: 4.4px;
				font-variation-settings: 'MONO' 1;
				fill: var(--sheet-ink);
			}
			.pink-ink {
				fill: color-mix(in srgb, var(--pink) 70%, #c0403c);
			}

			.stamp-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 3.6px;
				letter-spacing: 0.08em;
				fill: color-mix(in srgb, var(--pink) 70%, #c0403c);
			}

			.seal {
				transition-delay: 300ms;
			}
		</style>
	</figure>
}
