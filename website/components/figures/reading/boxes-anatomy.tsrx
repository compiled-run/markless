// A component on a code sheet, its body boxed as the statement container and one {expression} ringed as the expression container; a press runs the statements in order and sends the one value down the wire to the page.
import { state } from '@markless/core';
import { CODE_FS, describeBoxes, flip, NOTE_FS, TOTAL } from './model.ts';
import { art } from './boxes.art.ts';

export default function BoxesAnatomy() @{
	let beat = state('rest');
	let touched = state(false);
	let spoken = state('');
	const sizes = '--code:' + CODE_FS + 'px;--note:' + NOTE_FS + 'px';

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let runs = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched || runs >= 3) return;
				runs++;
				beat = flip(beat);
			}, 6500);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Run the file"
			onClick={() => {
				touched = true;
				beat = flip(beat);
				spoken = describeBoxes(true);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					beat = 'rest';
					spoken = describeBoxes(false);
				}
			}}
		>
			<svg class="scene wide" data-beat={beat} viewBox={'0 0 ' + art.wide.width + ' ' + art.wide.height} aria-hidden="true" style={sizes}>
				@for (const piece of art.wide.ink; key piece.key) {
					<path class={piece.cls} d={piece.d} />
				}
				@for (const run of art.wide.type; key run.key) {
					<text class={run.cls} text-anchor={run.anchor ?? 'start'} transform={run.m}>{run.text}</text>
				}
				<text class="total now" transform={art.wide.total}>{TOTAL}</text>
				<path class="pulse" d={art.wide.pulse.d} style={'--len:' + art.wide.pulse.length} />
			</svg>
			<svg class="scene tall" data-beat={beat} viewBox={'0 0 ' + art.tall.width + ' ' + art.tall.height} aria-hidden="true" style={sizes}>
				@for (const piece of art.tall.ink; key piece.key) {
					<path class={piece.cls} d={piece.d} />
				}
				@for (const run of art.tall.type; key run.key) {
					<text class={run.cls} text-anchor={run.anchor ?? 'start'} transform={run.m}>{run.text}</text>
				}
				<text class="total now" transform={art.tall.total}>{TOTAL}</text>
				<path class="pulse" d={art.tall.pulse.d} style={'--len:' + art.tall.pulse.length} />
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of two sheets of paper on a desk. The first holds a component: export default function Cart, then at
			sign and an opening brace; let bags equals state of 2; let price equals state of 14; a paragraph reading Total and bags times
			price in curly braces; and a closing brace. A pencil box around the whole body is labelled: at sign braces holds statements,
			steps that run in order. The lines are numbered 1, 2 and 3 in the margin. A pencil ring around bags times price is labelled:
			braces hold one expression, a value for the page, with the working 2 times 14 equals 28 written under it. An ink cord runs from
			the ringed expression to the shop page at beanshop.dev, which says Your cart, Total: {TOTAL}. Press the drawing, or Enter or
			Space, to run the file: the step numbers appear in order, the working is written, a pulse runs down the cord and the total
			is inked in.
		</figcaption>
		<p class="sr" aria-live="polite">{spoken}</p>
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
				--sheet: color-mix(in oklch, var(--paper) 45%, white);
				--shade: color-mix(in oklch, var(--ink) 16%, transparent);
				--shade-ink: var(--ink);
				--c-kw: #d73a49;
				--c-fn: #6f42c1;
				--c-str: #032f62;
				--c-tag: #22863a;
				--pencil-ink: color-mix(in oklch, var(--ink) 78%, var(--paper));
				--blend: multiply;

				html.dark & {
					--sheet: oklch(27% 0.01 70);
					--shade: rgb(0 0 0 / 0.5);
					--shade-ink: rgb(0 0 0 / 0.9);
					--c-kw: #f97583;
					--c-fn: #b392f0;
					--c-str: #9ecbff;
					--c-tag: #85e89d;
					--pencil-ink: color-mix(in oklch, var(--ink) 82%, var(--paper));
					--blend: normal;
				}
			}

			.scene.tall {
				display: none;
			}

			@container anatomy (max-width: 520px) {
				.scene.wide {
					display: none;
				}

				.scene.tall {
					display: block;
				}
			}

			.sheet {
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
			}

			.light {
				opacity: 0.5;
			}

			.faint {
				opacity: 0.3;
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash,
			.shadow-ink {
				fill: var(--shade);
			}

			.cord,
			.brass {
				fill: var(--paper);
			}

			.boot {
				fill: oklch(48% 0.15 25);

				html.dark & {
					fill: oklch(52% 0.15 25);
				}
			}

			.brass-wash {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(60% 0.12 70));
				stroke: none;
				opacity: 0.8;
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: var(--blend);
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;

				html.dark & {
					opacity: 0.35;
				}
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
				opacity: 0.35;
				mix-blend-mode: var(--blend);
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

			.tok,
			.file {
				font-family: var(--font-mono);
				font-variation-settings:
					'MONO' 1,
					'CASL' 1;
				font-weight: 600;
				white-space: pre;
				fill: var(--ink);
			}

			.tok {
				font-size: var(--code);
			}

			.file {
				font-size: 10px;
				opacity: 0.55;
			}

			.kw {
				fill: var(--c-kw);
			}

			.fn {
				fill: var(--c-fn);
			}

			.str {
				fill: var(--c-str);
			}

			.tag {
				fill: var(--c-tag);
			}

			.note,
			.step-text,
			.working,
			.url,
			.shop,
			.page-text,
			.total {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.note {
				font-size: var(--note);
				font-weight: 700;
				fill: var(--pencil-ink);
			}

			.step-text,
			.working {
				font-size: 12px;
				font-weight: 800;
				fill: var(--pencil-ink);
			}

			.working {
				font-size: 13px;
			}

			.note-line,
			.step {
				fill: none;
				stroke: var(--pencil-ink);
				stroke-width: 1.1;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.url {
				font-size: 7px;
				opacity: 0.75;
			}

			.shop {
				font-size: 18px;
				font-weight: 800;
			}

			.page-text {
				font-size: 12.5px;
				font-weight: 600;
			}

			.total {
				font-size: 22px;
				font-weight: 800;
			}

			.pulse {
				fill: none;
				stroke: var(--ink);
				stroke-width: 7;
				stroke-linecap: round;
				stroke-dasharray: 3 100000;
				opacity: 0;
			}

			.scene[data-beat='odd'] {
				--appear: appear-a;
				--travel: travel-a;
				--ink-in: ink-in-a;
				--wash-in: wash-in-a;
			}

			.scene[data-beat='even'] {
				--appear: appear-b;
				--travel: travel-b;
				--ink-in: ink-in-b;
				--wash-in: wash-in-b;
			}

			.step-0 {
				animation: var(--appear) 360ms 200ms ease-out both;
			}

			.step-1 {
				animation: var(--appear) 360ms 750ms ease-out both;
			}

			.step-2 {
				animation: var(--appear) 360ms 1300ms ease-out both;
			}

			.working {
				animation: var(--appear) 420ms 1850ms ease-out both;
			}

			.pulse {
				animation: var(--travel) 800ms 2300ms ease-in-out both;
			}

			.now {
				stroke: var(--ink);
				stroke-width: 0.3;
				stroke-dasharray: 60;
				animation: var(--ink-in) 600ms 3050ms ease-out both;
			}

			.spot {
				animation: var(--wash-in) 520ms 3150ms ease-out both;
			}

			@keyframes appear-a {
				from {
					opacity: 0;
					transform: translateY(-3px);
				}
			}

			@keyframes appear-b {
				from {
					opacity: 0;
					transform: translateY(-3px);
				}
			}

			@keyframes travel-a {
				0% {
					opacity: 1;
					stroke-dashoffset: 2;
				}

				92% {
					opacity: 1;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: calc(var(--len) * -1px);
				}
			}

			@keyframes travel-b {
				0% {
					opacity: 1;
					stroke-dashoffset: 2;
				}

				92% {
					opacity: 1;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: calc(var(--len) * -1px);
				}
			}

			@keyframes ink-in-a {
				from {
					stroke-dashoffset: 60;
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
					stroke-dashoffset: 60;
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
