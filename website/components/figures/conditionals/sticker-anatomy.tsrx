// The shop page on the desk with a sticker sheet: at three bags the Free shipping sticker is pressed onto the order; below three it is back on its backing and the order is plain paper.
import { computed, state } from '@markless/core';
import { add, bags, BRANCH_TOUR, describeBranch, flip, free, PERK, PRICE, PRODUCT, SHOP, START } from './branch-model.ts';
import { art } from './sticker.art.ts';

export default function StickerAnatomy() @{
	let cart = state(START);
	let beat = state('rest');
	let touched = state(false);
	const unit = computed(() => bags(cart));
	const shipping = computed(() => free(cart));
	const said = computed(() => describeBranch(cart, beat !== 'rest'));

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
				const next = BRANCH_TOUR[step % BRANCH_TOUR.length];
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
				<path class="pencil" d={art.backing.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.backing.shadow.wash} />
				<path class="hatch deep light" d={art.backing.shadow.hatch} />

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
				<g transform={art.page.cartMatrix}>
					<text class="page-text label">In your cart:</text>
					<text class="digit live step-0" x="96">{cart}</text>
					<text class="page-text label" x="112">{unit}</text>
				</g>
				@if (shipping) {
					<g class="sticker pressed">
						<path class="shadow-wash" d={art.page.sticker.lift} />
						<path class="sticker-paper" d={art.page.sticker.paper} />
						<path class="wash yellow" d={art.page.sticker.wash} />
						<path class="sheet-ink" d={art.page.sticker.ink} />
						<text class="sticker-text" transform={art.page.sticker.matrix}>{PERK}</text>
					</g>
				}

				<path class="backing-paper" d={art.backing.paper} />
				<path class="hatch light" d={art.backing.gloss} />
				<path class="jar-ink" d={art.backing.ink} />
				<path class="jar-ink thin" d={art.backing.slot} />
				<text class="backing-label" transform={art.backing.labelMatrix}>stickers</text>
				@if (!shipping) {
					<g class="sticker">
						<path class="sticker-paper" d={art.backing.sticker.paper} />
						<path class="wash yellow" d={art.backing.sticker.wash} />
						<path class="jar-ink" d={art.backing.sticker.ink} />
						<text class="sticker-text on-desk" transform={art.backing.sticker.matrix}>{PERK}</text>
					</g>
				}

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>PEELED OFF, NOT COVERED</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev: the shop name {SHOP}, a bag of
			coffee sold as {PRODUCT} for {PRICE}, a pink Add to cart button and the line "In your cart: {cart} {unit}". Beside the sheet lies
			a sticker sheet holding a yellow "{PERK}" sticker. Press the drawing, or Enter or Space, to add a bag: at three bags the sticker is
			peeled off its backing and pressed onto the order; when the cart starts again at one, it goes back on the backing and the order
			under it is plain paper. Escape resets.
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

			.backing-paper {
				fill: color-mix(in oklch, var(--paper) 60%, white);

				html.dark & {
					fill: color-mix(in oklch, var(--paper) 30%, var(--ink));
				}
			}

			.sticker-paper {
				fill: var(--sheet);
			}

			.sticker-text,
			.backing-label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 800;
			}

			.sticker-text {
				font-size: 13px;
				fill: var(--sheet-ink);
			}

			.on-desk {
				font-size: 10px;
			}

			.backing-label {
				font-size: 8px;
				font-style: italic;
				fill: var(--ink);
				opacity: 0.7;
			}

			.pressed {
				transform-box: fill-box;
				transform-origin: center;
			}

			.scene:not([data-beat='rest']) .pressed {
				animation: var(--press-on) 700ms 400ms both;
			}

			.scene:not([data-beat='rest']) .sticker:not(.pressed) {
				animation: var(--settle) 500ms 300ms both;
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
				stroke: var(--sheet-ink);
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--ink-in: ink-in-a;
				--press-on: press-on-a;
				--settle: settle-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--ink-in: ink-in-b;
				--press-on: press-on-b;
				--settle: settle-b;
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

			@keyframes press-on-a {
				0% {
					opacity: 0;
					transform: translate(40px, -30px) rotate(-4deg) scale(1.08);
				}

				60% {
					opacity: 1;
					transform: translate(0, -3px) scale(1.03);
				}

				100% {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes press-on-b {
				0% {
					opacity: 0;
					transform: translate(40px, -30px) rotate(-4deg) scale(1.08);
				}

				60% {
					opacity: 1;
					transform: translate(0, -3px) scale(1.03);
				}

				100% {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes settle-a {
				0% {
					opacity: 0;
				}

				100% {
					opacity: 1;
				}
			}

			@keyframes settle-b {
				0% {
					opacity: 0;
				}

				100% {
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
