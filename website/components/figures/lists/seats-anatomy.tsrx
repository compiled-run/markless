// The tasting list on the shop page: each guest's place card carries its name and its tick, and Sort walks every card to its new seat.
import { computed, state } from '@markless/core';
import { describeSeats, FIRST, flip, nameOf, nextOrder, SEATS_TOUR, seatOf, SHOP, SORTED } from './seats-model.ts';
import { art } from './seats.art.ts';

export default function SeatsAnatomy() @{
	let order = state<readonly ('grace' | 'linus' | 'ada')[]>(FIRST);
	let beat = state('rest');
	let touched = state(false);
	const graceSeat = computed(() => art.shifts[seatOf(order, 'grace')]);
	const linusSeat = computed(() => art.shifts[seatOf(order, 'linus')]);
	const adaSeat = computed(() => art.shifts[seatOf(order, 'ada')]);
	const label = computed(() => (order[0] === SORTED[0] ? 'Reverse' : 'Sort A to Z'));
	const said = computed(() => describeSeats(order, beat !== 'rest'));

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
				const next = SEATS_TOUR[step % SEATS_TOUR.length];
				step++;
				if (next === 'sort') {
					order = nextOrder(order);
					beat = flip(beat);
				}
			}, 3000);
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
				order = nextOrder(order);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					order = FIRST;
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

				<g class="sheet">
					<path class="sheet-paper" d={art.sheet.paper} />
					<path class="sheet-hatch light" d={art.page.bar.tone} />
					<path class="sheet-ink" d={art.page.bar.rule} />
					<path class="sheet-ink" d={art.page.bar.dots} />
					<path class="sheet-ink" d={art.page.bar.url} />
					<text class="url" transform={art.page.bar.urlMatrix}>beanshop.dev</text>
					<g class="once">
						<text class="shop" transform={art.page.shopMatrix}>{SHOP}</text>
						<text class="page-text head" transform={art.page.headMatrix}>Tasting table, Saturday</text>
					</g>
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>
				<path class="pencil" d={art.page.seatPencil} />
				<text class="seat-number" transform={art.page.seatNumbers[0]}>1</text>
				<text class="seat-number" transform={art.page.seatNumbers[1]}>2</text>
				<text class="seat-number" transform={art.page.seatNumbers[2]}>3</text>

				<path class="sheet-ink" d={art.page.button.side} />
				<path class="hatch light" d={art.page.button.sideHatch} />
				<g class="press" style={art.page.button.sink}>
					<path class="sheet-paper" d={art.page.button.paper} />
					<path class="wash pink" d={art.page.button.wash} />
					<path class="sheet-ink" d={art.page.button.ink} />
					<text class="button-label" transform={art.page.button.matrix}>{label}</text>
				</g>

				<g class="seat" style={graceSeat}>
					<path class="sheet-paper" d={art.cards[0].paper} />
					<path class="sheet-hatch light" d={art.cards[0].shade} />
					<path class="sheet-ink" d={art.cards[0].ink} />
					<path class="sheet-ink" d={art.cards[0].box} />
					<text class="card-name" transform={art.cards[0].nameMatrix}>{nameOf('grace')}</text>
					<text class="page-text coffee" transform={art.cards[0].coffeeMatrix}>coffee</text>
					<path class="wash yellow" d={art.cards[0].tickWash} />
					<path class="sheet-ink" d={art.cards[0].tick} />
				</g>
				<g class="seat" style={linusSeat}>
					<path class="sheet-paper" d={art.cards[1].paper} />
					<path class="sheet-hatch light" d={art.cards[1].shade} />
					<path class="sheet-ink" d={art.cards[1].ink} />
					<path class="sheet-ink" d={art.cards[1].box} />
					<text class="card-name" transform={art.cards[1].nameMatrix}>{nameOf('linus')}</text>
					<text class="page-text coffee" transform={art.cards[1].coffeeMatrix}>coffee</text>
					
					
				</g>
				<g class="seat" style={adaSeat}>
					<path class="sheet-paper" d={art.cards[2].paper} />
					<path class="sheet-hatch light" d={art.cards[2].shade} />
					<path class="sheet-ink" d={art.cards[2].ink} />
					<path class="sheet-ink" d={art.cards[2].box} />
					<text class="card-name" transform={art.cards[2].nameMatrix}>{nameOf('ada')}</text>
					<text class="page-text coffee" transform={art.cards[2].coffeeMatrix}>coffee</text>
					<path class="wash yellow" d={art.cards[2].tickWash} />
					<path class="sheet-ink" d={art.cards[2].tick} />
				</g>

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>EACH CARD KNOWS ITS GUEST</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a shop page lying on a desk: the shop name {SHOP} and
			a list headed "Tasting table, Saturday" with three numbered seats. Each seat holds a folded place card with a guest's name; Grace
			and Ada also have coffee ticked. Press the drawing, or Enter or Space, to sort: every card slides to its new seat and takes its
			own tick with it, while the seat numbers stay where they are. Escape puts them back.
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

			.button-label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 8px;
				font-weight: 800;
				fill: var(--sheet-ink);
			}

			.card-name {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 15px;
				font-weight: 800;
				fill: var(--sheet-ink);
			}

			.head {
				font-size: 13px;
				font-weight: 800;
			}

			.coffee {
				font-size: 12px;
			}

			.seat-number {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 11px;
				fill: var(--sheet-ink);
				opacity: 0.45;
			}

			.seat {
				transform: translate(var(--to-x), var(--to-y));
				transition: transform 900ms cubic-bezier(0.4, 0, 0.2, 1);
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
			}

			.press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
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
