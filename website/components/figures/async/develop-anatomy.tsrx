// The shop page as a print developing in a darkroom tray: reload, and only the arrival date fades back to pencil, then develops while the rest of the print stays sharp.
import { computed, state } from '@markless/core';
import { ARRIVE_SLOT, ARRIVES, CHECKING, describeWait, flip, PRICE, PRODUCT, RETURNS, ROASTED, SHOP, WAIT_TOUR } from './model.ts';
import { art } from './develop.art.ts';

export default function DevelopAnatomy() @{
	let beat = state('rest');
	let touched = state(false);
	const said = computed(() => describeWait(beat !== 'rest'));

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
				const next = WAIT_TOUR[step % WAIT_TOUR.length];
				step++;
				if (next === 'reload') beat = flip(beat);
			}, 3800);
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
				<path class="shadow-wash" d={art.tray.cast} />
				<path class="tray" d={art.tray.wall} />
				<path class="hatch light" d={art.tray.wallHatch} />
				<path class="tray-floor" d={art.tray.floor} />
				<path class="wash liquid" d={art.tray.liquid} />

				<g class="sheet">
					<path class="sheet-paper" d={art.sheet.paper} />
					<path class="sheet-hatch light" d={art.page.bar.tone} />
					<path class="sheet-ink" d={art.page.bar.rule} />
					<path class="sheet-ink" d={art.page.bar.dots} />
					<path class="sheet-ink" d={art.page.bar.url} />
					<text class="url" transform={art.page.bar.urlMatrix}>beanshop.dev</text>
					<g class="once">
						<text class="shop" transform={art.page.shopMatrix}>{SHOP}</text>
						<path class="kraft" d={art.page.bag.paper} />
						<path class="wash kraft-wash" d={art.page.bag.wash} />
						<path class="sheet-hatch" d={art.page.bag.shade} />
						<path class="sheet-paper" d={art.page.bag.label} />
						<path class="bean-fill" d={art.page.bag.bean} />
						<path class="sheet-ink" d={art.page.bag.ink} />
						<path class="sheet-ink" d={art.page.bag.labelInk} />
						<text class="page-text" transform={art.page.productMatrix}>{PRODUCT}</text>
						<text class="price" transform={art.page.priceMatrix}>{PRICE}</text>
						<text class="page-text" transform={art.page.roastMatrix}>{ROASTED}</text>
						<text class="page-text" transform={art.page.returnsMatrix}>{RETURNS}</text>
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
				<g class="spot">
					<path class="wash yellow" d={art.page.spot.wash} />
					<path class="wash yellow pool" d={art.page.spot.pool} />
					<path class="wash-edge" d={art.page.spot.edge} />
				</g>
				<g transform={art.page.rowMatrix}>
					<text class="page-text label">Arrives:</text>
					<g class="waiting">
						<text class="pencil-text" x={ARRIVE_SLOT}>{CHECKING}</text>
						<path class="strike" d={art.scratch.d} style={'--l:' + art.scratch.length} />
					</g>
					<text class="digit now" x={ARRIVE_SLOT}>{ARRIVES}</text>
				</g>

				<path class="jar-ink" d={art.tray.ink} />

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>STILL DEVELOPING</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a photo print lying in a darkroom developing tray. The print is a shop page at beanshop.dev, with a pink
			reload button in its browser bar: the shop name {SHOP}, a bag of coffee sold as {PRODUCT} for {PRICE}, the line "Arrives:
			{ARRIVES}", and two plain lines, "{ROASTED}" and "{RETURNS}". Press the drawing, or Enter or Space, to reload: the date fades back
			to the pencilled words "{CHECKING}" while the rest of the print stays sharp, then the date slowly develops in again. Escape stops it.
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

			.tray {
				fill: color-mix(in oklch, var(--paper) 70%, white);

				html.dark & {
					fill: color-mix(in oklch, var(--paper) 40%, var(--ink));
				}
			}

			.tray-floor {
				fill: color-mix(in oklch, var(--paper) 82%, oklch(70% 0.04 220));
			}

			.liquid {
				fill: oklch(70% 0.05 220);
				stroke: none;
				opacity: 0.25;
			}

			.tape {
				fill: color-mix(in oklch, var(--paper) 70%, oklch(80% 0.05 80));
			}

			.pencil-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 14px;
				font-style: italic;
				fill: var(--sheet-ink);
				fill-opacity: 0.5;
			}

			.stamp-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 6px;
				letter-spacing: 0.1em;
				text-anchor: middle;
				fill: var(--sheet-ink);
			}

			.waiting {
				opacity: 0;
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--strike: strike-a;
				--wait: wait-a;
				--come: come-a;
				--wash-back: wash-back-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--strike: strike-b;
				--wait: wait-b;
				--come: come-b;
				--wash-back: wash-back-b;
			}

			.press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.waiting {
				animation: var(--wait) 3300ms linear both;
			}

			.waiting .strike {
				animation: var(--strike) 260ms 2350ms ease-out both;
			}

			.now {
				animation: var(--come) 3300ms linear both;
			}

			.spot {
				animation: var(--wash-back) 3300ms linear both;
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

			@keyframes wait-a {
				0%,
				4% {
					opacity: 0;
				}

				10%,
				82% {
					opacity: 0.9;
				}

				100% {
					opacity: 0;
				}
			}

			@keyframes wait-b {
				0%,
				4% {
					opacity: 0;
				}

				10%,
				82% {
					opacity: 0.9;
				}

				100% {
					opacity: 0;
				}
			}

			@keyframes come-a {
				0% {
					opacity: 1;
				}

				5%,
				62% {
					opacity: 0;
					fill-opacity: 0.1;
				}

				63% {
					opacity: 1;
					fill-opacity: 0.1;
				}

				100% {
					fill-opacity: 1;
				}
			}

			@keyframes come-b {
				0% {
					opacity: 1;
				}

				5%,
				62% {
					opacity: 0;
					fill-opacity: 0.1;
				}

				63% {
					opacity: 1;
					fill-opacity: 0.1;
				}

				100% {
					fill-opacity: 1;
				}
			}

			@keyframes wash-back-a {
				0% {
					opacity: 1;
				}

				5%,
				80% {
					opacity: 0;
				}
			}

			@keyframes wash-back-b {
				0% {
					opacity: 1;
				}

				5%,
				80% {
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
