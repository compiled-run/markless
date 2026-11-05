// The shop page with its name field under a typewriter's platen: a key strike is the browser's event, and the platen, the onInput handler, types it onto the page.
import { computed, state } from '@markless/core';
import { describeTyping, flip, NAME, press, PRICE, PRODUCT, SHOP, START, typed, TYPING_TOUR } from './typing-model.ts';
import { art } from './typing.art.ts';

export default function TypingAnatomy() @{
	let letters = state(START);
	let beat = state('rest');
	let touched = state(false);
	const name = computed(() => typed(letters));
	const struck = computed(() => NAME[letters - 1]!.toUpperCase());
	const slip = computed(() => 'input · "' + NAME[letters - 1] + '"');
	const said = computed(() => describeTyping(letters, beat !== 'rest'));

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
				const next = TYPING_TOUR[step % TYPING_TOUR.length];
				step++;
				if (next === 'key') {
					letters = press(letters);
					beat = flip(beat);
				} else if (next === 'reset') {
					letters = START;
					beat = 'rest';
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
			aria-label="Strike the next key"
			onClick={() => {
				touched = true;
				letters = press(letters);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					letters = START;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="pencil" d={art.deck.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.deck.shadow.wash} />
				<path class="hatch deep light" d={art.deck.shadow.hatch} />

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
						<text class="page-text" transform={art.page.labelMatrix}>Name on the bag</text>
					</g>
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>

				<path class="sheet-paper" d={art.page.field.paper} />
				<path class="sheet-ink" d={art.page.field.ink} />
				<g transform={art.page.field.matrix}>
					<text class="field-text live step-1">{name}</text>
				</g>
				<path class="shadow-wash" d={art.page.field.roller.cast} />
				<path class="roller" d={art.page.field.roller.paper} />
				<path class="hatch" d={art.page.field.roller.shade} />
				<path class="jar-ink" d={art.page.field.roller.ink} />
				<path class="roller" d={art.page.field.roller.knobs[0].paper} />
				<path class="hatch" d={art.page.field.roller.knobs[0].shade} />
				<path class="jar-ink" d={art.page.field.roller.knobs[0].ink} />
				<path class="roller" d={art.page.field.roller.knobs[1].paper} />
				<path class="hatch" d={art.page.field.roller.knobs[1].shade} />
				<path class="jar-ink" d={art.page.field.roller.knobs[1].ink} />
				<text class="roller-label" transform={art.page.field.roller.labelMatrix}>onInput</text>

				<path class="wash yellow" d={art.page.spot.wash} />
				<path class="wash yellow pool" d={art.page.spot.pool} />
				<g transform={art.page.previewMatrix}>
					<text class="page-text label">Preview:</text>
					<text class="digit live step-2" x="100">{name}</text>
				</g>

				<path class="deck" d={art.deck.edge} />
				<path class="hatch" d={art.deck.edgeHatch} />
				<path class="deck" d={art.deck.paper} />
				<path class="hatch light" d={art.deck.tone} />
				<path class="jar-ink" d={art.deck.ink} />
				@for (const key of art.keys; key key.letter) {
					<g class={key.letter === struck ? 'key struck' : 'key'} style={key.sink}>
						<path class="key-stem" d={key.stem} />
						<path class="hatch light" d={key.shade} />
						<path class="key-face" d={key.paper} />
						<path class="wash pink key-wash" d={key.wash} />
						<path class="jar-ink" d={key.ink} />
						<text class="key-letter" transform={key.matrix}>{key.letter}</text>
					</g>
				}

				<g class="slip">
					<path class="sheet-paper" d={art.slip.paper} />
					<path class="wash yellow" d={art.slip.wash} />
					<path class="sheet-ink" d={art.slip.ink} />
					<text class="slip-text" transform={art.slip.matrix}>{slip}</text>
				</g>

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>EACH KEY IS AN EVENT</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev: the shop name {SHOP}, a bag of
			coffee sold as {PRODUCT} for {PRICE}, a field labelled "Name on the bag" holding "{name}", and the line "Preview: {name}". A
			typewriter's roller, lettered onInput, lies across the top of the field, and the typewriter's keys stand on the desk beside the
			sheet. Press the drawing, or Enter or Space, to strike the next key: the key sinks, a slip of paper pops up saying which key it was,
			the roller types that letter into the field, and the preview follows. Nothing else on the page changes. Escape resets.
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

			.field-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 14px;
				font-weight: 700;
				fill: var(--sheet-ink);
			}

			.roller {
				fill: color-mix(in oklch, var(--ink) 18%, var(--paper));
			}

			.roller-label,
			.key-letter,
			.slip-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 800;
			}

			.roller-label {
				font-size: 9px;
				fill: var(--ink);
				letter-spacing: 0.06em;
			}

			.deck {
				fill: color-mix(in oklch, var(--ink) 30%, var(--paper));
			}

			.key-stem {
				fill: color-mix(in oklch, var(--ink) 45%, var(--paper));
			}

			.key-face {
				fill: var(--paper);
			}

			.key-letter {
				font-size: 8px;
				fill: var(--ink);
			}

			.key-wash {
				opacity: 0;
			}

			.struck .key-wash {
				opacity: 0.7;
			}

			.slip-text {
				font-size: 10px;
				fill: var(--sheet-ink);
			}

			.slip {
				opacity: 0;
			}

			.live {
				stroke: var(--sheet-ink);
				stroke-width: 0.25;
				stroke-dasharray: 60;
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--ink-in: ink-in-a;
				--pop: pop-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--ink-in: ink-in-b;
				--pop: pop-b;
			}

			.scene:not([data-beat='rest']) .struck {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.scene:not([data-beat='rest']) .slip {
				animation: var(--pop) 2400ms 200ms both;
			}

			.scene:not([data-beat='rest']) .live {
				animation: var(--ink-in) 650ms both;
			}

			.scene:not([data-beat='rest']) .step-1 {
				animation-delay: 900ms;
			}

			.scene:not([data-beat='rest']) .step-2 {
				animation-delay: 1600ms;
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

			@keyframes pop-a {
				0% {
					opacity: 0;
					transform: translateY(10px);
				}

				15%,
				75% {
					opacity: 1;
					transform: none;
				}

				100% {
					opacity: 0;
				}
			}

			@keyframes pop-b {
				0% {
					opacity: 0;
					transform: translateY(10px);
				}

				15%,
				75% {
					opacity: 1;
					transform: none;
				}

				100% {
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
