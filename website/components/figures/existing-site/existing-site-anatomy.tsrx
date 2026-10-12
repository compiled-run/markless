// A journal page on a desk with one spot cut out for #app, and the like button beside it as a paper piece: the first press drops it into the hole, later presses like.
import { computed, state } from '@markless/core';
import { BYLINE, describe, flip, JOURNAL, like, LIKE, type Phase, pressed, SLOTS, START, TARGET, TITLE, TOUR, URL_TEXT } from './model.ts';
import { art } from './wired.art.ts';

export default function ExistingSiteAnatomy() @{
	let phase = state('out' as Phase);
	let count = state(START);
	let newest = state('');
	let beat = state('rest');
	let cleared = state(false);
	let touched = state(false);
	const said = computed(() => describe(phase, count, cleared));
	const label = computed(() => (phase === 'out' ? 'Run render() into the ' + TARGET + ' spot' : 'Like'));

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
				const next = TOUR[step % TOUR.length];
				step++;
				if (next === 'press') {
					const from = phase;
					phase = pressed(from);
					newest = from === 'out' ? '' : String(count);
					count = from === 'out' ? START : like(count);
					cleared = false;
					beat = flip(beat);
				} else if (next === 'reset') {
					phase = 'out';
					count = START;
					newest = '';
					cleared = true;
					beat = 'rest';
				}
			}, 3400);
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
				const from = phase;
				phase = pressed(from);
				newest = from === 'out' ? '' : String(count);
				count = from === 'out' ? START : like(count);
				cleared = false;
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					phase = 'out';
					count = START;
					newest = '';
					cleared = true;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-phase={phase} data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="pencil" d={art.rest.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="hatch deep light" d={art.hole.desk} />
				<path class="shadow-wash" d={art.hole.shade} />
				<path class="hatch deep" d={art.hole.shadeHatch} />
				<g class="rest-shadow">
					<path class="shadow-wash" d={art.rest.shadow.wash} />
					<path class="hatch deep light" d={art.rest.shadow.hatch} />
					<path class="hatch deep" d={art.rest.shadow.foot} />
				</g>

				<g class="sheet">
					<path class="sheet-paper cut" d={art.sheet.paper} />
					<path class="sheet-hatch light" d={art.page.bar.tone} />
					<path class="sheet-ink" d={art.page.bar.rule} />
					<path class="sheet-ink" d={art.page.bar.dots} />
					<path class="sheet-ink" d={art.page.bar.url} />
					<text class="url" transform={art.page.bar.urlMatrix}>{URL_TEXT}</text>
					<g class="once">
						<text class="journal" transform={art.page.mastMatrix}>{JOURNAL}</text>
						<path class="sheet-ink" d={art.page.mastRule} />
						<text class="headline" transform={art.page.titleMatrix}>{TITLE}</text>
						<text class="byline" transform={art.page.bylineMatrix}>{BYLINE}</text>
						<path class="sheet-hatch" d={art.page.photo.tone} />
						<path class="sheet-paper" d={art.page.photo.lit} />
						<path class="sheet-ink" d={art.page.photo.ink} />
						<path class="sheet-ink type" d={art.page.text} />
					</g>
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>
				<path class="sheet-hatch" d={art.hole.wall} />

				<g class="placed">
					<path class="sheet-paper" d={art.placed.paper} />
					<g class="press placed-press" style={art.placed.pill.sink}>
						<path class="sheet-hatch" d={art.placed.pill.side} />
						<path class="sheet-paper" d={art.placed.pill.paper} />
						<path class="wash pink" d={art.placed.pill.wash} />
						<path class="wash pink pool" d={art.placed.pill.pool} />
						<path class="sheet-ink" d={art.placed.pill.ink} />
					</g>
					<g class="spot">
						<path class="wash yellow" d={art.placed.spot.wash} />
						<path class="wash yellow pool" d={art.placed.spot.pool} />
						<path class="wash-edge" d={art.placed.spot.edge} />
					</g>
					<g transform={art.placed.rowMatrix}>
						<text class="label" x={SLOTS.label}>{LIKE}{' '}<tspan class="digit now">{count}</tspan></text>
						<g class="crossed newest" data-mark={newest === '' ? 'none' : 'new'} style={'--step:' + (SLOTS.now - SLOTS.old) + 'px'}>
							<text class="old" x={SLOTS.old}>{newest}</text>
							<path class="strike" d={art.strike.d} style={'--l:' + art.strike.length} />
						</g>
					</g>
				</g>
				<path class="sheet-ink" d={art.hole.ink} />

				<path class="shadow-wash" d={art.tag.cast} />
				<path class="ink" d={art.tag.string} />
				<path class="sheet-paper" d={art.tag.paper} />
				<path class="sheet-hatch" d={art.tag.shade} />
				<path class="sheet-ink" d={art.tag.ink} />
				<text class="tag-text" transform={art.tag.matrix}>{TARGET}</text>

				<g class="travel" style={art.rest.travel}>
					<path class="sheet-hatch" d={art.rest.piece.thick} />
					<path class="sheet-paper" d={art.rest.piece.paper} />
					<path class="sheet-hatch" d={art.rest.piece.pill.side} />
					<path class="sheet-paper" d={art.rest.piece.pill.paper} />
					<path class="wash pink" d={art.rest.piece.pill.wash} />
					<path class="wash pink pool" d={art.rest.piece.pill.pool} />
					<path class="sheet-ink" d={art.rest.piece.pill.ink} />
					<g transform={art.rest.piece.rowMatrix}>
						<text class="label" x={SLOTS.label}>{LIKE}{' '}<tspan class="digit">{START}</tspan></text>
					</g>
					<path class="sheet-ink" d={art.rest.piece.ink} />
				</g>

				<path class="halo" d={art.note.arrow} />
				<path class="ink" d={art.note.arrow} />
				<text class="hand" x={art.note.at.x} y={art.note.at.y}>ONLY THE SPOT YOU CUT</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is printed as an ordinary blog page, the {JOURNAL}, with the article
			"{TITLE}", a byline, a photo of a cup of coffee and two columns of text. One rectangle in the right column has been cut clean out
			of the paper, so the desk shows through, and a paper tag on a string beside it reads {TARGET}. On the desk next to the sheet lies a
			scrap of paper cut to exactly that shape: a pink like button reading "{LIKE} {START}". Press the drawing, or Enter or Space, to
			run render(): the piece drops into the hole and nothing else on the page moves. Press again to like. Escape lifts the piece out.
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

			.cut {
				fill-rule: evenodd;
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.type {
				opacity: 0.62;
			}

			.sheet-hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.ink {
				fill: var(--ink);
			}

			.halo {
				fill: none;
				stroke: var(--paper);
				stroke-width: 2.6;
				stroke-linejoin: round;
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

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
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
				opacity: 0.55;
				mix-blend-mode: multiply;
			}

			.journal,
			.headline,
			.byline,
			.label,
			.old,
			.url,
			.tag-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.journal {
				font-size: 11px;
				font-weight: 800;
				letter-spacing: 0.04em;
			}

			.headline {
				font-size: 15px;
				font-weight: 800;
			}

			.byline {
				font-size: 7px;
				font-weight: 500;
				opacity: 0.8;
			}

			.label {
				font-size: 8.5px;
				font-weight: 700;
			}

			.digit {
				font-size: 12.5px;
				font-weight: 800;
			}

			.old {
				font-size: 8px;
				font-weight: 600;
				opacity: 0.55;
			}

			.url {
				font-size: 6.5px;
				opacity: 0.75;
			}

			.tag-text {
				font-size: 7px;
				font-weight: 700;
			}

			.strike {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-dasharray: var(--l);
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				text-anchor: end;
				fill: var(--ink);
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

			.travel {
				transform-box: view-box;
			}

			.scene[data-phase='out'] .placed,
			.scene[data-phase='live'] .travel,
			.scene[data-phase='live'] .rest-shadow {
				opacity: 0;
			}

			.crossed[data-mark='none'] {
				display: none;
			}

			.scene[data-phase='drop'] .travel {
				animation:
					drop 1100ms cubic-bezier(0.45, 0, 0.3, 1) both,
					gone 1ms 1100ms both;
			}

			.scene[data-phase='drop'] .rest-shadow {
				animation: gone 260ms both;
			}

			.scene[data-phase='drop'] .placed {
				animation: fade-in 1ms 1099ms both;
			}

			.scene[data-phase='drop'] .spot {
				animation: wash-in-a 520ms 1250ms ease-out both;
			}

			.scene[data-phase='live'][data-beat='odd'] {
				--sink: sink-a;
				--slide: slide-a;
				--strike: strike-a;
				--ink-in: ink-in-a;
				--wash-in: wash-in-a;
			}

			.scene[data-phase='live'][data-beat='even'] {
				--sink: sink-b;
				--slide: slide-b;
				--strike: strike-b;
				--ink-in: ink-in-b;
				--wash-in: wash-in-b;
			}

			.scene[data-phase='live'] .placed-press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.scene[data-phase='live'] .crossed {
				animation: var(--slide) 300ms 280ms cubic-bezier(0.3, 0.7, 0.4, 1) both;
			}

			.scene[data-phase='live'] .newest .strike {
				animation: var(--strike) 260ms 620ms ease-out both;
			}

			.scene[data-phase='live'] .now {
				animation: var(--ink-in) 640ms 820ms ease-out both;
			}

			.scene[data-phase='live'] .spot {
				animation: var(--wash-in) 520ms 760ms ease-out both;
			}

			.now {
				stroke: var(--sheet-ink);
				stroke-width: 0.3;
				stroke-dasharray: 46;
			}

			@keyframes drop {
				0% {
					transform: none;
				}

				16% {
					transform: translate(0, -7px) scale(1.04);
				}

				82% {
					transform: translate(var(--dx), calc(var(--dy) - 9px)) rotate(var(--turn)) scale(calc(var(--scale) * 1.04));
				}

				100% {
					transform: translate(var(--dx), var(--dy)) rotate(var(--turn)) scale(var(--scale));
				}
			}

			@keyframes gone {
				to {
					opacity: 0;
				}
			}

			@keyframes fade-in {
				from {
					opacity: 0;
				}

				to {
					opacity: 1;
				}
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

			@keyframes slide-a {
				from {
					transform: translateX(var(--step));
				}
			}

			@keyframes slide-b {
				from {
					transform: translateX(var(--step));
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

			@container anatomy (max-width: 520px) {
				.hand {
					font-size: 21px;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}

				.scene[data-phase='drop'] .travel,
				.scene[data-phase='drop'] .rest-shadow {
					opacity: 0;
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
