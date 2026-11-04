// The shop page on the desk with the next-page parcel: a click sends for the next page's middle, and only that part and the address change, together.
import { computed, state } from '@markless/core';
import { ABOUT_LINES, ABOUT_TITLE, ABOUT_URL, describeLink, flip, HOME_URL, LINK_TOUR, other, type Place, PRICE, PRODUCT, SHOP } from './model.ts';
import { art } from './links.art.ts';

export default function LinkAnatomy() @{
	let at = state<Place>('home');
	let beat = state('rest');
	let touched = state(false);
	const said = computed(() => describeLink(at, beat !== 'rest'));
	const go = () => {
		at = other(at);
		beat = flip(beat);
	};

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
				const next = LINK_TOUR[step % LINK_TOUR.length];
				step++;
				if (next === 'go') go();
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
			aria-label="Click the other nav link"
			onClick={() => {
				touched = true;
				go();
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					at = 'home';
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-at={at} data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="pencil" d={art.parcel.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.parcel.cast.wash} />
				<path class="hatch deep light" d={art.parcel.cast.hatch} />

				<g class="sheet">
					<path class="sheet-paper" d={art.sheet.paper} />
					<path class="sheet-hatch light" d={art.page.bar.tone} />
					<path class="sheet-ink" d={art.page.bar.rule} />
					<path class="sheet-ink" d={art.page.bar.dots} />
					<path class="sheet-ink" d={art.page.bar.url} />
					<g class="once">
						<text class="shop" transform={art.page.shopMatrix}>{SHOP}</text>
						<path class="pencil" d={art.page.area.pencil} />
					</g>
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>

				<g class="spot url-spot">
					<path class="wash yellow" d={art.page.urlSpot.wash} />
					<path class="wash-edge" d={art.page.urlSpot.edge} />
				</g>
				<text class="url home" transform={art.page.bar.urlMatrix}>{HOME_URL}</text>
				<text class="url about" transform={art.page.bar.urlMatrix}>{ABOUT_URL}</text>

				<g class="spot area-spot">
					<path class="wash yellow" d={art.page.areaSpot.wash} />
					<path class="wash yellow pool" d={art.page.areaSpot.pool} />
					<path class="wash-edge" d={art.page.areaSpot.edge} />
				</g>
				<g class="area home">
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
				<g class="area about">
					<text class="title" transform={art.page.aboutMatrices[0]}>{ABOUT_TITLE}</text>
					<text class="page-text" transform={art.page.aboutMatrices[1]}>{ABOUT_LINES[0]}</text>
					<text class="page-text" transform={art.page.aboutMatrices[2]}>{ABOUT_LINES[1]}</text>
				</g>

				<g class="tab to-shop">
					<path class="sheet-ink" d={art.page.nav.shop.side} />
					<g class="press" style={art.page.nav.shop.sink}>
						<path class="sheet-paper" d={art.page.nav.shop.paper} />
						<path class="wash pink" d={art.page.nav.shop.wash} />
						<path class="sheet-ink" d={art.page.nav.shop.ink} />
						<text class="button-text" transform={art.page.nav.shop.matrix}>Shop</text>
					</g>
				</g>
				<g class="tab to-about">
					<path class="sheet-ink" d={art.page.nav.about.side} />
					<g class="press" style={art.page.nav.about.sink}>
						<path class="sheet-paper" d={art.page.nav.about.paper} />
						<path class="wash pink" d={art.page.nav.about.wash} />
						<path class="sheet-ink" d={art.page.nav.about.ink} />
						<text class="button-text" transform={art.page.nav.about.matrix}>About</text>
					</g>
				</g>

				<path class="shadow-ink" d={art.wires.thin.shadow} />
				<path class="hatch deep" d={art.wires.thin.shadowHatch} />
				<path class="shadow-ink" d={art.wires.main.shadow} />
				<path class="hatch deep" d={art.wires.main.shadowHatch} />
				<path class="shadow-wash" d={art.wires.clip.cast} />

				<path class="box-paper" d={art.parcel.paper} />
				<path class="hatch" d={art.parcel.shade} />
				<path class="tape" d={art.parcel.tape} />
				<path class="hatch light" d={art.parcel.tapeHatch} />
				<path class="tag-paper" d={art.parcel.label} />
				<path class="tag-ink" d={art.parcel.labelInk} />
				<path class="jar-ink" d={art.parcel.ink} />
				<path class="jar-ink" d={art.parcel.tag.string} />
				<path class="tag-paper" d={art.parcel.tag.paper} />
				<path class="tag-hatch" d={art.parcel.tag.shade} />
				<path class="tag-ink" d={art.parcel.tag.ink} />
				<text class="tag-text" transform={art.parcel.tag.matrix}>next page</text>

				<path class="cord" d={art.wires.thin.paper} />
				<path class="jar-ink" d={art.wires.thin.tone} />
				<path class="jar-ink" d={art.wires.thin.ink} />
				<path class="boot" d={art.wires.socket.paper} />
				<path class="jar-ink" d={art.wires.socket.ink} />
				<path class="cord" d={art.wires.main.paper} />
				<path class="jar-ink" d={art.wires.main.tone} />
				<path class="jar-ink" d={art.wires.main.ink} />
				<path class="boot" d={art.wires.clip.boot} />
				<path class="hatch" d={art.wires.clip.bootTone} />
				<path class="brass" d={art.wires.clip.paper} />
				<path class="wash brass-wash" d={art.wires.clip.wash} />
				<path class="hatch" d={art.wires.clip.side} />
				<path class="jar-ink" d={art.wires.clip.ink} />

				<path class="pulse to-parcel" d={art.wires.thin.centre} style={'--len:' + art.wires.thin.length} />
				<path class="pulse to-page" d={art.wires.main.centre} style={'--len:' + art.wires.main.length} />

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>THE PAGE YOU'RE ON STAYS</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at {HOME_URL}: the shop name {SHOP}, two nav
			links, Shop and About, and in the middle a bag of coffee sold as {PRODUCT} for {PRICE}, ringed in pencil. Beside the sheet sits a
			parcel tagged next page. A thin wire runs from the nav to the parcel, and a wire runs from the parcel to a clip on the middle of the
			page. Press the drawing, or Enter or Space, to click the other link: the link sinks, the request runs to the parcel, the next page's
			middle runs back down the wire, and only then do the middle of the page and the address change, together. The shop name, the nav and
			the rest of the sheet stay as they are. Escape goes back to the shop.
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
				--swap: 2400ms;

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

			.shadow-ink {
				fill: var(--shade);
				opacity: 0.9;
			}

			.cord,
			.box-paper,
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
			.title,
			.price,
			.button-text,
			.url,
			.tag-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.page-text {
				font-size: 10px;
				font-weight: 600;
			}

			.shop {
				font-size: 14px;
				font-weight: 800;
			}

			.title {
				font-size: 15px;
				font-weight: 800;
			}

			.price {
				font-size: 15px;
				font-weight: 800;
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
				opacity: 0.85;
			}

			.button-text {
				font-size: 8.4px;
				font-weight: 700;
				text-anchor: middle;
			}

			.tag-text {
				font-size: 6px;
				font-weight: 700;
			}

			.tape {
				fill: color-mix(in oklch, var(--paper) 70%, oklch(80% 0.05 80));
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

			.area,
			.url,
			.spot,
			.tab .wash {
				transition: opacity 320ms ease var(--swap);
			}

			.area.about,
			.url.about,
			.scene[data-at='about'] .area.home,
			.scene[data-at='about'] .url.home,
			.scene[data-at='about'] .to-about .wash,
			.scene[data-at='home'] .to-shop .wash {
				opacity: 0;
			}

			.scene[data-at='about'] .area.about,
			.scene[data-at='about'] .url.about {
				opacity: 1;
			}

			.scene[data-beat='rest'] .spot {
				opacity: 0.35;
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--travel: travel-a;
				--glow: glow-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--travel: travel-b;
				--glow: glow-b;
			}

			.scene[data-at='about'] .to-about .press,
			.scene[data-at='home'] .to-shop .press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.to-parcel {
				animation: var(--travel) 800ms 300ms ease-in-out both;
			}

			.to-page {
				animation: var(--travel) 800ms 1500ms ease-in-out both;
			}

			.spot {
				animation: var(--glow) 1400ms var(--swap) ease-out both;
			}

			@keyframes sink-a {
				40% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes sink-b {
				40% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes travel-a {
				0% {
					opacity: 1;
					stroke-dashoffset: 0;
				}
				90% {
					opacity: 1;
				}
				100% {
					opacity: 0;
					stroke-dashoffset: calc(var(--len) * -1);
				}
			}

			@keyframes travel-b {
				0% {
					opacity: 1;
					stroke-dashoffset: 0;
				}
				90% {
					opacity: 1;
				}
				100% {
					opacity: 0;
					stroke-dashoffset: calc(var(--len) * -1);
				}
			}

			@keyframes glow-a {
				0% {
					opacity: 0.35;
				}
				30% {
					opacity: 1;
				}
				100% {
					opacity: 0.6;
				}
			}

			@keyframes glow-b {
				0% {
					opacity: 0.35;
				}
				30% {
					opacity: 1;
				}
				100% {
					opacity: 0.6;
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
