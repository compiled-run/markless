// The shop page on the desk with the `cart` box and the `total` recipe: Add to cart feeds the box, and the recipe works the total out down its own wire.
import { computed, state } from '@markless/core';
import { add, CART_NEW, CART_SLOT, CART_UNIT, describeRecipe, flip, PRICE, PRODUCT, RECIPE_TOUR, SHOP, START, TOTAL_NEW, TOTAL_SLOT, totalOf } from './recipe-model.ts';
import { art } from './recipe.art.ts';

export default function RecipeAnatomy() @{
	let cart = state(START);
	let prev = state(START);
	let beat = state('rest');
	let touched = state(false);
	const total = computed(() => '$' + totalOf(cart));
	const prevTotal = computed(() => '$' + totalOf(prev));
	const unit = computed(() => (cart === 1 ? 'bag' : 'bags'));
	const said = computed(() => describeRecipe(cart, beat !== 'rest'));

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
				const next = RECIPE_TOUR[step % RECIPE_TOUR.length];
				step++;
				if (next === 'add') {
					prev = cart;
					cart = add(cart);
					beat = flip(beat);
				} else if (next === 'reset') {
					prev = START;
					cart = START;
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
				prev = cart;
				cart = add(cart);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					prev = START;
					cart = START;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="pencil" d={art.cart.pencil} />
				<path class="pencil" d={art.recipe.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.cart.cast.wash} />
				<path class="hatch deep light" d={art.cart.cast.hatch} />
				<path class="shadow-wash" d={art.recipe.cast.wash} />
				<path class="hatch deep light" d={art.recipe.cast.hatch} />

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
						<text class="price" transform={art.page.priceMatrix}>${PRICE}</text>
					</g>
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>

				<path class="sheet-ink" d={art.page.button.side} />
				<path class="hatch light" d={art.page.button.sideHatch} />
				<g class="press" style={art.page.button.sink}>
					<path class="sheet-paper" d={art.page.button.paper} />
					<path class="wash pink" d={art.page.button.wash} />
					<path class="sheet-ink" d={art.page.button.ink} />
					<text class="button-label" transform={art.page.button.matrix}>Add to cart</text>
				</g>
				<g class="cart-spot">
					<path class="wash yellow" d={art.page.cartSpot.wash} />
					<path class="wash yellow pool" d={art.page.cartSpot.pool} />
					<path class="wash-edge" d={art.page.cartSpot.edge} />
				</g>
				<g class="total-spot">
					<path class="wash yellow" d={art.page.totalSpot.wash} />
					<path class="wash yellow pool" d={art.page.totalSpot.pool} />
					<path class="wash-edge" d={art.page.totalSpot.edge} />
				</g>
				<g transform={art.page.cartMatrix}>
					<text class="page-text label">In your cart:</text>
					<g class="old cart-old">
						<text class="page-text small" x={CART_SLOT}>{prev}</text>
						<path class="strike" d={art.cartStrike.d} style={'--l:' + art.cartStrike.length} />
					</g>
					<text class="digit cart-now" x={CART_NEW}>{cart}</text>
					<text class="page-text label" x={CART_UNIT}>{unit}</text>
				</g>
				<g transform={art.page.totalMatrix}>
					<text class="page-text label">Total:</text>
					<g class="old total-old">
						<text class="page-text small" x={TOTAL_SLOT}>{prevTotal}</text>
						<path class="strike" d={art.totalStrike.d} style={'--l:' + art.totalStrike.length} />
					</g>
					<text class="digit total-now" x={TOTAL_NEW}>{total}</text>
				</g>

				<path class="shadow-ink" d={art.wires.thin.shadow} />
				<path class="hatch deep" d={art.wires.thin.shadowHatch} />
				<path class="shadow-ink" d={art.wires.cartOut.shadow} />
				<path class="hatch deep" d={art.wires.cartOut.shadowHatch} />
				<path class="shadow-ink" d={art.wires.link.shadow} />
				<path class="hatch deep" d={art.wires.link.shadowHatch} />
				<path class="shadow-ink" d={art.wires.totalOut.shadow} />
				<path class="hatch deep" d={art.wires.totalOut.shadowHatch} />
				<path class="shadow-wash" d={art.wires.cartClip.cast} />
				<path class="shadow-wash" d={art.wires.totalClip.cast} />

				<path class="box-paper" d={art.cart.paper} />
				<path class="wash kraft-wash" d={art.cart.kraft} />
				<path class="hatch" d={art.cart.shade} />
				<path class="tag-paper" d={art.cart.label} />
				<path class="tag-ink" d={art.cart.labelInk} />
				<path class="jar-ink" d={art.cart.ink} />
				<text class="count stamp-count" transform={art.cart.countMatrix}>{cart}</text>
				<path class="jar-ink" d={art.cart.tag.string} />
				<path class="tag-paper" d={art.cart.tag.paper} />
				<path class="tag-hatch" d={art.cart.tag.shade} />
				<path class="tag-ink" d={art.cart.tag.ink} />
				<text class="tag-text" transform={art.cart.tag.matrix}>cart</text>

				<path class="box-paper" d={art.recipe.paper} />
				<path class="hatch" d={art.recipe.shade} />
				<path class="tag-paper" d={art.recipe.plate} />
				<path class="tag-ink" d={art.recipe.plateInk} />
				<path class="jar-ink" d={art.recipe.ink} />
				<text class="rule-text" transform={art.recipe.ruleMatrix}>× ${PRICE}</text>
				<path class="jar-ink" d={art.recipe.tag.string} />
				<path class="tag-paper" d={art.recipe.tag.paper} />
				<path class="tag-hatch" d={art.recipe.tag.shade} />
				<path class="tag-ink" d={art.recipe.tag.ink} />
				<text class="tag-text" transform={art.recipe.tag.matrix}>total</text>

				<path class="cord" d={art.wires.thin.paper} />
				<path class="jar-ink" d={art.wires.thin.tone} />
				<path class="jar-ink" d={art.wires.thin.ink} />
				<path class="boot" d={art.wires.socket.paper} />
				<path class="jar-ink" d={art.wires.socket.ink} />
				<path class="cord" d={art.wires.link.paper} />
				<path class="jar-ink" d={art.wires.link.tone} />
				<path class="jar-ink" d={art.wires.link.ink} />
				<path class="cord" d={art.wires.cartOut.paper} />
				<path class="jar-ink" d={art.wires.cartOut.tone} />
				<path class="jar-ink" d={art.wires.cartOut.ink} />
				<path class="cord" d={art.wires.totalOut.paper} />
				<path class="jar-ink" d={art.wires.totalOut.tone} />
				<path class="jar-ink" d={art.wires.totalOut.ink} />
				<path class="boot" d={art.wires.cartClip.boot} />
				<path class="hatch" d={art.wires.cartClip.bootTone} />
				<path class="brass" d={art.wires.cartClip.paper} />
				<path class="wash brass-wash" d={art.wires.cartClip.wash} />
				<path class="hatch" d={art.wires.cartClip.side} />
				<path class="jar-ink" d={art.wires.cartClip.ink} />
				<path class="boot" d={art.wires.totalClip.boot} />
				<path class="hatch" d={art.wires.totalClip.bootTone} />
				<path class="brass" d={art.wires.totalClip.paper} />
				<path class="wash brass-wash" d={art.wires.totalClip.wash} />
				<path class="hatch" d={art.wires.totalClip.side} />
				<path class="jar-ink" d={art.wires.totalClip.ink} />

				<path class="pulse to-cart" d={art.wires.thin.centre} style={'--len:' + art.wires.thin.length} />
				<path class="pulse to-cart-line" d={art.wires.cartOut.centre} style={'--len:' + art.wires.cartOut.length} />
				<path class="pulse to-recipe" d={art.wires.link.centre} style={'--len:' + art.wires.link.length} />
				<path class="pulse to-total-line" d={art.wires.totalOut.centre} style={'--len:' + art.wires.totalOut.length} />

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>WIRED BEFORE THE PAGE RAN</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev: the shop name {SHOP}, a bag of
			coffee sold as {PRODUCT} for ${PRICE}, a pink Add to cart button, and two lines, "In your cart: {cart} {unit}" and "Total: {total}",
			each with its number in a yellow wash. Beside the sheet stand two boxes. One is tagged cart and has the count stamped on it. The
			other is tagged total and lettered "× ${PRICE}": it is the recipe. A thin wire runs from the button into the cart box. One wire runs
			from the cart box to the cart line, and another to the total box, which has its own wire to the total line. Nothing else on the
			page is wired. Press the drawing, or Enter or Space, to add a bag: the press runs into the cart box, the count goes up, and the new
			count runs to the cart line and into the recipe, which sends the new total to the total line. Escape resets.
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

			.stamp {
				transform-box: fill-box;
				transform-origin: center;
			}

			.small {
				font-size: 12px;
				font-weight: 600;
			}

			.button-label,
			.stamp-count,
			.rule-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 800;
			}

			.button-label {
				font-size: 8px;
				fill: var(--sheet-ink);
			}

			.stamp-count {
				font-size: 13px;
				text-anchor: middle;
				fill: var(--ink);
			}

			.rule-text {
				font-size: 7.5px;
				text-anchor: middle;
				fill: var(--ink);
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--travel: travel-a;
				--strike: strike-a;
				--come-cart: come-cart-a;
				--come-total: come-total-a;
				--wash-cart: wash-cart-a;
				--wash-total: wash-total-a;
				--count: count-a;
				--old: old-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--travel: travel-b;
				--strike: strike-b;
				--come-cart: come-cart-b;
				--come-total: come-total-b;
				--wash-cart: wash-cart-b;
				--wash-total: wash-total-b;
				--count: count-b;
				--old: old-b;
			}

			.press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.to-cart {
				animation: var(--travel) 700ms 300ms ease-in-out both;
			}

			.to-cart-line,
			.to-recipe {
				animation: var(--travel) 650ms 1150ms ease-in-out both;
			}

			.to-total-line {
				animation: var(--travel) 600ms 1850ms ease-in-out both;
			}

			.count {
				animation: var(--count) 3300ms linear both;
			}

			.old {
				opacity: 0;
			}

			.scene:not([data-beat='rest']) .old {
				animation: var(--old) 3300ms linear both;
			}

			.cart-old .strike {
				animation: var(--strike) 260ms 1800ms ease-out both;
			}

			.total-old .strike {
				animation: var(--strike) 260ms 2450ms ease-out both;
			}

			.cart-now {
				stroke: var(--sheet-ink);
				stroke-width: 0.3;
				stroke-dasharray: 60;
				animation: var(--come-cart) 3300ms linear both;
			}

			.total-now {
				stroke: var(--sheet-ink);
				stroke-width: 0.3;
				stroke-dasharray: 60;
				animation: var(--come-total) 3300ms linear both;
			}

			.cart-spot {
				animation: var(--wash-cart) 3300ms linear both;
			}

			.total-spot {
				animation: var(--wash-total) 3300ms linear both;
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

			@keyframes come-cart-a {
				0% {
					opacity: 1;
				}

				5%,
				57% {
					opacity: 0;
					stroke-dashoffset: 60;
					fill-opacity: 0;
				}

				58% {
					opacity: 1;
				}

				66% {
					fill-opacity: 0;
				}

				100% {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes come-cart-b {
				0% {
					opacity: 1;
				}

				5%,
				57% {
					opacity: 0;
					stroke-dashoffset: 60;
					fill-opacity: 0;
				}

				58% {
					opacity: 1;
				}

				66% {
					fill-opacity: 0;
				}

				100% {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes come-total-a {
				0% {
					opacity: 1;
				}

				5%,
				76% {
					opacity: 0;
					stroke-dashoffset: 60;
					fill-opacity: 0;
				}

				77% {
					opacity: 1;
				}

				86% {
					fill-opacity: 0;
				}

				100% {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes come-total-b {
				0% {
					opacity: 1;
				}

				5%,
				76% {
					opacity: 0;
					stroke-dashoffset: 60;
					fill-opacity: 0;
				}

				77% {
					opacity: 1;
				}

				86% {
					fill-opacity: 0;
				}

				100% {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes wash-cart-a {
				0% {
					opacity: 1;
				}

				5%,
				60% {
					opacity: 0;
				}
			}

			@keyframes wash-cart-b {
				0% {
					opacity: 1;
				}

				5%,
				60% {
					opacity: 0;
				}
			}

			@keyframes wash-total-a {
				0% {
					opacity: 1;
				}

				5%,
				80% {
					opacity: 0;
				}
			}

			@keyframes wash-total-b {
				0% {
					opacity: 1;
				}

				5%,
				80% {
					opacity: 0;
				}
			}

			@keyframes count-a {
				0% {
					opacity: 1;
				}

				4%,
				28% {
					opacity: 0;
				}

				36% {
					opacity: 1;
				}
			}

			@keyframes count-b {
				0% {
					opacity: 1;
				}

				4%,
				28% {
					opacity: 0;
				}

				36% {
					opacity: 1;
				}
			}

			@keyframes old-a {
				0%,
				4% {
					opacity: 0;
				}

				8%,
				100% {
					opacity: 0.55;
				}
			}

			@keyframes old-b {
				0%,
				4% {
					opacity: 0;
				}

				8%,
				100% {
					opacity: 0.55;
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
