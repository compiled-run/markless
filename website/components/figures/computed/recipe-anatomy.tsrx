// The shop page on the desk with its recipe card: Add to cart changes the cart, and the card works the total out again, one line after another.
import { computed, state } from '@markless/core';
import { add, bags, describeRecipe, flip, FREE_OVER, money, PRICE, PRODUCT, RECIPE_TOUR, SHOP, shippingOf, START, subtotalOf, totalOf } from './recipe-model.ts';
import { art } from './recipe.art.ts';

export default function RecipeAnatomy() @{
	let cart = state(START);
	let beat = state('rest');
	let touched = state(false);
	const unit = computed(() => bags(cart));
	const subtotal = computed(() => money(subtotalOf(cart)));
	const shipping = computed(() => money(shippingOf(cart)));
	const total = computed(() => money(totalOf(cart)));
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
					cart = add(cart);
					beat = flip(beat);
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
				cart = add(cart);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					cart = START;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="pencil" d={art.card.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.card.shadow.wash} />
				<path class="hatch deep light" d={art.card.shadow.hatch} />

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
				<path class="wash yellow" d={art.page.cartSpot.wash} />
				<path class="wash yellow pool" d={art.page.cartSpot.pool} />
				<path class="wash yellow" d={art.page.totalSpot.wash} />
				<path class="wash yellow pool" d={art.page.totalSpot.pool} />
				<g transform={art.page.cartMatrix}>
					<text class="page-text label">In your cart:</text>
					<text class="digit live step-0" x="96">{cart}</text>
					<text class="page-text label" x="112">{unit}</text>
				</g>
				<g transform={art.page.totalMatrix}>
					<text class="page-text label">Total:</text>
					<text class="digit live step-4" x="54">{total}</text>
				</g>

				<path class="card-paper" d={art.card.paper} />
				<path class="card-margin" d={art.card.margin} />
				<path class="jar-ink thin" d={art.card.rules} />
				<path class="hatch light" d={art.card.ear} />
				<path class="jar-ink" d={art.card.ink} />
				@for (const spot of art.card.spots; key spot.wash) {
					<g>
						<path class="wash yellow" d={spot.wash} />
						<path class="wash yellow pool" d={spot.pool} />
					</g>
				}
				<text class="card-title" transform={art.card.lines[0]}>Recipe for total</text>
				<g transform={art.card.lines[1]}>
					<text class="card-hand">{cart} {unit} × ${PRICE}</text>
				</g>
				<text class="card-value live step-1" transform={art.card.values[1]}>{subtotal}</text>
				<text class="card-hand" transform={art.card.lines[2]}>shipping, free over ${FREE_OVER}</text>
				<text class="card-value live step-2" transform={art.card.values[2]}>{shipping}</text>
				<text class="card-hand strong" transform={art.card.lines[3]}>total</text>
				<text class="card-value live step-3" transform={art.card.values[3]}>{total}</text>

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>NOBODY WRITES THE TOTAL</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev: the shop name {SHOP}, a bag of
			coffee sold as {PRODUCT} for ${PRICE}, a pink Add to cart button, the line "In your cart: {cart} {unit}" and the line "Total:
			{total}". Beside the sheet lies a ruled recipe card titled "Recipe for total" with three lines: "{cart} {unit} × ${PRICE}"
			worked out to {subtotal}, "shipping, free over ${FREE_OVER}" worked out to {shipping}, and "total" worked out to {total}. Press
			the drawing, or Enter or Space, to add a bag: the cart line changes, then each line of the card is inked in again from the top,
			and the page's total shows the card's last line. Escape resets.
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

			.button-label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 8px;
				font-weight: 800;
				fill: var(--sheet-ink);
			}

			.card-paper {
				fill: color-mix(in oklch, var(--paper) 70%, white);

				html.dark & {
					fill: color-mix(in oklch, var(--paper) 88%, var(--ink));
				}
			}

			.card-margin {
				fill: none;
				stroke: var(--pink);
				stroke-width: 1;
				opacity: 0.8;
			}

			.card-title,
			.card-hand,
			.card-value {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: oklch(32% 0.02 60);
			}

			.card-title {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 9px;
				letter-spacing: 0.1em;
				text-transform: uppercase;
			}

			.card-hand {
				font-size: 7.5px;
				font-style: italic;
			}

			.strong {
				font-weight: 800;
			}

			.card-value {
				font-size: 10px;
				font-weight: 800;
			}

			.live {
				stroke: currentColor;
				stroke-width: 0.25;
				stroke-dasharray: 60;
			}

			.digit.live {
				stroke: var(--sheet-ink);
			}

			.card-value.live {
				stroke: oklch(32% 0.02 60);
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--ink-in: ink-in-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--ink-in: ink-in-b;
			}

			.press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.scene:not([data-beat='rest']) .live {
				animation: var(--ink-in) 650ms both;
			}

			.scene:not([data-beat='rest']) .step-0 {
				animation-delay: 350ms;
			}

			.scene:not([data-beat='rest']) .step-1 {
				animation-delay: 1000ms;
			}

			.scene:not([data-beat='rest']) .step-2 {
				animation-delay: 1550ms;
			}

			.scene:not([data-beat='rest']) .step-3 {
				animation-delay: 2100ms;
			}

			.scene:not([data-beat='rest']) .step-4 {
				animation-delay: 2650ms;
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

			@keyframes ink-in-a {
				0% {
					opacity: 0;
					stroke-dashoffset: 60;
					fill-opacity: 0;
				}

				30% {
					opacity: 1;
					fill-opacity: 0;
				}

				100% {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes ink-in-b {
				0% {
					opacity: 0;
					stroke-dashoffset: 60;
					fill-opacity: 0;
				}

				30% {
					opacity: 1;
					fill-opacity: 0;
				}

				100% {
					stroke-dashoffset: 0;
					fill-opacity: 1;
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
