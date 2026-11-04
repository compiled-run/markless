// The shop as a magazine on the desk: a click keeps the cover, swaps the centre spread, and changes the spine label once the new spread is in.
import { computed, state } from '@markless/core';
import {
	ABOUT_CAPTION,
	ABOUT_LINES,
	ABOUT_TITLE,
	ABOUT_URL,
	describeLink,
	flip,
	HOME_LINES,
	HOME_URL,
	ISSUE,
	LINK_TOUR,
	other,
	type Place,
	PRICE,
	PRODUCT,
	SHOP,
} from './model.ts';
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
			<svg class="scene" data-at={at} data-beat={beat} style={art.travel} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />

				<g class="cover once">
					<path class="sheet-paper" d={art.sheet.paper} />
					<path class="spine-paper" d={art.spine.paper} />
					<path class="sheet-hatch light" d={art.spine.tone} />
					<path class="sheet-ink" d={art.spine.ink} />
					<path class="sheet-paper" d={art.spine.label} />
					<path class="sheet-ink" d={art.spine.labelInk} />
					<text class="shop" transform={art.masthead.shopMatrix}>{SHOP}</text>
					<text class="issue" transform={art.masthead.issueMatrix}>{ISSUE}</text>
					<path class="sheet-ink" d={art.masthead.rule} />
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>

				<g class="spine-spot">
					<path class="wash yellow" d={art.spine.spot.wash} />
					<path class="wash-edge" d={art.spine.spot.edge} />
				</g>
				<text class="spine-text home" transform={art.spine.labelMatrix}>{HOME_URL}</text>
				<text class="spine-text about" transform={art.spine.labelMatrix}>{ABOUT_URL}</text>

				<g class="spread home">
					<path class="hatch deep" d={art.spread.shadow} />
					<path class="sheet-paper" d={art.spread.paper} />
					<path class="sheet-hatch light" d={art.spread.gutter} />
					<g class="spread-spot">
						<path class="wash yellow" d={art.spread.spot.wash} />
						<path class="wash yellow pool" d={art.spread.spot.pool} />
					</g>
					<path class="kraft" d={art.home.bag.paper} />
					<path class="wash kraft-wash" d={art.home.bag.wash} />
					<path class="sheet-hatch" d={art.home.bag.shade} />
					<path class="sheet-paper" d={art.home.bag.label} />
					<path class="bean-fill" d={art.home.bag.bean} />
					<path class="sheet-ink" d={art.home.bag.ink} />
					<path class="sheet-ink" d={art.home.bag.labelInk} />
					<text class="page-text" transform={art.home.productMatrix}>{PRODUCT}</text>
					<text class="price" transform={art.home.priceMatrix}>{PRICE}</text>
					<text class="page-text" transform={art.home.rightMatrices[0]}>{HOME_LINES[0]}</text>
					<text class="page-text" transform={art.home.rightMatrices[1]}>{HOME_LINES[1]}</text>
					<text class="page-text" transform={art.home.rightMatrices[2]}>{HOME_LINES[2]}</text>
					<path class="sheet-paper" d={art.spread.tab} />
					<path class="sheet-ink" d={art.spread.tabInk} />
					<path class="sheet-ink" d={art.spread.ink} />
				</g>

				<g class="spread about">
					<path class="hatch deep" d={art.spread.shadow} />
					<path class="sheet-paper" d={art.spread.paper} />
					<path class="sheet-hatch light" d={art.spread.gutter} />
					<g class="spread-spot">
						<path class="wash yellow" d={art.spread.spot.wash} />
						<path class="wash yellow pool" d={art.spread.spot.pool} />
					</g>
					<text class="title" transform={art.about.titleMatrix}>{ABOUT_TITLE}</text>
					<text class="page-text" transform={art.about.lineMatrices[0]}>{ABOUT_LINES[0]}</text>
					<text class="page-text" transform={art.about.lineMatrices[1]}>{ABOUT_LINES[1]}</text>
					<text class="page-text" transform={art.about.lineMatrices[2]}>{ABOUT_LINES[2]}</text>
					<path class="sheet-paper" d={art.about.cup.paper} />
					<path class="sheet-hatch" d={art.about.cup.shade} />
					<path class="sheet-ink" d={art.about.cup.ink} />
					<text class="page-text" transform={art.about.captionMatrix}>{ABOUT_CAPTION}</text>
					<path class="sheet-paper" d={art.spread.tab} />
					<path class="sheet-ink" d={art.spread.tabInk} />
					<path class="sheet-ink" d={art.spread.ink} />
				</g>

				<g class="tab to-shop">
					<path class="sheet-ink" d={art.nav.shop.side} />
					<g class="press" style={art.nav.shop.sink}>
						<path class="sheet-paper" d={art.nav.shop.paper} />
						<path class="wash pink" d={art.nav.shop.wash} />
						<path class="sheet-ink" d={art.nav.shop.ink} />
						<text class="button-text" transform={art.nav.shop.matrix}>Shop</text>
					</g>
				</g>
				<g class="tab to-about">
					<path class="sheet-ink" d={art.nav.about.side} />
					<g class="press" style={art.nav.about.sink}>
						<path class="sheet-paper" d={art.nav.about.paper} />
						<path class="wash pink" d={art.nav.about.wash} />
						<path class="sheet-ink" d={art.nav.about.ink} />
						<text class="button-text" transform={art.nav.about.matrix}>About</text>
					</g>
				</g>

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>THE COVER STAYS</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of the shop as a magazine lying on a desk. The cover carries the masthead {SHOP}, two nav links, Shop and
			About, and a spine whose label reads {HOME_URL}. Inside sits a loose centre spread: a bag of coffee sold as {PRODUCT} for {PRICE}.
			Press the drawing, or Enter or Space, to click the other link: the link sinks, the shop spread slides out onto the desk, the About
			spread slides in, and only once it is in does the spine label change to {ABOUT_URL}. The cover and masthead never move. Escape
			goes back to the shop.
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

			.sheet-paper {
				fill: var(--sheet);
			}

			.spine-paper {
				fill: color-mix(in oklch, var(--sheet) 78%, var(--pink));
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.sheet-hatch {
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

			.page-text,
			.shop,
			.issue,
			.title,
			.price,
			.button-text,
			.spine-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.page-text {
				font-size: 6.2px;
				font-weight: 600;
			}

			.shop {
				font-size: 17px;
				font-weight: 800;
			}

			.issue {
				font-size: 5.5px;
				font-style: italic;
				opacity: 0.8;
			}

			.title,
			.price {
				font-size: 11px;
				font-weight: 800;
			}

			.spine-text {
				font-size: 7.5px;
				font-weight: 700;
			}

			.kraft {
				fill: color-mix(in oklch, var(--sheet) 80%, oklch(72% 0.07 65));
			}

			.kraft-wash {
				fill: oklch(72% 0.07 65);
				stroke: oklch(72% 0.07 65);
				opacity: 0.35;
			}

			.button-text {
				font-size: 8.4px;
				font-weight: 700;
				text-anchor: middle;
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

			.spine-text,
			.spine-spot,
			.spread-spot,
			.tab .wash {
				transition: opacity 260ms ease;
			}

			.spine-text.about,
			.spread.about,
			.scene[data-at='about'] .spine-text.home,
			.scene[data-at='about'] .spread.home,
			.scene[data-at='about'] .to-about .wash,
			.scene[data-at='home'] .to-shop .wash {
				opacity: 0;
			}

			.scene[data-at='about'] .spine-text.about,
			.scene[data-at='about'] .spread.about {
				opacity: 1;
			}

			.scene:not([data-beat='rest']) .spine-text {
				transition-delay: 1900ms;
			}

			.spine-spot,
			.spread-spot {
				opacity: 0;
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--out: out-a;
				--in: in-a;
				--glow: glow-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--out: out-b;
				--in: in-b;
				--glow: glow-b;
			}

			.scene[data-at='about'] .to-about .press,
			.scene[data-at='home'] .to-shop .press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.scene[data-at='about'] .spread.home,
			.scene[data-at='home'] .spread.about {
				animation: var(--out) 800ms 300ms ease-in both;
			}

			.scene[data-at='about'] .spread.about,
			.scene[data-at='home'] .spread.home {
				animation: var(--in) 800ms 1100ms ease-out both;
			}

			.scene[data-beat='rest'] .spread {
				animation: none;
			}

			.scene:not([data-beat='rest']) .spine-spot,
			.scene:not([data-beat='rest']) .spread-spot {
				animation: var(--glow) 1600ms 1900ms ease-out both;
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

			@keyframes out-a {
				from {
					opacity: 1;
					transform: none;
				}
				to {
					opacity: 0;
					transform: translate(var(--away-x), var(--away-y));
				}
			}

			@keyframes out-b {
				from {
					opacity: 1;
					transform: none;
				}
				to {
					opacity: 0;
					transform: translate(var(--away-x), var(--away-y));
				}
			}

			@keyframes in-a {
				from {
					opacity: 0;
					transform: translate(var(--away-x), var(--away-y));
				}
				20% {
					opacity: 1;
				}
				to {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes in-b {
				from {
					opacity: 0;
					transform: translate(var(--away-x), var(--away-y));
				}
				20% {
					opacity: 1;
				}
				to {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes glow-a {
				0% {
					opacity: 0;
				}
				25% {
					opacity: 1;
				}
				100% {
					opacity: 0.55;
				}
			}

			@keyframes glow-b {
				0% {
					opacity: 0;
				}
				25% {
					opacity: 1;
				}
				100% {
					opacity: 0.55;
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
