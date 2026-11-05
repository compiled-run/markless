// A frozen desk scene from sheets.ts: pressing it replays the pen marks in order; Escape shows the finished drawing.
import { state } from '@markless/core';
import type { DeskArt } from './sheets.ts';

export default function DeskFigure({
	art,
	label,
	caption,
	said,
}: {
	/** The frozen drawing, from a figure's `*.art.ts`. */
	readonly art: DeskArt;
	/** What pressing the drawing does, for the button's accessible name. */
	readonly label: string;
	/** The whole drawing in plain words, for readers who can't see it. */
	readonly caption: string;
	/** One sentence a screen reader hears after a replay. */
	readonly said: string;
}) @{
	let beat = state('rest');
	let spoken = state('');
	let touched = state(false);

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let plays = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched || plays >= 3) return;
				plays++;
				beat = beat === 'odd' ? 'even' : 'odd';
			}, 7000);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label={label}
			onClick={() => {
				touched = true;
				beat = beat === 'odd' ? 'even' : 'odd';
				spoken = said;
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					beat = 'rest';
					spoken = '';
				}
			}}
		>
			<svg class="scene" data-beat={beat} viewBox={art.view} aria-hidden="true">
				@for (const layer of art.layers; key layer.key) {
					<g>
						@for (const item of layer.paths; key item.key) {
							<path class={item.cls} d={item.d} style={item.style} />
						}
						@for (const text of layer.texts; key text.key) {
							<text class={text.cls} style={text.style} transform={text.matrix}>{text.text}</text>
						}
					</g>
				}
			</svg>
		</button>
		<figcaption class="sr">{caption}</figcaption>
		<p class="sr" aria-live="polite">{spoken}</p>
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
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);
				--kraft: color-mix(in oklch, oklch(78% 0.06 70) 70%, var(--paper));
				--c-kw: #d73a49;
				--c-fn: #6f42c1;
				--c-str: #032f62;
				--c-tag: #22863a;
				--c-num: #005cc5;
				--c-err: #cb2431;

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
					--kraft: oklch(70% 0.05 70);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.desk-ink {
				fill: var(--ink);
			}

			.kraft {
				fill: var(--kraft);
			}

			.kraft-wash {
				fill: oklch(60% 0.08 60);
				opacity: 0.18;
			}

			.light {
				opacity: 0.55;
			}

			.hatch,
			.sheet-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.sheet-hatch {
				stroke: var(--sheet-ink);
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

			.swipe {
				fill: var(--yellow);
				opacity: 0.6;
				mix-blend-mode: multiply;

				html.dark & {
					opacity: 0.5;
					mix-blend-mode: normal;
				}
			}

			.pink-wash {
				fill: var(--pink);
				opacity: 0.75;
			}

			.pen {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.halo {
				stroke: var(--sheet);
				stroke-width: 3.4;
			}

			.squiggle {
				stroke: var(--c-err);
				stroke-width: 1.1;
			}

			.pulse {
				fill: none;
				stroke: var(--pink);
				stroke-width: 5;
				stroke-linecap: round;
				stroke-dasharray: 3 100000;
				opacity: 0;
			}

			text {
				white-space: pre;
				fill: var(--sheet-ink);
			}

			.mono,
			.dim,
			.bold,
			.num {
				font-family: var(--font-mono);
				font-variation-settings: 'MONO' 1, 'CASL' 0;
				font-size: 10px;
				font-weight: 500;
			}

			.dim {
				opacity: 0.55;
			}

			.bold {
				font-weight: 800;
			}

			.num {
				font-size: 9px;
				opacity: 0.45;
			}

			.small {
				font-size: 8px;
			}

			.ui,
			.big {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 11px;
			}

			.big {
				font-size: 15px;
				font-weight: 700;
			}

			.bold-ui {
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 10px;
				letter-spacing: 0.06em;
			}

			.faint {
				opacity: 0.45;
			}

			.roller {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.6;
				opacity: 0.35;
			}

			.perforation {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.9;
				stroke-linecap: round;
				opacity: 0.6;
			}

			.stamp-ink {
				fill: var(--sheet-ink);
				opacity: 0.85;
			}

			.stamp-word {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 8px;
				letter-spacing: 0.12em;
			}

			.desk-text {
				fill: var(--ink);
			}

			.num-ring {
				font-size: 10px;
			}

			.margin-note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 11px;
				letter-spacing: 0.1em;
				fill: var(--ink);
			}

			.tint-kw {
				fill: var(--c-kw);
			}

			.tint-fn,
			.tint-attr {
				fill: var(--c-fn);
			}

			.tint-str {
				fill: var(--c-str);
			}

			.tint-num {
				fill: var(--c-num);
			}

			.tint-tag {
				fill: var(--c-tag);
			}

			.tint-err {
				fill: var(--c-err);
			}

			.scene[data-beat='odd'] {
				--draw: draw-a;
				--show: show-a;
				--gone: gone-a;
				--sink: sink-a;
				--run: run-a;
				--flash: flash-a;
			}

			.scene[data-beat='even'] {
				--draw: draw-b;
				--show: show-b;
				--gone: gone-b;
				--sink: sink-b;
				--run: run-b;
				--flash: flash-b;
			}

			.gone {
				opacity: 0;
			}

			.draw {
				animation: var(--draw) 520ms var(--at) ease-out both;
			}

			.show {
				animation: var(--show) 320ms var(--at) ease-out both;
			}

			.gone {
				animation: var(--gone) 360ms var(--at) ease-in both;
			}

			.sink {
				animation: var(--sink) 420ms var(--at) ease-in-out both;
			}

			.flash {
				opacity: 0;
				animation: var(--flash) var(--for) var(--at) linear both;
			}

			.pulse {
				animation: var(--run) 700ms var(--at) ease-in-out both;
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

			@keyframes gone-a {
				from {
					opacity: 1;
				}
				to {
					opacity: 0;
				}
			}

			@keyframes gone-b {
				from {
					opacity: 1;
				}
				to {
					opacity: 0;
				}
			}

			@keyframes sink-a {
				50% {
					transform: translateY(1.5px);
				}
			}

			@keyframes sink-b {
				50% {
					transform: translateY(1.5px);
				}
			}

			@keyframes run-a {
				from {
					opacity: 0;
					stroke-dashoffset: 0;
				}
				2% {
					opacity: 1;
				}
				90% {
					opacity: 1;
				}
				to {
					opacity: 0;
					stroke-dashoffset: calc(var(--l) * -1);
				}
			}

			@keyframes run-b {
				from {
					opacity: 0;
					stroke-dashoffset: 0;
				}
				2% {
					opacity: 1;
				}
				90% {
					opacity: 1;
				}
				to {
					opacity: 0;
					stroke-dashoffset: calc(var(--l) * -1);
				}
			}

			@keyframes flash-a {
				0%,
				100% {
					opacity: 0;
				}
				8%,
				92% {
					opacity: 1;
				}
			}

			@keyframes flash-b {
				0%,
				100% {
					opacity: 0;
				}
				8%,
				92% {
					opacity: 1;
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
