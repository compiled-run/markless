// One button element on a code sheet with its parts named in pencil, wired from {bags} to the number on the shop page's button; a press runs the handler and redraws only that number.
import { state } from '@markless/core';
import { addBag, CODE_FS, describeParts, flip, NOTE_FS, PARTS_START } from './model.ts';
import { art } from './parts.art.ts';

export default function PartsAnatomy() @{
	let bags = state(PARTS_START);
	let newest = state('');
	let beat = state('rest');
	let touched = state(false);
	let spoken = state('');
	const sizes = '--code:' + CODE_FS + 'px;--note:' + NOTE_FS + 'px;';

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
				step++;
				if (step % 4 === 0) {
					bags = PARTS_START;
					newest = '';
					beat = 'rest';
				} else if (step % 4 !== 3) {
					newest = String(bags);
					bags = addBag(bags);
					beat = flip(beat);
				}
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
			aria-label="Add to cart"
			onClick={() => {
				touched = true;
				newest = String(bags);
				bags = addBag(bags);
				beat = flip(beat);
				spoken = describeParts(bags);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					bags = PARTS_START;
					newest = '';
					beat = 'rest';
					spoken = describeParts(PARTS_START);
				}
			}}
		>
			<svg class="scene wide" data-beat={beat} viewBox={'0 0 ' + art.wide.width + ' ' + art.wide.height} aria-hidden="true" style={sizes + art.wide.sink}>
				@for (const piece of art.wide.ink; key piece.key) {
					<path class={piece.cls} d={piece.d} />
				}
				@for (const run of art.wide.type; key run.key) {
					<text class={run.cls} transform={run.m}>{run.text}</text>
				}
				<g class="crossed" data-mark={newest === '' ? 'none' : 'new'} transform={art.wide.slots.old}>
					<text class="digit old">{newest}</text>
				</g>
				<path class="strike" data-mark={newest === '' ? 'none' : 'new'} d={art.wide.strike.d} style={'--l:' + art.wide.strike.length} />
				<text class="digit now" transform={art.wide.slots.now}>{bags}</text>
				<path class="pulse" d={art.wide.pulse.d} style={'--len:' + art.wide.pulse.length} />
				<path class="note-line" d={art.wide.note.arrow} />
				@for (const row of art.wide.note.lines; key row.key) {
					<text class="hand" x={row.x} y={row.y}>{row.text}</text>
				}
			</svg>
			<svg class="scene tall" data-beat={beat} viewBox={'0 0 ' + art.tall.width + ' ' + art.tall.height} aria-hidden="true" style={sizes + art.tall.sink}>
				@for (const piece of art.tall.ink; key piece.key) {
					<path class={piece.cls} d={piece.d} />
				}
				@for (const run of art.tall.type; key run.key) {
					<text class={run.cls} transform={run.m}>{run.text}</text>
				}
				<g class="crossed" data-mark={newest === '' ? 'none' : 'new'} transform={art.tall.slots.old}>
					<text class="digit old">{newest}</text>
				</g>
				<path class="strike" data-mark={newest === '' ? 'none' : 'new'} d={art.tall.strike.d} style={'--l:' + art.tall.strike.length} />
				<text class="digit now" transform={art.tall.slots.now}>{bags}</text>
				<path class="pulse" d={art.tall.pulse.d} style={'--len:' + art.tall.pulse.length} />
				<path class="note-line" d={art.tall.note.arrow} />
				@for (const row of art.tall.note.lines; key row.key) {
					<text class="hand" x={row.x} y={row.y}>{row.text}</text>
				}
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of two sheets of paper on a desk. The first holds the code of one button element: an opening button tag
			with the attribute class equals buy and the event handler onClick, which runs bags plus plus; inside it the text Add to cart and
			the value bags in curly braces; then the closing tag. Pencil notes name each part: tag, attribute, event handler, text and value.
			The second sheet is the shop page at beanshop.dev, with the shop name, House blend, 14 dollars and a pink button reading Add to
			cart with the number of bags. An ink cord with a clip at each end runs from the value in braces to that number, and nothing else
			on the page is wired. Press the drawing, or Enter or Space, to press the button: the handler runs, a pulse runs down the cord,
			and only the number is crossed out and rewritten. Escape starts again at {PARTS_START}.
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
				--sheet-ink: var(--ink);
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

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink.pool {
				fill: var(--pink);
				opacity: 0.45;
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
			.page-text,
			.price,
			.button-text,
			.digit {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.note {
				font-size: var(--note);
				font-weight: 700;
				fill: var(--pencil-ink);
			}

			.note-line,
			.pencil-ring {
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

			.price {
				font-size: 18px;
				font-weight: 800;
			}

			.button-text {
				font-size: 14px;
				font-weight: 700;
			}

			.digit {
				font-size: 17px;
				font-weight: 800;
			}

			.old {
				font-size: 12px;
				font-weight: 600;
				opacity: 0.55;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			.tall .hand {
				font-size: 15px;
			}

			.strike {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-dasharray: var(--l);
			}

			:is(.crossed, .strike)[data-mark='none'] {
				display: none;
			}

			.pencil-ring {
				opacity: 0;
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
				--sink: sink-a;
				--travel: travel-a;
				--ring: ring-a;
				--strike: strike-a;
				--ink-in: ink-in-a;
				--wash-in: wash-in-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--travel: travel-b;
				--ring: ring-b;
				--strike: strike-b;
				--ink-in: ink-in-b;
				--wash-in: wash-in-b;
			}

			.press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.handler {
				stroke-dasharray: 400;
				animation: var(--ring) 1100ms 120ms ease-out both;
			}

			.pulse {
				animation: var(--travel) 800ms 650ms ease-in-out both;
			}

			.strike {
				animation: var(--strike) 260ms 1450ms ease-out both;
			}

			.now {
				stroke: var(--ink);
				stroke-width: 0.3;
				stroke-dasharray: 46;
				animation: var(--ink-in) 600ms 1700ms ease-out both;
			}

			.spot {
				animation: var(--wash-in) 520ms 1800ms ease-out both;
			}

			@keyframes sink-a {
				35% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes sink-b {
				35% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes ring-a {
				0% {
					opacity: 1;
					stroke-dashoffset: 400;
				}

				45%,
				70% {
					opacity: 1;
					stroke-dashoffset: 0;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: 0;
				}
			}

			@keyframes ring-b {
				0% {
					opacity: 1;
					stroke-dashoffset: 400;
				}

				45%,
				70% {
					opacity: 1;
					stroke-dashoffset: 0;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: 0;
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

			@keyframes strike-a {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes strike-b {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes ink-in-a {
				from {
					stroke-dashoffset: 46;
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
					stroke-dashoffset: 46;
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
