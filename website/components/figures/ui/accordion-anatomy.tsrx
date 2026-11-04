// The accordion's parts drawn in ink on a shop help page: press it to draw the labels on again.
import { state } from '@markless/core';
import { art } from './accordion-anatomy.art.ts';

const PARTS = [
	{ name: 'accordion.root', what: 'the whole stack; it holds which section is open' },
	{ name: 'accordion.item', what: 'one question and its answer' },
	{ name: 'accordion.itemlabel', what: 'an <h3>: the heading line' },
	{ name: 'accordion.itemtrigger', what: 'the <button> inside the heading' },
	{ name: 'accordion.itemcontent', what: 'a region that the heading names; closed, it stays in the page, hidden' },
];

export default function AccordionAnatomy() @{
	let beat = state('odd');

	<figure class="accordion-anatomy">
		<button
			type="button"
			class="stage"
			aria-label="Draw the labels again"
			onClick={() => {
				beat = beat === 'odd' ? 'even' : 'odd';
			}}
		>
			<svg class="scene wide" data-beat={beat} viewBox={'0 0 ' + art.wide.width + ' ' + art.wide.height} aria-hidden="true">
				@for (const s of art.wide.shapes; key s.key) {
					<path class={s.cls} d={s.d} />
				}
				@for (const s of art.wide.strokes; key s.key) {
					<path class={s.cls} d={s.d} style={'--l:' + s.length + ';--at:' + s.at + 'ms'} />
				}
				@for (const t of art.wide.texts; key t.key) {
					<text class={t.cls} x={t.x} y={t.y}>{t.text}</text>
				}
			</svg>
			<svg class="scene tall" data-beat={beat} viewBox={'0 0 ' + art.tall.width + ' ' + art.tall.height} aria-hidden="true">
				@for (const s of art.tall.shapes; key s.key) {
					<path class={s.cls} d={s.d} />
				}
				@for (const s of art.tall.strokes; key s.key) {
					<path class={s.cls} d={s.d} style={'--l:' + s.length + ';--at:' + s.at + 'ms'} />
				}
				@for (const t of art.tall.texts; key t.key) {
					<text class={t.cls} x={t.x} y={t.y}>{t.text}</text>
				}
			</svg>
		</button>
		<figcaption class="legend">
			<ul>
				@for (const part of PARTS; key part.name) {
					<li>
						<code>{part.name}</code>
						<span>{part.what}</span>
					</li>
				}
			</ul>
		</figcaption>
		<style>
			.accordion-anatomy {
				container: accordion-anatomy / inline-size;
				margin: var(--space-m) 0;
			}

			.stage {
				display: block;
				width: 100%;
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

			.tall {
				display: none;
			}

			.legend {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			@container accordion-anatomy (max-width: 560px) {
				.wide {
					display: none;
				}

				.tall {
					display: block;
				}

				.legend {
					position: static;
					width: auto;
					height: auto;
					overflow: visible;
					clip-path: none;
					white-space: normal;
				}
			}

			.legend ul {
				display: grid;
				gap: 0.6rem;
				margin: var(--space-s) 0 0;
				padding: 0;
				list-style: none;
			}

			.legend li {
				display: grid;
				gap: 0.1rem;
			}

			.paper,
			.box {
				fill: var(--sheet);
			}

			.shade {
				fill: color-mix(in oklch, var(--ink) 16%, transparent);
			}

			.ink {
				fill: var(--ink);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.55;
			}

			.open {
				fill: var(--yellow);
				opacity: 0.7;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.45;
				}
			}

			.hidden {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.8;
				stroke-dasharray: 3 4;
				opacity: 0.5;
			}

			.ui {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 15px;
				fill: #2d2a24;
			}

			.light {
				opacity: 0.75;
			}

			.title {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 20px;
				font-weight: 700;
				fill: #2d2a24;
			}

			.hand {
				font-family: 'Recursive', ui-monospace, monospace;
				font-size: 15px;
				font-weight: 600;
				fill: var(--ink);
			}

			.note {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 15px;
				fill: var(--ink);
			}

			.pencil {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 16px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.pen {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.4;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.part {
				stroke: #2d2a24;
			}

			.guide {
				stroke-dasharray: 2 5;
				opacity: 0.5;
			}

			.root {
				stroke-dasharray: 5 5;
				opacity: 0.7;
			}

			.names {
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.scene[data-beat='odd'] {
				--draw: draw-a;
			}

			.scene[data-beat='even'] {
				--draw: draw-b;
			}

			.pen:not(.guide, .root) {
				animation: var(--draw) 600ms var(--at) ease-out both;
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

			@media (prefers-reduced-motion: reduce) {
				.pen:not(.guide, .root) {
					animation: none;
				}
			}
		</style>
	</figure>
}
