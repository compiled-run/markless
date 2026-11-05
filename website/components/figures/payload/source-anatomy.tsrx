// A calendar page beside its page source. Hover an element to find its HTML line and its data; press a day; switch JavaScript off and the page is still there.
import { computed, state } from '@markless/core';
import { DAYS, describeDay, JS_OFF, NOTES, START_DAY, START_SAID } from './model.ts';
import { art } from './source.art.ts';

export default function SourceAnatomy() @{
	let day = state<number>(START_DAY);
	let jsOn = state(true);
	let fetched = state(false);
	let said = state(START_SAID);
	let hover = state('');
	let touched = state(false);
	const lineOf = computed(() => (hover === 'heading' ? 1 : hover === 'booked' ? 2 : hover === 'd13' ? 3 : hover === 'd14' ? 4 : hover === 'd15' ? 5 : -1));
	const stateLit = computed(() => hover === 'booked' || hover === 'state');
	const viewLit = computed(() => hover === 'booked' || hover === 'view' || hover.startsWith('d'));
	const caption = computed(() => NOTES[hover] ?? 'Hover the page, press a day, or switch JavaScript off.');
	const pick = (next: number) => {
		touched = true;
		if (!jsOn) {
			said = JS_OFF;
			return;
		}
		const first = !fetched;
		fetched = true;
		day = next;
		said = describeDay(next, first);
	};
	const keyOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key') ?? '';

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				hover = hover === 'booked' ? '' : 'booked';
			}, 1800);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="A calendar page and its page source. Press a day to book it, or the JavaScript switch. Arrow keys pick a day, J switches JavaScript, Escape starts again."
			onClick={(event) => {
				touched = true;
				const key = keyOf(event.target);
				if (key === 'js') {
					jsOn = !jsOn;
					said = jsOn ? 'JavaScript is back on.' : JS_OFF;
				} else if (key.startsWith('d')) pick(Number(key.slice(1)));
				else if (NOTES[key]) said = NOTES[key]!;
				else pick(day === 15 ? 13 : day + 1);
			}}
			onKeyDown={(event) => {
				touched = true;
				if (event.key === 'ArrowRight') pick(day === 15 ? 13 : day + 1);
				if (event.key === 'ArrowLeft') pick(day === 13 ? 15 : day - 1);
				if (event.key === 'j' || event.key === 'J') {
					jsOn = !jsOn;
					said = jsOn ? 'JavaScript is back on.' : JS_OFF;
				}
				if (event.key === 'Escape') {
					day = START_DAY;
					jsOn = true;
					fetched = false;
					said = START_SAID;
				}
			}}
		>
			<svg
				class="scene"
				data-js={jsOn ? 'on' : 'off'}
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerover={(event) => {
					touched = true;
					const key = keyOf(event.target);
					if (key) hover = key;
				}}
				onPointerdown={(event) => {
					const key = keyOf(event.target);
					if (key) hover = key;
				}}
				onPointerleave={(event) => {
					if (event.pointerType !== 'touch') hover = '';
				}}
			>
				<path class="wash yellow js-wash" d={art.jsWash} />
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				<g class="spot-on" data-on={lineOf === 1 ? 'yes' : 'no'}><path class="wash yellow" d={art.lineSpots[1]!} /></g>
				<g class="spot-on" data-on={lineOf === 2 ? 'yes' : 'no'}><path class="wash yellow" d={art.lineSpots[2]!} /></g>
				<g class="spot-on" data-on={lineOf === 3 ? 'yes' : 'no'}><path class="wash yellow" d={art.lineSpots[3]!} /></g>
				<g class="spot-on" data-on={lineOf === 4 ? 'yes' : 'no'}><path class="wash yellow" d={art.lineSpots[4]!} /></g>
				<g class="spot-on" data-on={lineOf === 5 ? 'yes' : 'no'}><path class="wash yellow" d={art.lineSpots[5]!} /></g>
				<g class="spot-on" data-on={stateLit ? 'yes' : 'no'}><path class="wash yellow" d={art.cardSpots.state} /></g>
				<g class="spot-on" data-on={viewLit ? 'yes' : 'no'}><path class="wash yellow" d={art.cardSpots.view} /></g>
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<text class="label" x={art.js.x} y={art.js.y}>{jsOn ? 'JavaScript: on' : 'JavaScript: off'}</text>
				<text class="print" x={art.booked.x} y={art.booked.y}>Booked: March {day}</text>
				@for (const cell of art.days; key cell.key) {
					<g class="day" data-key={cell.key} data-picked={day === cell.day ? 'yes' : 'no'}>
						<path class="hit" d={cell.hit} />
						<path class="wash yellow pick" d={cell.spot} />
						<text class="print big" x={cell.x} y={cell.y}>{cell.day}</text>
					</g>
				}
				<path class="hit" data-key="heading" d={art.hits.heading} />
				<path class="hit" data-key="booked" d={art.hits.booked} />
				<path class="hit" data-key="js" d={art.hits.js} />
				<path class="hit" data-key="state" d={art.hits.state} />
				<path class="hit" data-key="view" d={art.hits.view} />
				<text class="code chunk" data-on={fetched ? 'yes' : 'no'} x={art.chunk.x} y={art.chunk.y}>↓ chunk-….js: click code, on the first click</text>
			</svg>
		</button>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of a calendar page for March, with the line Booked: March 13 and three day buttons, beside its page source.
			The source is the HTML a server sent: a heading, the Booked line, and three buttons each with an m:on attribute naming its
			handler, plus two small data blocks, markless/state with state:day = 13 and markless/view saying which element does what. Hover an
			element to light its HTML line and, if it can change, its data. Press a day, or use the arrow keys, to book it: the first press
			fetches one small chunk of click code, shown under the source. Switch JavaScript off, or press J: the page still shows everything,
			but the days stop reacting. Escape starts again.
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
				--shade-fill: color-mix(in oklch, var(--ink) 20%, transparent);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade-fill: rgb(0 0 0 / 0.5);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.kraft-fill {
				fill: color-mix(in oklch, var(--sheet) 70%, oklch(72% 0.07 65));
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.faint {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.55;
			}

			.shadow {
				fill: var(--shade-fill);
			}

			.desk-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.4;
			}

			.desk-ink {
				fill: var(--ink);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.8;
				stroke-linecap: round;
				opacity: 0.6;
			}

			.print,
			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 5px;
				font-weight: 600;
				fill: var(--sheet-ink);
			}

			.title {
				font-size: 5.6px;
				font-weight: 800;
			}

			.label {
				font-size: 4.4px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 5.4px;
				fill: var(--sheet-ink);
			}

			.pencil-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 4.6px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			.cue {
				opacity: 0;
				transition: opacity 450ms ease;
			}

			.scene[data-on='yes'] .cue {
				opacity: 1;
			}

			@container anatomy (max-width: 520px) {
				.note {
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

			.code {
				font-family: var(--font-mono);
				font-size: 4.4px;
				font-variation-settings: 'MONO' 1;
				fill: var(--sheet-ink);
			}

			.hover-caption {
				margin: 0.3rem 0 0;
				min-height: 1.4em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.95rem;
				text-align: center;
				color: var(--ink);
			}

			.hit {
				fill: transparent;
				cursor: pointer;
			}

			.url {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 9px;
				fill: var(--sheet-ink);
				opacity: 0.8;
			}

			.scene .print,
			.scene .label {
				font-size: 13px;
			}

			.scene .big {
				font-size: 20px;
			}

			.scene .title {
				font-size: 14px;
			}

			.scene .code {
				font-size: 12px;
			}

			.scene .hand {
				font-size: 14px;
			}

			.scene .pencil-text {
				font-size: 12px;
			}

			.glow,
			.spot-on {
				opacity: 0;
				transition: opacity 250ms ease;
			}

			.spot-on[data-on='yes'] {
				opacity: 0.8;
			}

			.js-wash {
				transition: opacity 250ms ease;
			}

			.scene[data-js='off'] .js-wash {
				opacity: 0;
			}

			.day {
				cursor: pointer;
			}

			.pick {
				opacity: 0;
				transition: opacity 200ms ease;
			}

			.day[data-picked='yes'] .pick {
				opacity: 1;
			}

			.scene[data-js='off'] .day {
				cursor: not-allowed;
			}

			.scene .src {
				font-size: 11px;
			}

			.scene .card-title {
				font-size: 11px;
				font-weight: 700;
			}

			.chunk {
				opacity: 0;
				transition: opacity 400ms ease;
			}

			.chunk[data-on='yes'] {
				opacity: 1;
			}

			.scene .chunk {
				font-size: 11px;
				fill: color-mix(in srgb, var(--pink) 70%, #c0403c);
			}

			.scene .big {
				font-size: 18px;
				font-weight: 800;
			}
		</style>
	</figure>
}
