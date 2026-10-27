// The bags jar wired into three holes on the shop page: press the button and its click runs into the jar, then the new value runs out into the number and the title.
import { computed, state } from '@markless/core';
import { describeValues, flip, PRICE, PRODUCT, SHOP, VALUES_START, VALUES_TOUR, nextBags } from './model.ts';
import { art } from './values.art.ts';

export default function ValuesAnatomy() @{
	let bags = state(VALUES_START);
	let beat = state('rest');
	let touched = state(false);
	const count = computed(() => '--cart:' + bags);
	const after = computed(() => bags + 1);
	const falling = computed(() => art.beans[Math.max(0, Math.min(bags, art.beans.length) - 1)]!.fill);
	const fallingInk = computed(() => art.beans[Math.max(0, Math.min(bags, art.beans.length) - 1)]!.ink);
	const fallFrom = computed(() => '--drop:' + art.beans[Math.max(0, Math.min(bags, art.beans.length) - 1)]!.drop + 'px');
	const said = computed(() => describeValues(bags, beat !== 'rest'));

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
				const next = VALUES_TOUR[step % VALUES_TOUR.length];
				step++;
				if (next === 'add') {
					bags = nextBags(bags);
					beat = flip(beat);
				} else if (next === 'reset') {
					bags = VALUES_START;
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
			aria-label="Add to cart"
			onClick={() => {
				touched = true;
				bags = nextBags(bags);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					bags = VALUES_START;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} style={count} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.jar.shadow.wash} />
				<path class="shadow-wash" d={art.jar.shadow.lidWash} />
				<path class="hatch deep light" d={art.jar.shadow.hatch} />
				<path class="hatch deep" d={art.jar.shadow.core} />
				<path class="hatch deep" d={art.jar.shadow.foot} />

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
					</g>
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>

				<path class="sheet-paper" d={art.page.flag.paper} />
				<path class="sheet-ink" d={art.page.flag.ink} />
				<text class="page-text flag-text" transform={art.page.flagMatrix}>Add bag</text>
				<path class="sheet-ink" d={art.page.titleHole.dashes} />

				<g class="press" style={art.page.button.sink}>
					<path class="sheet-hatch" d={art.page.button.side} />
					<path class="sheet-paper" d={art.page.button.paper} />
					<path class="wash pink" d={art.page.button.wash} />
					<path class="wash pink pool" d={art.page.button.pool} />
					<path class="sheet-ink" d={art.page.button.ink} />
					<path class="sheet-ink" d={art.page.textHole.dashes} />
					<text class="page-text label" transform={art.page.bagsMatrix}>bags</text>
					<path class="boot" d={art.page.socket.paper} />
					<path class="sheet-ink" d={art.page.socket.ink} />
				</g>
				<g class="spot">
					<path class="wash yellow" d={art.page.textSpot.wash} />
					<path class="wash yellow pool" d={art.page.textSpot.pool} />
					<path class="wash yellow" d={art.page.titleSpot.wash} />
					<path class="wash yellow pool" d={art.page.titleSpot.pool} />
				</g>
				<text class="digit now hole-value" transform={art.page.textMatrix}>{bags}</text>
				<text class="digit now hole-value small-value" transform={art.page.titleMatrix}>{after}</text>

				<path class="jar-ink thin" d={art.jar.backInk} />
				<path class="glass" d={art.jar.glass.paper} />
				<path class="hatch light" d={art.jar.glass.tone} />
				<g class="beans">
					@for (const bean of art.beans; key bean.key) {
						<g class="bean" style={'--i:' + bean.key}>
							<path class="bean-fill" d={bean.fill} />
							<path class="bean-hatch" d={bean.hatch} />
							<path class="jar-ink" d={bean.ink} />
						</g>
					}
				</g>
				<path class="jar-ink" d={art.jar.glass.ink} />
				<path class="jar-ink thin" d={art.jar.glass.glints} />
				<path class="lid-paper" d={art.jar.lid.paper} />
				<path class="shadow-wash" d={art.jar.lid.wash} />
				<path class="hatch" d={art.jar.lid.hatch} />
				<path class="hatch" d={art.jar.lid.cross} />
				<path class="hatch light" d={art.jar.lid.knurl} />
				<path class="jar-ink" d={art.jar.lid.ink} />
				<path class="jar-ink" d={art.jarTag.string} />
				<path class="tag-paper" d={art.jarTag.paper} />
				<path class="tag-hatch" d={art.jarTag.shade} />
				<path class="tag-ink" d={art.jarTag.ink} />
				<text class="tag-text" transform={art.jarTag.matrix}>bags</text>
				<g class="falling" style={fallFrom}>
					<path class="bean-fill" d={falling} />
					<path class="jar-ink" d={fallingInk} />
				</g>

				<path class="shadow-ink" d={art.wires.click.shadow} />
				<path class="hatch deep" d={art.wires.click.shadowHatch} />
				<path class="shadow-ink" d={art.wires.title.shadow} />
				<path class="hatch deep" d={art.wires.title.shadowHatch} />
				<path class="shadow-ink" d={art.wires.text.shadow} />
				<path class="hatch deep" d={art.wires.text.shadowHatch} />
				<path class="shadow-wash" d={art.wires.clips.text.cast} />
				<path class="shadow-wash" d={art.wires.clips.title.cast} />
				<path class="cord" d={art.wires.click.paper} />
				<path class="jar-ink" d={art.wires.click.tone} />
				<path class="jar-ink" d={art.wires.click.ink} />
				<path class="cord" d={art.wires.title.paper} />
				<path class="jar-ink" d={art.wires.title.tone} />
				<path class="jar-ink" d={art.wires.title.ink} />
				<path class="cord" d={art.wires.text.paper} />
				<path class="jar-ink" d={art.wires.text.tone} />
				<path class="jar-ink" d={art.wires.text.ink} />
				<path class="boot" d={art.wires.clips.text.boot} />
				<path class="hatch" d={art.wires.clips.text.bootTone} />
				<path class="brass" d={art.wires.clips.text.paper} />
				<path class="wash brass-wash" d={art.wires.clips.text.wash} />
				<path class="hatch" d={art.wires.clips.text.side} />
				<path class="jar-ink" d={art.wires.clips.text.ink} />
				<path class="boot" d={art.wires.clips.title.boot} />
				<path class="hatch" d={art.wires.clips.title.bootTone} />
				<path class="brass" d={art.wires.clips.title.paper} />
				<path class="wash brass-wash" d={art.wires.clips.title.wash} />
				<path class="hatch" d={art.wires.clips.title.side} />
				<path class="jar-ink" d={art.wires.clips.title.ink} />

				<path class="jar-ink" d={art.wires.tags.text.string} />
				<path class="tag-paper" d={art.wires.tags.text.paper} />
				<path class="tag-ink" d={art.wires.tags.text.ink} />
				<text class="tag-text" transform={art.wires.tags.text.matrix}>{'{bags}'}</text>
				<path class="jar-ink" d={art.wires.tags.title.string} />
				<path class="tag-paper" d={art.wires.tags.title.paper} />
				<path class="tag-ink" d={art.wires.tags.title.ink} />
				<text class="tag-text long" transform={art.wires.tags.title.matrix}>{'title={…}'}</text>
				<path class="jar-ink" d={art.wires.tags.click.string} />
				<path class="tag-paper" d={art.wires.tags.click.paper} />
				<path class="tag-ink" d={art.wires.tags.click.ink} />
				<text class="tag-text long" transform={art.wires.tags.click.matrix}>{'onClick={…}'}</text>

				<path class="pulse to-jar" d={art.wires.click.centre} style={'--len:' + art.wires.click.length} />
				<path class="pulse to-page" d={art.wires.text.centre} style={'--len:' + art.wires.text.length} />
				<path class="pulse to-page" d={art.wires.title.centre} style={'--len:' + art.wires.title.length} />

				<path class="pencil" d={art.jar.pencil} />
				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>WIRED BEFORE THE PAGE RAN</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev: {SHOP}, a bag of coffee sold as
			{PRODUCT} for {PRICE}, and a pink button reading "bags" with its number in a dashed hole. Above the button floats its title, "Add bag",
			with a second hole for the next number. A glass jar tagged bags stands beside the sheet, one bean per bag. One wire runs from the jar
			to the button's number, tagged {'{bags}'}. Another runs to the title's number, tagged {'title={…}'}. A thin wire runs from the button
			back into the jar, tagged {'onClick={…}'}. Press the drawing, or Enter or Space: the click runs into the jar, a bean drops in, and the
			new values run out into both holes. Escape puts the count back.
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
			.cord {
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

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--travel: travel-a;
				--slide: slide-a;
				--strike: strike-a;
				--ink-in: ink-in-a;
				--wash-in: wash-in-a;
				--fall: drop-a;
				--settle: settle-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--travel: travel-b;
				--slide: slide-b;
				--strike: strike-b;
				--ink-in: ink-in-b;
				--wash-in: wash-in-b;
				--fall: drop-b;
				--settle: settle-b;
			}

			.press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.to-jar {
				animation: var(--travel) 620ms 240ms ease-in-out both;
			}

			.to-page {
				animation: var(--travel) 760ms 1150ms ease-in-out both;
			}

			.hole-value {
				text-anchor: middle;
				font-size: 15px;
			}

			.small-value {
				font-size: 11px;
			}

			.tag-text.long {
				font-size: 4.6px;
			}

			.flag-text {
				font-size: 9px;
			}

			.now {
				stroke: var(--sheet-ink);
				stroke-width: 0.3;
				stroke-dasharray: 46;
				animation: var(--ink-in) 640ms 1950ms ease-out both;
			}

			.spot {
				animation: var(--wash-in) 520ms 2050ms ease-out both;
			}

			.bean {
				opacity: clamp(0, calc(var(--cart) - var(--i)), 1);
			}

			.falling {
				opacity: 0;
				animation: var(--fall) 460ms 860ms cubic-bezier(0.5, 0, 0.8, 0.6) both;
			}

			.scene[data-beat='odd'] .bean,
			.scene[data-beat='even'] .bean {
				transition: opacity 0s 1320ms;
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

			@keyframes drop-a {
				from {
					transform: translateY(var(--drop));
					opacity: 0;
				}

				20%,
				99% {
					opacity: 1;
				}

				to {
					opacity: 0;
				}
			}

			@keyframes drop-b {
				from {
					transform: translateY(var(--drop));
					opacity: 0;
				}

				20%,
				99% {
					opacity: 1;
				}

				to {
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
