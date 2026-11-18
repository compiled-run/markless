// A guided tour of the repo: map.tsrx rides an inked route through the packages, one stop at a time, and each stop opens its real folder; side packages sit on branches off the route.
import { computed, state } from '@markless/core';
import { art } from './tour.art.ts';
import { SIDES, STOPS } from './stops.ts';

const LAST = STOPS.length - 1;

export default function TourFigure() @{
	let stop = state(0);
	let side = state(-1);
	let swipeFrom = state(-1);
	let said = state('');
	const move = computed(() => 'transform:' + art.stops[stop]!.move);
	const caption = computed(() => (side >= 0 ? SIDES[side]!.does : STOPS[stop]!.says));
	const label = computed(() => (stop === LAST ? 'Start again' : 'Next stop'));
	const go = (to: number) => {
		stop = Math.max(0, Math.min(LAST, to));
		said = 'Stop ' + (stop + 1) + ' of ' + STOPS.length + ', ' + STOPS[stop]!.name + '. ' + STOPS[stop]!.says;
	};
	const next = () => go(stop === LAST ? 0 : stop + 1);

	<figure
		class="anatomy toy tour"
		tabindex={0}
		aria-label="A tour of the repo along the route a .tsrx file takes. Right arrow or Enter goes to the next stop, left arrow goes back, Home and End jump to the ends."
		onKeyDown={(event) => {
			if ((event.target as Element).tagName === 'INPUT') return;
			if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				if (event.key === 'ArrowRight') go(stop + 1);
				else next();
			} else if (event.key === 'ArrowLeft') {
				event.preventDefault();
				go(stop - 1);
			} else if (event.key === 'Home') go(0);
			else if (event.key === 'End') go(LAST);
			else if (event.key === 'Escape') go(0);
		}}
	>
		<svg
			class="scene"
			viewBox={art.view}
			aria-hidden="true"
			onPointerDown={(event) => {
				swipeFrom = event.clientX;
			}}
			onPointerUp={(event) => {
				const dx = swipeFrom < 0 ? 0 : event.clientX - swipeFrom;
				swipeFrom = -1;
				if (dx < -40) return go(stop + 1);
				if (dx > 40) return go(stop - 1);
				const hit = (event.target as Element).closest('[data-stop]');
				if (hit) go(Number(hit.getAttribute('data-stop')));
			}}
			onPointerMove={(event) => {
				const hit = (event.target as Element).closest('[data-side]');
				side = hit ? Number(hit.getAttribute('data-side')) : -1;
			}}
			onPointerLeave={() => {
				side = -1;
				swipeFrom = -1;
			}}
		>
			<g>
				@for (const item of art.base.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
				@for (const text of art.base.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g>
				@for (const s of art.stops; key s.key) {
					<g class={'here' + (stop === s.key ? ' on' : '')}>
						@for (const item of s.here.paths; key item.key) {
							<path class={item.cls} d={item.d} />
						}
					</g>
				}
			</g>
			<g>
				@for (const s of art.stops; key s.key) {
					<g class={'panel' + (stop === s.key ? ' on' : '')}>
						<g>
							@for (const item of s.panel.paths; key item.key) {
								<path class={item.cls} d={item.d} />
							}
						</g>
						<g>
							@for (const text of s.panel.texts; key text.key) {
								<text class={text.cls} transform={text.matrix}>{text.text}</text>
							}
						</g>
					</g>
				}
			</g>
			<g class="card" style={move}>
				<g>
					@for (const item of art.card.paths; key item.key) {
						<path class={item.cls} d={item.d} />
					}
				</g>
				<g>
					@for (const text of art.card.texts; key text.key) {
						<text class={text.cls} transform={text.matrix}>{text.text}</text>
					}
				</g>
			</g>
			<g>
				@for (const s of art.stops; key s.key) {
					<path class="stop-hit" data-stop={s.key} d={s.hit} />
				}
			</g>
			<g>
				@for (const s of art.sides; key s.key) {
					<path class={'side-hit' + (side === s.key ? ' on' : '')} data-side={s.key} d={s.hit} />
				}
			</g>
		</svg>
		<div class="controls">
			<ol
				class="rail"
				aria-label="Stops"
				onClick={(event) => {
					const dot = (event.target as Element).closest('[data-dot]');
					if (dot) go(Number(dot.getAttribute('data-dot')));
				}}
			>
				@for (const s of art.stops; key s.key) {
					<li>
						<button type="button" class={'dot' + (stop === s.key ? ' on' : '')} aria-current={stop === s.key ? 'step' : 'false'} data-dot={s.key}>
							{s.name}
						</button>
					</li>
				}
			</ol>
			<button type="button" class="next" onClick={() => next()}>
				{label} ›
			</button>
		</div>
		<p class="caption">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink map of the Markless repo. An inked route runs through core, compiler, bundler, router on the server, serializer, web in the browser, runtime and the browser. A card for map.tsrx rides it, and each stop opens a panel with that package's real folder and key files. Create-markless, ui, typescript-plugin, vitest-browser and analyzer sit on branches off the route.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				border-radius: 12px;

				@media (max-width: 600px) {
					margin-inline: calc(50% - 50vw + 0.4rem);
				}
			}

			.toy:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				user-select: none;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);
				--line: color-mix(in oklch, var(--purple, oklch(60% 0.12 300)) 55%, var(--ink));

				html.dark & {
					--sheet: var(--figure-sheet);
					--shade: var(--figure-shade);
					--shade-ink: var(--figure-hatch);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.light {
				opacity: 0.55;
			}

			.hatch,
			.sheet-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.sheet-hatch {
				stroke: var(--sheet-ink);
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.pencil {
				fill: none;
				stroke: var(--pencil);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					opacity: 0.32;
				}
			}

			.route {
				fill: var(--line);
				opacity: 0.85;
			}

			.route-core {
				fill: var(--sheet);
				opacity: 0.7;
			}

			.folder-fill,
			.map-fill {
				fill: color-mix(in oklch, var(--yellow) 30%, var(--sheet));

				html.dark & {
					fill: color-mix(in oklch, var(--yellow) 30%, color-mix(in oklch, var(--cream) 50%, white));
				}
			}

			.pin-fill {
				fill: var(--pink);
			}

			.here-wash {
				fill: var(--yellow);
				opacity: 0.8;

				html.dark & {
					opacity: 1;
				}
			}

			text {
				white-space: pre;
				fill: var(--sheet-ink);
			}

			.mono,
			.bold {
				font-family: var(--font-mono);
				font-variation-settings: 'MONO' 1, 'CASL' 0;
				font-size: 10px;
				font-weight: 500;
			}

			.bold {
				font-weight: 800;
			}

			.small {
				font-size: 8.5px;
			}

			.tiny {
				font-size: 7px;
				opacity: 0.7;
			}

			.big {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 15px;
				font-weight: 700;
			}

			.hand,
			.side-label {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 10px;
				letter-spacing: 0.05em;
				opacity: 0.8;
			}

			.here,
			.panel {
				opacity: 0;
				transition: opacity 220ms ease;
				pointer-events: none;
			}

			.here.on,
			.panel.on {
				opacity: 1;
			}

			.card {
				transition: transform 520ms cubic-bezier(0.4, 0.1, 0.25, 1);
				pointer-events: none;
			}

			.stop-hit,
			.side-hit {
				fill: transparent;
				cursor: pointer;
			}

			.stop-hit:hover,
			.side-hit.on {
				fill: color-mix(in oklch, var(--yellow) 28%, transparent);

				html.dark & {
					fill: color-mix(in oklch, var(--ink) 12%, transparent);
				}
			}

			.side-hit {
				cursor: help;
			}

			.controls {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				justify-content: center;
				gap: 0.6rem 1rem;
				margin-top: 0.4rem;
			}

			.rail {
				display: flex;
				flex-wrap: wrap;
				gap: 0.25rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.dot,
			.next {
				font: 600 0.82rem/1 var(--font-mono);
				color: var(--ink);
				background: transparent;
				border: 1.5px solid color-mix(in oklch, var(--ink) 35%, transparent);
				border-radius: 999px;
				padding: 0.3em 0.6em;
				cursor: pointer;
			}

			.dot.on {
				border-color: var(--ink);
				background: color-mix(in oklch, var(--yellow) 55%, transparent);

				html.dark & {
					background: color-mix(in srgb, var(--yellow) 55%, var(--cream));
					color: var(--on-accent);
				}
			}

			.next {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 700;
				border: 2px solid var(--ink);
				border-radius: 14px 18px 12px 16px / 16px 12px 18px 14px;
				box-shadow: 1px 2px 0 var(--ink);
				padding: 0.4em 0.9em;
			}

			.next:hover {
				background: color-mix(in oklch, var(--pink) 25%, transparent);

				html.dark & {
					background: color-mix(in srgb, var(--pink) 25%, var(--cream));
					color: var(--on-accent);
				}
			}

			.next:active {
				translate: 1px 2px;
				box-shadow: none;
			}

			.dot:focus-visible,
			.next:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 2px;
			}

			.caption {
				margin: 0.6rem auto 0;
				min-height: 3em;
				max-width: 36rem;
				text-align: center;
				font-size: var(--step-0, 1rem);
				line-height: 1.45;
			}

			@media (prefers-reduced-motion: reduce) {
				.scene *,
				.card {
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
