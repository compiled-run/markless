// The accordion's one idea: press the heading, and the panel it names opens under it.
import { computed, state } from '@markless/core';
import { art } from './accordion-anatomy.art.ts';

export default function AccordionAnatomy() @{
	let open = state(true);
	const said = computed(() => (open ? 'The panel opened under its heading.' : 'The panel closed.'));
	let touched = state(false);

	<figure class="accordion-anatomy">
		<button
			type="button"
			class="stage"
			aria-pressed={open ? 'true' : 'false'}
			aria-label="Press the heading to close or open its panel"
			onClick={() => {
				touched = true;
				open = !open;
			}}
		>
			<svg class="scene" data-open={open ? 'yes' : 'no'} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				@for (const s of art.shapes; key s.key) {
					<path class={s.cls} d={s.d} />
				}
				@for (const s of art.strokes; key s.key) {
					<path class={s.cls} d={s.d} style={'--l:' + s.length + ';--at:' + s.at + 'ms'} />
				}
				@for (const t of art.texts; key t.key) {
					<text class={t.cls} x={t.x} y={t.y}>{t.text}</text>
				}
			</svg>
		</button>
		<p class="sr" aria-live="polite">{touched ? said : ''}</p>
		<style>
			.accordion-anatomy {
				margin: var(--space-m) 0;
			}

			.stage {
				display: block;
				width: min(100%, 34rem);
				padding: 0;
				border: 0;
				border-radius: 12px;
				background: none;
				color: inherit;
				cursor: pointer;
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

				html.dark & {
					--sheet: color-mix(in oklch, var(--paper) 88%, white);
				}
			}

			.box {
				fill: var(--sheet);
			}

			.wash {
				fill: var(--yellow);
				opacity: 0;
				mix-blend-mode: multiply;
				transition: opacity 200ms ease;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.scene[data-open='yes'] .wash {
				opacity: 0.6;
			}

			.scene[data-open='no'] .panel,
			.scene[data-open='no'] .open-mark,
			.scene[data-open='yes'] .closed-mark {
				display: none;
			}

			.ui {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 18px;
				fill: var(--ink);
			}

			.pencil {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 18px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.pen {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.6;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.scribble {
				opacity: 0.6;
			}

			.names {
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.scene[data-open='yes'] .pen.panel {
				animation: draw 500ms var(--at) ease-out both;
			}

			@keyframes draw {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
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

			@media (prefers-reduced-motion: reduce) {
				.scene[data-open='yes'] .pen.panel {
					animation: none;
				}
			}
		</style>
	</figure>
}
