// The bags jar wired into an @for list and an @if flap: press Add a bag and a row inks in for the new bag; at three bags the Free shipping flap opens.
import { computed, state } from '@markless/core';
import { addRow, BLOCKS_START, BLOCKS_TOUR, describeBlocks, flip, FREE_AT } from './model.ts';
import { art } from './blocks.art.ts';

export default function BlocksAnatomy() @{
	let bags = state(BLOCKS_START);
	let beat = state('rest');
	let touched = state(false);
	const vars = computed(() => '--cart:' + bags + ';--rows:' + bags);
	const open = computed(() => (bags >= FREE_AT ? 'yes' : 'no'));
	const falling = computed(() => art.beans[Math.max(0, Math.min(bags, art.beans.length) - 1)]!.fill);
	const fallingInk = computed(() => art.beans[Math.max(0, Math.min(bags, art.beans.length) - 1)]!.ink);
	const fallFrom = computed(() => '--drop:' + art.beans[Math.max(0, Math.min(bags, art.beans.length) - 1)]!.drop + 'px');
	const said = computed(() => describeBlocks(bags, beat !== 'rest'));

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
				const next = BLOCKS_TOUR[step % BLOCKS_TOUR.length];
				step++;
				if (next === 'add') {
					bags = addRow(bags);
					beat = flip(beat);
				}
			}, 2600);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Add a bag"
			onClick={() => {
				touched = true;
				bags = addRow(bags);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					bags = BLOCKS_START;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} data-open={open} style={vars} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
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
						<text class="shop" transform={art.page.headingMatrix}>Your cart</text>
					</g>
					<path class="sheet-ink" d={art.sheet.curl.ink} />
					<path class="sheet-ink" d={art.sheet.ink} />
				</g>

				@for (const row of art.page.rows; key row.key) {
					<g class="row" style={'--i:' + row.key}>
						<path class="sheet-ink" d={row.bullet} />
						<path class="sheet-ink thin" d={row.rule} />
						<text class="page-text row-text" transform={row.matrix}>{row.name}</text>
					</g>
				}

				<g class="flap-back">
					<path class="sheet-paper" d={art.page.flap.paper} />
					<path class="sheet-hatch" d={art.page.flap.back} />
					<path class="sheet-ink" d={art.page.flap.ink} />
				</g>
				<g class="flap-front">
					<path class="sheet-paper" d={art.page.flap.paper} />
					<path class="wash yellow" d={art.page.flap.spot.wash} />
					<path class="wash yellow pool" d={art.page.flap.spot.pool} />
					<path class="sheet-ink" d={art.page.flap.ink} />
					<text class="page-text flap-text" transform={art.page.flap.matrix}>Free shipping!</text>
				</g>
				<path class="sheet-paper" d={art.page.flap.fold} />
				<path class="sheet-ink" d={art.page.flap.foldInk} />

				<g class="press" style={art.page.button.sink}>
					<path class="sheet-hatch" d={art.page.button.side} />
					<path class="sheet-paper" d={art.page.button.paper} />
					<path class="wash pink" d={art.page.button.wash} />
					<path class="wash pink pool" d={art.page.button.pool} />
					<path class="sheet-ink" d={art.page.button.ink} />
					<text class="button-text" transform={art.page.buttonMatrix}>Add a bag</text>
					<path class="boot" d={art.page.socket.paper} />
					<path class="sheet-ink" d={art.page.socket.ink} />
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
				<path class="shadow-ink" d={art.wires.toFlap.shadow} />
				<path class="hatch deep" d={art.wires.toFlap.shadowHatch} />
				<path class="shadow-ink" d={art.wires.toRows.shadow} />
				<path class="hatch deep" d={art.wires.toRows.shadowHatch} />
				<path class="shadow-wash" d={art.wires.clips.rows.cast} />
				<path class="shadow-wash" d={art.wires.clips.flap.cast} />
				<path class="cord" d={art.wires.click.paper} />
				<path class="jar-ink" d={art.wires.click.tone} />
				<path class="jar-ink" d={art.wires.click.ink} />
				<path class="cord" d={art.wires.toFlap.paper} />
				<path class="jar-ink" d={art.wires.toFlap.tone} />
				<path class="jar-ink" d={art.wires.toFlap.ink} />
				<path class="cord" d={art.wires.toRows.paper} />
				<path class="jar-ink" d={art.wires.toRows.tone} />
				<path class="jar-ink" d={art.wires.toRows.ink} />
				<path class="boot" d={art.wires.clips.rows.boot} />
				<path class="hatch" d={art.wires.clips.rows.bootTone} />
				<path class="brass" d={art.wires.clips.rows.paper} />
				<path class="wash brass-wash" d={art.wires.clips.rows.wash} />
				<path class="hatch" d={art.wires.clips.rows.side} />
				<path class="jar-ink" d={art.wires.clips.rows.ink} />
				<path class="boot" d={art.wires.clips.flap.boot} />
				<path class="hatch" d={art.wires.clips.flap.bootTone} />
				<path class="brass" d={art.wires.clips.flap.paper} />
				<path class="wash brass-wash" d={art.wires.clips.flap.wash} />
				<path class="hatch" d={art.wires.clips.flap.side} />
				<path class="jar-ink" d={art.wires.clips.flap.ink} />

				<path class="jar-ink" d={art.wires.tags.rows.string} />
				<path class="tag-paper" d={art.wires.tags.rows.paper} />
				<path class="tag-ink" d={art.wires.tags.rows.ink} />
				<text class="tag-text" transform={art.wires.tags.rows.matrix}>@for</text>
				<path class="jar-ink" d={art.wires.tags.flap.string} />
				<path class="tag-paper" d={art.wires.tags.flap.paper} />
				<path class="tag-ink" d={art.wires.tags.flap.ink} />
				<text class="tag-text" transform={art.wires.tags.flap.matrix}>@if</text>

				<path class="pulse to-jar" d={art.wires.click.centre} style={'--len:' + art.wires.click.length} />
				<path class="pulse to-page" d={art.wires.toRows.centre} style={'--len:' + art.wires.toRows.length} />
				<path class="pulse to-page" d={art.wires.toFlap.centre} style={'--len:' + art.wires.toFlap.length} />

				<path class="pencil" d={art.jar.pencil} />
				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>WIRED BEFORE THE PAGE RAN</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper on it is drawn as a cart page at beanshop.dev: the heading Your cart, a list with
			one row per bag, a paper flap that reads Free shipping! when it is open, and a pink Add a bag button. A glass jar tagged bags
			stands beside the sheet, one bean per bag. A wire tagged @for runs from the jar to the list, and a wire tagged @if runs to the flap.
			A thin wire runs from the button back into the jar. Press the drawing, or Enter or Space, to add a bag: a bean drops in, a new row
			is inked onto the list, and at {FREE_AT} bags the flap opens. Past four bags the cart starts again from one. Escape puts it back
			to {BLOCKS_START}.
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

			.row {
				opacity: clamp(0, calc(var(--rows) - var(--i)), 1);
			}

			.scene[data-beat='odd'] .row,
			.scene[data-beat='even'] .row {
				transition: opacity 420ms 1950ms;
			}

			.flap-front {
				transform-box: fill-box;
				transform-origin: top;
				transform: scaleY(0.04);
				opacity: 0;
			}

			.flap-back {
				opacity: 1;
			}

			.scene[data-open='yes'] .flap-front {
				transform: none;
				opacity: 1;
			}

			.scene[data-open='yes'] .flap-back {
				opacity: 0;
			}

			.scene[data-beat='odd'] .flap-front,
			.scene[data-beat='even'] .flap-front {
				transition:
					transform 520ms 2000ms cubic-bezier(0.3, 0.7, 0.4, 1),
					opacity 120ms 2000ms;
			}

			.scene[data-beat='odd'] .flap-back,
			.scene[data-beat='even'] .flap-back {
				transition: opacity 120ms 2050ms;
			}

			.row-text {
				font-size: 10.5px;
			}

			.flap-text {
				text-anchor: middle;
				font-size: 11px;
				font-weight: 800;
			}

			.button-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 8.4px;
				font-weight: 700;
				text-anchor: middle;
				fill: var(--sheet-ink);
			}

			.hole-value {
				text-anchor: middle;
				font-size: 15px;
			}

			.small-value {
				font-size: 11px;
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
