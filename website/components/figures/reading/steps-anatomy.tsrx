// A card of four instructions beside the shop page: reload, and each line runs in turn, the first three leave a value on the desk, and the last puts the receipt on the page.
import { computed, state } from '@markless/core';
import { describeSteps, flip, SHOP, STEPS_TOUR } from './model.ts';
import { art } from './steps.art.ts';

export default function StepsAnatomy() @{
	let beat = state('rest');
	let touched = state(false);
	const said = computed(() => describeSteps(beat !== 'rest'));

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
				const next = STEPS_TOUR[step % STEPS_TOUR.length];
				step++;
				if (next === 'run') beat = flip(beat);
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
			aria-label="Reload the page"
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
			<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.card.cast} />
				<path class="hatch deep light" d={art.card.castHatch} />

				<g class="sheet">
					<path class="sheet-paper" d={art.sheet.paper} />
					<path class="sheet-hatch light" d={art.page.bar.tone} />
					<path class="sheet-ink" d={art.page.bar.rule} />
					<path class="sheet-ink" d={art.page.bar.dots} />
					<path class="sheet-ink" d={art.page.bar.url} />
					<text class="url" transform={art.page.bar.urlMatrix}>beanshop.dev</text>
					<g class="once">
						<text class="shop" transform={art.page.shopMatrix}>{SHOP}</text>
					</g>
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>

				<path class="sheet-ink" d={art.page.reload.side} />
				<g class="press" style={art.page.reload.sink}>
					<path class="sheet-paper" d={art.page.reload.paper} />
					<path class="wash pink" d={art.page.reload.wash} />
					<path class="sheet-ink" d={art.page.reload.ink} />
				</g>

				<g class="receipt">
					<path class="sheet-paper" d={art.page.section.paper} />
					<path class="wash yellow" d={art.page.spot.wash} />
					<path class="wash yellow pool" d={art.page.spot.pool} />
					<path class="sheet-hatch light" d={art.page.section.tone} />
					<path class="sheet-ink" d={art.page.section.ink} />
					<text class="page-text receipt-text" transform={art.page.firstMatrix}>3 bags at 14 dollars</text>
					<text class="page-text receipt-text" transform={art.page.secondMatrix}>Total: 42 dollars</text>
				</g>

				@for (const chip of art.chips; key chip.key) {
					<g class="chip" style={'--at:' + (1150 + chip.key * 450) + 'ms'}>
						<path class="shadow-wash" d={chip.cast} />
						<path class="card-paper" d={chip.paper} />
						<path class="jar-ink" d={chip.ink} />
						<text class="chip-name" transform={chip.name}>{chip.label[0]}</text>
						<text class="chip-value" transform={chip.value}>{chip.label[1]}</text>
					</g>
				}

				<path class="card-paper" d={art.card.paper} />
				<path class="rule" d={art.card.rules} />
				<path class="jar-ink" d={art.card.header} />
				<path class="jar-ink" d={art.card.ink} />
				<text class="card-title" transform={art.card.titleMatrix}>{'@{ }'}</text>
				@for (const row of art.card.lines; key row.key) {
					<g>
						<text class="card-number" transform={row.number}>{row.key + 1}</text>
						<text class="card-text" transform={row.matrix}>{row.text}</text>
						<path class="tick" d={row.tick.d} style={'--l:' + row.tick.length + ';--at:' + (1000 + row.key * 450) + 'ms'} />
					</g>
				}

				<path class="shadow-ink" d={art.wires.thin.shadow} />
				<path class="hatch deep" d={art.wires.thin.shadowHatch} />
				<path class="shadow-ink" d={art.wires.toPage.shadow} />
				<path class="hatch deep" d={art.wires.toPage.shadowHatch} />
				<path class="cord" d={art.wires.thin.paper} />
				<path class="jar-ink" d={art.wires.thin.tone} />
				<path class="jar-ink" d={art.wires.thin.ink} />
				<path class="cord" d={art.wires.toPage.paper} />
				<path class="jar-ink" d={art.wires.toPage.tone} />
				<path class="jar-ink" d={art.wires.toPage.ink} />

				<path class="pulse to-card" d={art.wires.thin.centre} style={'--len:' + art.wires.thin.length} />
				<path class="pulse to-page" d={art.wires.toPage.centre} style={'--len:' + art.wires.toPage.length} />

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>WIRED BEFORE THE PAGE RAN</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev with a pink reload button in its
			browser bar, the shop name {SHOP}, and a receipt reading "3 bags at 14 dollars, Total: 42 dollars". Beside the sheet lies an index
			card headed {'@{ }'} with four numbered lines: price is 14, bags is 3, total is price times bags, show the receipt. Three small cards
			below it hold the values the first three lines made: price 14, bags 3, total 42. A wire runs from the fourth line to the receipt.
			Press the drawing, or Enter or Space, to reload: the receipt leaves the page, the lines are ticked off one at a time from the top,
			each of the first three leaves its value card on the desk, and the last puts the receipt back on the page. Escape stops it.
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
				--bean: oklch(44% 0.08 50);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
				--shade-ink: rgb(0 0 0 / 0.85);
					--bean: oklch(48% 0.08 55);
				}
			}

			.sheet-paper,
			.tag-paper {
				fill: var(--sheet);
			}

			.sheet-ink,
			.tag-ink {
				fill: var(--sheet-ink);
			}

			.sheet-hatch,
			.tag-hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.jar-ink {
				fill: var(--ink);
			}

			.thin,
			.faint {
				opacity: 0.7;
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

			.bean-hatch {
				fill: none;
				stroke: var(--shade-ink);
				stroke-width: 0.55;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.shadow-ink {
				fill: var(--shade);
				opacity: 0.9;
			}

			.glass {
				fill: color-mix(in oklch, var(--paper) 72%, transparent);
			}

			.lid-paper,
			.cord,
			.box-paper {
				fill: var(--paper);
			}

			.brass {
				fill: var(--paper);
			}

			.bean-fill {
				fill: var(--bean);
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

			.brass-wash {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(60% 0.12 70));
				stroke: none;
				opacity: 0.8;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.page-text,
			.shop,
			.price,
			.button-text,
			.digit,
			.url,
			.tag-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.page-text,
			.shop,
			.price {
				font-size: 10px;
				font-weight: 600;
			}

			.shop {
				font-size: 14px;
				font-weight: 800;
			}

			.price {
				font-size: 15px;
				font-weight: 800;
			}

			.label {
				font-size: 12px;
				font-weight: 700;
				stroke: none;
				fill-opacity: 1;
			}

			.digit {
				font-size: 18px;
				font-weight: 800;
			}

			.badge-digit {
				font-size: 9px;
				text-anchor: middle;
			}

			.kraft {
				fill: color-mix(in oklch, var(--sheet) 80%, oklch(72% 0.07 65));
			}

			.kraft-wash {
				fill: oklch(72% 0.07 65);
				stroke: oklch(72% 0.07 65);
				opacity: 0.35;
			}

			.boot {
				fill: oklch(48% 0.15 25);

				html.dark & {
					fill: oklch(52% 0.15 25);
				}
			}

			.url {
				font-size: 6.5px;
				opacity: 0.75;
			}

			.button-text {
				font-size: 8.4px;
				font-weight: 700;
				text-anchor: middle;
			}

			.tag-text {
				font-size: 6.5px;
				font-weight: 700;
			}

			.strike {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-dasharray: var(--l);
			}

			.old {
				font-size: 12px;
				font-weight: 600;
				opacity: 0.55;
			}

			.old.small {
				font-size: 9px;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
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

			.pulse {
				fill: none;
				stroke: var(--ink);
				stroke-width: 7;
				stroke-linecap: round;
				stroke-dasharray: 3 100000;
				opacity: 0;
			}

			.card-paper {
				fill: var(--sheet);
			}

			.rule {
				fill: var(--sheet-ink);
				opacity: 0.35;
			}

			.card-title,
			.card-number,
			.card-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.card-title {
				font-size: 7.5px;
				font-weight: 800;
			}

			.card-number {
				font-size: 6px;
				font-weight: 800;
				opacity: 0.7;
			}

			.card-text {
				font-size: 6.2px;
				font-weight: 600;
			}

			.value {
				text-anchor: middle;
				font-size: 15px;
			}

			.tick {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.6;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.chip-name,
			.chip-value {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.chip-name {
				font-size: 5.6px;
				font-weight: 600;
				opacity: 0.75;
			}

			.chip-value {
				font-size: 9px;
				font-weight: 800;
			}

			.receipt-text {
				font-size: 9.5px;
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--travel: travel-a;
				--draw: draw-a;
				--show: show-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--travel: travel-b;
				--draw: draw-b;
				--show: show-b;
			}

			.press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.to-card {
				animation: var(--travel) 700ms 250ms ease-in-out both;
			}

			.tick {
				animation: var(--draw) 260ms var(--at) ease-out both;
			}

			.chip {
				animation: var(--show) 320ms var(--at) ease-out both;
			}

			.to-page {
				animation: var(--travel) 650ms 2550ms ease-in-out both;
			}

			.receipt {
				animation: var(--show) 420ms 3150ms ease-out both;
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
