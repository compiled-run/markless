// The shop page on the desk with a name field and the `name` box: each key press sends the browser's input event down the handler's wire, and only the preview follows.
import { computed, state } from '@markless/core';
import { describeTyping, flip, PREVIEW_NEW, PREVIEW_OLD, press, PRICE, PRODUCT, SHOP, START, typed, TYPING_TOUR } from './typing-model.ts';
import { art } from './typing.art.ts';

export default function TypingAnatomy() @{
	let letters = state(START);
	let prev = state(START);
	let beat = state('rest');
	let touched = state(false);
	const name = computed(() => typed(letters));
	const before = computed(() => typed(prev));
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
					prev = letters;
					letters = press(letters);
					beat = flip(beat);
				} else if (next === 'reset') {
					prev = START;
					letters = START;
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
			aria-label="Type the next letter"
			onClick={() => {
				touched = true;
				prev = letters;
				letters = press(letters);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					prev = START;
					letters = START;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="pencil" d={art.name.pencil} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="shadow-wash light" d={art.sheet.contactWash} />
				<path class="hatch deep" d={art.sheet.contact} />
				<path class="hatch deep light" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.name.cast.wash} />
				<path class="hatch deep light" d={art.name.cast.hatch} />

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
				<path class="sheet-hatch light" d={art.page.field.inset} />
				<path class="sheet-ink" d={art.page.field.ink} />
				<g transform={art.page.field.matrix}>
					<text class="field-text">{name}</text>
				</g>
				<g class="preview-spot">
					<path class="wash yellow" d={art.page.spot.wash} />
					<path class="wash yellow pool" d={art.page.spot.pool} />
					<path class="wash-edge" d={art.page.spot.edge} />
				</g>
				<g transform={art.page.previewMatrix}>
					<text class="page-text label">Preview:</text>
					<g class="old preview-old">
						<text class="page-text small" x={PREVIEW_OLD}>{before}</text>
						<path class="strike" d={art.strike.d} style={'--l:' + art.strike.length} />
					</g>
					<text class="digit preview-now" x={PREVIEW_NEW}>{name}</text>
				</g>

				<path class="shadow-ink" d={art.wires.handler.shadow} />
				<path class="hatch deep" d={art.wires.handler.shadowHatch} />
				<path class="shadow-ink" d={art.wires.out.shadow} />
				<path class="hatch deep" d={art.wires.out.shadowHatch} />
				<path class="shadow-wash" d={art.wires.clip.cast} />

				<path class="box-paper" d={art.name.paper} />
				<path class="wash kraft-wash" d={art.name.kraft} />
				<path class="hatch" d={art.name.shade} />
				<path class="tag-paper" d={art.name.label} />
				<path class="tag-ink" d={art.name.labelInk} />
				<path class="jar-ink" d={art.name.ink} />
				<text class="count stamp-count" transform={art.name.valueMatrix}>{name}</text>
				<path class="jar-ink" d={art.name.tag.string} />
				<path class="tag-paper" d={art.name.tag.paper} />
				<path class="tag-hatch" d={art.name.tag.shade} />
				<path class="tag-ink" d={art.name.tag.ink} />
				<text class="tag-text" transform={art.name.tag.matrix}>name</text>

				<path class="cord" d={art.wires.handler.paper} />
				<path class="jar-ink" d={art.wires.handler.tone} />
				<path class="jar-ink" d={art.wires.handler.ink} />
				<path class="boot" d={art.wires.socket.paper} />
				<path class="jar-ink" d={art.wires.socket.ink} />
				<path class="jar-ink" d={art.wires.slip.string} />
				<path class="tag-paper" d={art.wires.slip.paper} />
				<path class="wash pink slip-wash" d={art.wires.slip.paper} />
				<path class="tag-hatch" d={art.wires.slip.shade} />
				<path class="tag-ink" d={art.wires.slip.ink} />
				<text class="tag-text" transform={art.wires.slip.matrix}>onInput</text>
				<path class="cord" d={art.wires.out.paper} />
				<path class="jar-ink" d={art.wires.out.tone} />
				<path class="jar-ink" d={art.wires.out.ink} />
				<path class="boot" d={art.wires.clip.boot} />
				<path class="hatch" d={art.wires.clip.bootTone} />
				<path class="brass" d={art.wires.clip.paper} />
				<path class="wash brass-wash" d={art.wires.clip.wash} />
				<path class="hatch" d={art.wires.clip.side} />
				<path class="jar-ink" d={art.wires.clip.ink} />

				<path class="pulse to-name" d={art.wires.handler.centre} style={'--len:' + art.wires.handler.length} />
				<path class="pulse to-preview" d={art.wires.out.centre} style={'--len:' + art.wires.out.length} />

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>WIRED BEFORE THE PAGE RAN</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a shop page at beanshop.dev: the shop name {SHOP}, a bag of
			coffee sold as {PRODUCT} for {PRICE}, a field labelled "Name on the bag" holding "{name}", and the line "Preview: {name}" in a
			yellow wash. Beside the sheet stands a box tagged name. A wire tagged onInput runs from the field into the box, and another wire
			runs from the box to the preview. Nothing else on the page is wired. Press the drawing, or Enter or Space, to type the next letter:
			the key lands in the field, the browser's input event runs down the onInput wire into the box, and the new name runs on to the
			preview. Escape resets.
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
				font-size: 11px;
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
				--wash-cart: wash-cart-a;
				--count: count-a;
				--old: old-a;
				--flash: flash-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--travel: travel-b;
				--strike: strike-b;
				--come-cart: come-cart-b;
				--wash-cart: wash-cart-b;
				--count: count-b;
				--old: old-b;
				--flash: flash-b;
			}

			.press {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.to-name {
				animation: var(--travel) 700ms 250ms ease-in-out both;
			}

			.to-preview {
				animation: var(--travel) 650ms 1150ms ease-in-out both;
			}

			.slip-wash {
				opacity: 0;
				animation: var(--flash) 900ms ease-out both;
			}

			.scene[data-beat='rest'] .slip-wash {
				animation: none;
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

			.preview-old .strike {
				animation: var(--strike) 260ms 1800ms ease-out both;
			}

			
			.preview-now {
				stroke: var(--sheet-ink);
				stroke-width: 0.3;
				stroke-dasharray: 60;
				animation: var(--come-cart) 3300ms linear both;
			}

			.preview-spot {
				animation: var(--wash-cart) 3300ms linear both;
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

			@keyframes flash-a {
				0% {
					opacity: 0.9;
				}

				100% {
					opacity: 0;
				}
			}

			@keyframes flash-b {
				0% {
					opacity: 0.9;
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
			.field-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 12px;
				font-weight: 700;
				fill: var(--sheet-ink);
			}

			.caret {
				fill: var(--sheet-ink);
				animation: blink 1s steps(1) infinite;
			}

			@keyframes blink {
				50% {
					opacity: 0;
				}
			}

		</style>
	</figure>
}
