// A sheet of paper drawn as a shop page beside a jar of beans: wired, Add to cart redraws the two wired spots; unplugged, only the jar fills.
import { computed, state } from '@markless/core';
import { add, bags, describe, describeUnplugged, fill, flip, PRICE, PRODUCT, SHOP, SLOTS, START, TOUR } from './model.ts';
import { art } from './wired.art.ts';

export default function StateAnatomy({
	wired,
}: {
	/** Draw the jar's wires clipped to the page (default), or lying loose on the desk so the page never hears about a change. */
	readonly wired?: boolean;
}) @{
	const plugged = wired !== false;
	const first = plugged ? START : 0;
	let cart = state(first);
	let jar = state(first);
	let newest = state('');
	let beat = state('rest');
	let touched = state(false);
	const count = computed(() => '--cart:' + jar);
	const falling = computed(() => art.beans[Math.max(0, Math.min(jar, art.beans.length) - 1)]!.fill);
	const fallingInk = computed(() => art.beans[Math.max(0, Math.min(jar, art.beans.length) - 1)]!.ink);
	const fallingHatch = computed(() => art.beans[Math.max(0, Math.min(jar, art.beans.length) - 1)]!.hatch);
	const fallFrom = computed(() => '--drop:' + art.beans[Math.max(0, Math.min(jar, art.beans.length) - 1)]!.drop + 'px');
	const unit = computed(() => ' ' + bags(cart));
	const said = computed(() => (plugged ? describe(cart, beat !== 'rest') : describeUnplugged(jar, beat !== 'rest')));

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (!plugged || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
				if (next === 'add') {
					newest = String(cart);
					cart = add(cart);
					jar = cart;
					beat = flip(beat);
				} else if (next === 'reset') {
					cart = START;
					jar = START;
					newest = '';
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
				if (plugged) {
					newest = String(cart);
					cart = add(cart);
					jar = cart;
					beat = flip(beat);
				} else {
					jar = fill(jar);
					beat = jar === 0 ? 'rest' : flip(beat);
				}
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					cart = 0;
					jar = 0;
					newest = '';
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} data-wired={plugged ? 'yes' : 'no'} style={count} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
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
						<path class="sheet-ink" d={art.page.cart} />
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

				<g class="run">
					<g class="press" style={art.page.button.sink}>
						<path class="sheet-hatch" d={art.page.button.side} />
						<path class="sheet-paper" d={art.page.button.paper} />
						<path class="wash pink" d={art.page.button.wash} />
						<path class="wash pink pool" d={art.page.button.pool} />
						<path class="sheet-ink" d={art.page.button.ink} />
						<text class="button-text" transform={art.page.button.matrix}>Add to cart</text>
					</g>
					<g class="spot">
						<path class="sheet-paper" d={art.page.badge.paper} />
						<path class="wash yellow" d={art.page.badge.wash} />
						<path class="wash yellow" d={art.page.spot.wash} />
						<path class="wash yellow pool" d={art.page.spot.pool} />
						<path class="wash-edge" d={art.page.spot.edge} />
					</g>
					<path class="sheet-ink" d={art.page.badge.ink} />
					<g transform={art.page.badge.oldMatrix}>
						<g class="crossed newest" data-mark={newest === '' ? 'none' : 'new'} style="--step:0px">
							<text class="digit old small" x="0">{newest}</text>
							<path class="strike" d={art.strikes.badge.d} style={'--l:' + art.strikes.badge.length} />
						</g>
					</g>
					<text class="digit now badge-digit" transform={art.page.badge.matrix}>{cart}</text>
					<g transform={art.page.rowMatrix}>
						<text class="page-text label">In your cart:</text>
						<g class="crossed newest" data-mark={newest === '' ? 'none' : 'new'} style={'--step:' + (SLOTS[1] - SLOTS[0]) + 'px'}>
							<text class="digit old" x={SLOTS[0]}>{newest}</text>
							<path class="strike" d={art.strikes.line.d} style={'--l:' + art.strikes.line.length} />
						</g>
						<text class="digit now" x={SLOTS[1]}>
							{cart}
							<tspan class="page-text label">{unit}</tspan>
						</text>
					</g>
				</g>

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

				<path class="jar-ink" d={art.tag.string} />
				<path class="tag-paper" d={art.tag.paper} />
				<path class="tag-hatch" d={art.tag.shade} />
				<path class="tag-ink" d={art.tag.ink} />
				<text class="tag-text" transform={art.tag.matrix}>cart</text>
				<g class="falling" style={fallFrom}>
					<path class="bean-fill" d={falling} />
					<path class="bean-hatch" d={fallingHatch} />
					<path class="jar-ink" d={fallingInk} />
				</g>

				<path class="shadow-ink" d={art.wires.thin.shadow} />
				<path class="hatch deep" d={art.wires.thin.shadowHatch} />
				@if (plugged) {
					<>
						<path class="shadow-ink" d={art.wires.main.shadow} />
						<path class="hatch deep" d={art.wires.main.shadowHatch} />
						<path class="shadow-ink" d={art.wires.branch.shadow} />
						<path class="hatch deep" d={art.wires.branch.shadowHatch} />
						<path class="shadow-wash" d={art.wires.clips.badge.cast} />
						<path class="shadow-wash" d={art.wires.clips.line.cast} />
					</>
				} @else {
					<>
						<path class="shadow-ink" d={art.loose.main.shadow} />
						<path class="hatch deep" d={art.loose.main.shadowHatch} />
						<path class="shadow-ink" d={art.loose.branch.shadow} />
						<path class="hatch deep" d={art.loose.branch.shadowHatch} />
						<path class="shadow-wash" d={art.loose.clips.badge.cast} />
						<path class="shadow-wash" d={art.loose.clips.line.cast} />
					</>
				}
				<path class="cord" d={art.wires.thin.paper} />
				<path class="jar-ink" d={art.wires.thin.tone} />
				<path class="jar-ink" d={art.wires.thin.ink} />
				@if (plugged) {
					<>
						<path class="cord" d={art.wires.branch.paper} />
						<path class="jar-ink" d={art.wires.branch.tone} />
						<path class="jar-ink" d={art.wires.branch.ink} />
						<path class="cord" d={art.wires.main.paper} />
						<path class="jar-ink" d={art.wires.main.tone} />
						<path class="jar-ink" d={art.wires.main.ink} />
						<path class="boot" d={art.wires.splice.paper} />
						<path class="jar-ink" d={art.wires.splice.ink} />
						<path class="boot" d={art.wires.clips.badge.boot} />
						<path class="hatch" d={art.wires.clips.badge.bootTone} />
						<path class="brass" d={art.wires.clips.badge.paper} />
						<path class="wash brass-wash" d={art.wires.clips.badge.wash} />
						<path class="hatch" d={art.wires.clips.badge.side} />
						<path class="jar-ink" d={art.wires.clips.badge.ink} />
						<path class="boot" d={art.wires.clips.line.boot} />
						<path class="hatch" d={art.wires.clips.line.bootTone} />
						<path class="brass" d={art.wires.clips.line.paper} />
						<path class="wash brass-wash" d={art.wires.clips.line.wash} />
						<path class="hatch" d={art.wires.clips.line.side} />
						<path class="jar-ink" d={art.wires.clips.line.ink} />

						<g class="run">
							<path class="pulse to-jar" d={art.wires.thin.centre} style={'--len:' + art.wires.thin.length} />
							<path class="pulse to-page" d={art.wires.main.centre} style={'--len:' + art.wires.main.length} />
							<path class="pulse to-page" d={art.wires.toLine.d} style={'--len:' + art.wires.toLine.length} />
						</g>
					</>
				} @else {
					<>
						<path class="cord" d={art.loose.branch.paper} />
						<path class="jar-ink" d={art.loose.branch.tone} />
						<path class="jar-ink" d={art.loose.branch.ink} />
						<path class="cord" d={art.loose.main.paper} />
						<path class="jar-ink" d={art.loose.main.tone} />
						<path class="jar-ink" d={art.loose.main.ink} />
						<path class="boot" d={art.loose.splice.paper} />
						<path class="jar-ink" d={art.loose.splice.ink} />
						<path class="boot" d={art.loose.clips.badge.boot} />
						<path class="hatch" d={art.loose.clips.badge.bootTone} />
						<path class="brass" d={art.loose.clips.badge.paper} />
						<path class="wash brass-wash" d={art.loose.clips.badge.wash} />
						<path class="hatch" d={art.loose.clips.badge.side} />
						<path class="jar-ink" d={art.loose.clips.badge.ink} />
						<path class="boot" d={art.loose.clips.line.boot} />
						<path class="hatch" d={art.loose.clips.line.bootTone} />
						<path class="brass" d={art.loose.clips.line.paper} />
						<path class="wash brass-wash" d={art.loose.clips.line.wash} />
						<path class="hatch" d={art.loose.clips.line.side} />
						<path class="jar-ink" d={art.loose.clips.line.ink} />

						<g class="run">
							<path class="pulse to-jar" d={art.wires.thin.centre} style={'--len:' + art.wires.thin.length} />
						</g>
					</>
				}

				<path class="pencil" d={art.jar.pencil} />
				<path class="jar-ink" d={art.notes.wiredArrow} />
				<text class="hand" x={art.notes.wired.x} y={art.notes.wired.y}>{plugged ? 'WIRED BEFORE THE PAGE RAN' : 'NOT WIRED'}</text>
			</svg>
		</button>
		<figcaption class="sr">
			@if (plugged) {
				<span>
				A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev: the shop name {SHOP}, a
				cart icon with a count badge, a bag of coffee beans sold as {PRODUCT} for {PRICE}, a pink Add to cart button, and the line
				"In your cart" with the count in a yellow wash. Beside the sheet stands a glass jar tagged cart, one bean per bag. A wire
				runs from the jar's lid to a clip on the cart badge, with a branch to a clip on the cart line; a thin wire runs from the
				button back to the jar.
				Nothing else on the page is wired. Press the drawing, or Enter or Space, to add a bag: a bean drops into the jar and both
				wired counts are crossed out and rewritten together. Escape empties the cart.
				</span>
			} @else {
				<span>
				A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev: the shop name {SHOP}, a
				cart icon with a count badge showing 0, a bag of coffee beans sold as {PRODUCT} for {PRICE}, a pink Add to cart button,
				and the line "In your cart: 0 bags". Beside the sheet stands a glass jar tagged cart, one bean per bag. A thin wire runs
				from the button into the jar. Two more wires come out of the jar's lid, but they lie loose on the desk, their clips
				resting short of the page: nothing on the page is wired. Press the drawing, or Enter or Space, to add a bag: a bean drops
				into the jar, but the badge and the cart line still say 0. Escape empties the jar.
				</span>
			}
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

			.scene[data-wired='no'][data-beat] {
				--slide: none;
				--strike: none;
				--ink-in: none;
				--wash-in: none;
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

			.crossed {
				animation: var(--slide) 300ms 2250ms cubic-bezier(0.3, 0.7, 0.4, 1) both;
			}

			.crossed[data-mark='none'] {
				display: none;
			}

			.newest .strike {
				animation: var(--strike) 260ms 1950ms ease-out both;
			}

			.now {
				stroke: var(--sheet-ink);
				stroke-width: 0.3;
				stroke-dasharray: 46;
				animation: var(--ink-in) 640ms 2300ms ease-out both;
			}

			.spot {
				animation: var(--wash-in) 520ms 2400ms ease-out both;
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
