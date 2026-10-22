// A cart list on a code sheet: the @for row wired to one row per bag on the shop page, the @if paragraph wired to a free-shipping note; a press adds a third bag, which adds a row and puts the note on the page.
import { state } from '@markless/core';
import { CODE_FS, describeFlow, flip, type Flow, NOTE_FS } from './model.ts';
import { art } from './flow.art.ts';

export default function FlowAnatomy() @{
	let flow = state('two');
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
			let turns = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched || turns >= 4) return;
				turns++;
				if (flow === 'two') {
					flow = 'three';
					beat = flip(beat);
				} else {
					flow = 'two';
				}
			}, 3600);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Add a third bag, or go back to two"
			onClick={() => {
				touched = true;
				const next: Flow = flow === 'two' ? 'three' : 'two';
				flow = next;
				if (next === 'three') beat = flip(beat);
				spoken = describeFlow(next);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					flow = 'two';
					spoken = describeFlow('two');
				}
			}}
		>
			<svg class="scene wide" data-flow={flow} data-beat={beat} viewBox={'0 0 ' + art.wide.width + ' ' + art.wide.height} aria-hidden="true" style={sizes}>
				@for (const piece of art.wide.ink; key piece.key) {
					<path class={piece.cls} d={piece.d} />
				}
				@for (const run of art.wide.type; key run.key) {
					<text class={run.cls} transform={run.m}>{run.text}</text>
				}
				@for (const pulse of art.wide.pulses; key pulse.key) {
					<path class={pulse.cls} d={pulse.d} style={'--len:' + pulse.length} />
				}
			</svg>
			<svg class="scene tall" data-flow={flow} data-beat={beat} viewBox={'0 0 ' + art.tall.width + ' ' + art.tall.height} aria-hidden="true" style={sizes}>
				@for (const piece of art.tall.ink; key piece.key) {
					<path class={piece.cls} d={piece.d} />
				}
				@for (const run of art.tall.type; key run.key) {
					<text class={run.cls} transform={run.m}>{run.text}</text>
				}
				@for (const pulse of art.tall.pulses; key pulse.key) {
					<path class={pulse.cls} d={pulse.d} style={'--len:' + pulse.length} />
				}
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of two sheets of paper on a desk. The first holds a cart list: a section with a list whose at-for loop
			goes over bags, keyed by bag dot id, and draws a list item showing the bag's name; then an at-if block that shows Free shipping
			only while there are more than two bags. Pencil notes say one row per bag, and only while it is true. On the shop page at
			beanshop.dev, Your cart lists House blend and Dark roast. An ink cord runs from the list item's name through a splice to a clip on
			every row, and a second cord runs from the at-if paragraph to its own splice. Press the drawing, or Enter or Space, to add Decaf:
			a third row and its clip appear, and Free shipping is put on the page with its clip. Press again to go back to two bags, and both
			leave the page.
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
			.url,
			.shop,
			.row {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.note {
				font-size: var(--note);
				font-weight: 700;
				fill: var(--pencil-ink);
			}

			.note-line {
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

			.row {
				font-size: 14px;
				font-weight: 600;
			}

			.row.strong {
				font-weight: 800;
			}

			:is(.third, .free) {
				transition:
					opacity 320ms ease-in,
					visibility 0s;
			}

			.scene[data-flow='two'] :is(.third, .free) {
				opacity: 0;
				visibility: hidden;
				transition:
					opacity 320ms ease-in,
					visibility 0s 320ms;
			}

			.pulse {
				fill: none;
				stroke: var(--ink);
				stroke-width: 7;
				stroke-linecap: round;
				stroke-dasharray: 3 100000;
				opacity: 0;
			}

			.scene[data-flow='three'][data-beat='odd'] {
				--travel: travel-a;
				--appear: appear-a;
			}

			.scene[data-flow='three'][data-beat='even'] {
				--travel: travel-b;
				--appear: appear-b;
			}

			.to-splice {
				animation: var(--travel) 700ms 120ms ease-in-out both;
			}

			.to-spot {
				animation: var(--travel) 380ms 820ms ease-in-out both;
			}

			.scene[data-flow='three'] :is(.third, .free) {
				animation: var(--appear) 520ms 1150ms ease-out both;
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

			@keyframes appear-a {
				from {
					opacity: 0;
					transform: translateY(-4px);
				}
			}

			@keyframes appear-b {
				from {
					opacity: 0;
					transform: translateY(-4px);
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
