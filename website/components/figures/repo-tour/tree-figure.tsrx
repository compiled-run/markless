// packages/ in a file explorer beside a .tsrx file and a browser: press the file and it travels compiler, bundler, web, then the page; add an import of core inside web and the explorer marks the cycle.
import { computed, state } from '@markless/core';
import { art } from './tree.art.ts';

const STOPS = art.stops.length + 1;

export default function TreeFigure() @{
	let step = state(0);
	let cycle = state(false);
	let touched = state(false);
	let said = state('');
	let hovered = state(-1);
	const hint = computed(() => (hovered >= 0 ? art.rows[hovered]!.imports : 'Hover a package to see what it imports.'));
	const dials = computed(() => '--t:' + step + ';--cy:' + (cycle ? 1 : 0));
	const trace = () => {
		step = 0;
		said = 'map.tsrx goes to the compiler.';
		const timer = setInterval(() => {
			step = step + 1;
			if (step >= STOPS) {
				clearInterval(timer);
				said = 'compiler, then bundler, then web, then the page in the browser.';
			}
		}, 650);
	};
	const flip = () => {
		cycle = !cycle;
		said = cycle ? 'web now imports core, and core imports web: a cycle.' : 'The import is gone. web imports only runtime and serializer.';
	};

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="The repo's packages folder, a .tsrx file and a browser. Enter traces the file through the packages, C adds an import of core inside web, Escape resets."
		onVisible={() => {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				step = STOPS;
				return;
			}
			const idle = setTimeout(() => {
				if (!touched) trace();
			}, 1200);
			return () => clearTimeout(idle);
		}}
		onKeyDown={(event) => {
			touched = true;
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				trace();
			} else if (event.key === 'c' || event.key === 'C') flip();
			else if (event.key === 'Escape') {
				step = 0;
				cycle = false;
				said = 'Reset.';
			}
		}}
	>
		<svg
			class="scene"
			style={dials}
			viewBox={art.view}
			aria-hidden="true"
			onClick={(event) => {
				touched = true;
				const target = event.target as Element;
				const row = target.closest('[data-row]');
				if (row) {
					if (Number(row.getAttribute('data-row')) === art.web) flip();
					return;
				}
				if (target.closest('.file')) trace();
			}}
			onPointerOver={(event) => {
				const row = (event.target as Element).closest('[data-row]');
				hovered = row ? Number(row.getAttribute('data-row')) : -1;
			}}
			onPointerLeave={() => {
				hovered = -1;
			}}
		>
			<g>
				<g>
					@for (const item of art.base.paths; key item.key) {
						<path class={item.cls} d={item.d} />
					}
				</g>
				<g>
					@for (const text of art.base.texts; key text.key) {
						<text class={text.cls} transform={text.matrix}>{text.text}</text>
					}
				</g>
			</g>
			<path class="hit file" d={art.file} />
			<g>
				@for (const stop of art.stops; key stop.key) {
					<g class="stop fade overlay" style={'--s:' + stop.key}>
						<g>
							@for (const item of stop.part.paths; key item.key) {
								<path class={item.cls} d={item.d} />
							}
						</g>
						<g>
							@for (const text of stop.part.texts; key text.key) {
								<text class={text.cls} transform={text.matrix}>{text.text}</text>
							}
						</g>
					</g>
				}
			</g>
			<g class="arrival fade overlay">
				<g>
					@for (const item of art.arrival.paths; key item.key) {
						<path class={item.cls} d={item.d} />
					}
				</g>
				<g>
					@for (const text of art.arrival.texts; key text.key) {
						<text class={text.cls} transform={text.matrix}>{text.text}</text>
					}
				</g>
			</g>
			<g class="cycle fade overlay">
				<g>
					@for (const item of art.cycle.paths; key item.key) {
						<path class={item.cls} d={item.d} />
					}
				</g>
				<g>
					@for (const text of art.cycle.texts; key text.key) {
						<text class={text.cls} transform={text.matrix}>{text.text}</text>
					}
				</g>
			</g>
			<g>
				@for (const row of art.rows; key row.key) {
					<g class="row" data-row={row.key}>
						<g class="hover fade overlay">
							<g>
								@for (const item of row.hover.paths; key item.key) {
									<path class={item.cls} d={item.d} />
								}
							</g>
							<g>
								@for (const text of row.hover.texts; key text.key) {
									<text class={text.cls} transform={text.matrix}>{text.text}</text>
								}
							</g>
						</g>
						<path class="hit" d={row.hit} />
					</g>
				}
			</g>
		</svg>
		<p class="hint" aria-hidden="true">{hint}</p>
		<figcaption class="sr">
			A pen-and-ink file explorer shows the repo's packages folder: analyzer, bundler, cli, compiler, core, headless, router, runtime, serializer, typescript-plugin, vitest-browser and web. Beside it, map.tsrx, which pins Lisbon, and a browser at localhost:3000. The file goes to compiler, then bundler, then web, and the page shows Pinned: Lisbon with a pin on a small map. Adding an import of @markless/core inside web marks web and core red: core already imports web, so that would be a cycle.
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
				user-select: none;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);
				--ok: oklch(52% 0.13 150);
				--bad: oklch(55% 0.19 25);
				--wait: oklch(68% 0.14 75);
				--kraft: color-mix(in oklch, oklch(78% 0.06 70) 70%, var(--paper));

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
					--kraft: oklch(70% 0.05 70);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.kraft {
				fill: var(--kraft);
			}

			.kraft-wash {
				fill: oklch(60% 0.08 60);
				opacity: 0.18;
			}

			.folder-fill {
				fill: color-mix(in oklch, var(--yellow) 45%, var(--sheet));
			}

			.faint {
				opacity: 0.35;
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
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					opacity: 0.32;
				}
			}

			.pen {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.halo {
				stroke: var(--sheet);
				stroke-width: 3.4;
			}

			text {
				white-space: pre;
				fill: var(--sheet-ink);
			}

			.mono,
			.dim,
			.bold {
				font-family: var(--font-mono);
				font-variation-settings: 'MONO' 1, 'CASL' 0;
				font-size: 10px;
				font-weight: 500;
			}

			.dim {
				opacity: 0.6;
			}

			.bold {
				font-weight: 800;
			}

			.small {
				font-size: 8px;
			}

			.ui,
			.big {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 11px;
			}

			.big {
				font-size: 14px;
				font-weight: 700;
			}

			.bold-ui {
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 10px;
				letter-spacing: 0.06em;
			}

			.ok-ink {
				fill: var(--ok);
			}

			.ok-wash {
				fill: var(--ok);
				opacity: 0.18;
			}

			.bad-ink,
			.bad-pen-fill {
				fill: var(--bad);
			}

			.bad-wash {
				fill: var(--bad);
				opacity: 0.18;
			}

			.bad-text {
				font-family: var(--font-mono);
				font-size: 10px;
				fill: var(--bad);
			}

			.hover-wash {
				fill: var(--yellow);
				opacity: 0.35;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.4;
				}
			}

			.swipe {
				fill: var(--yellow);
				opacity: 0.6;
				mix-blend-mode: multiply;

				html.dark & {
					opacity: 0.5;
					mix-blend-mode: normal;
				}
			}

			.hit {
				fill: transparent;
				cursor: pointer;
			}

			.fade {
				transition: opacity 160ms ease;
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

			.pink-wash {
				fill: var(--pink);
				opacity: 0.75;
			}

			.num-ring {
				font-size: 10px;
			}

			.map-fill {
				fill: color-mix(in oklch, var(--yellow) 22%, var(--sheet));
			}

			.pin-fill {
				fill: var(--pink);
			}

			.stop {
				opacity: clamp(0, var(--t) - var(--s), 1);
			}

			.arrival {
				opacity: clamp(0, var(--t) - 3, 1);
			}

			.cycle {
				opacity: var(--cy);
			}

			.bad-hand {
				fill: var(--bad);
			}

			.bad-pen-fill {
				fill: var(--bad);
			}

			.hover {
				opacity: 0;
			}

			.row:hover .hover {
				opacity: 1;
			}

			.row[data-row='11'] .hit {
				cursor: copy;
			}

			.file:hover {
				fill: color-mix(in oklch, var(--yellow) 18%, transparent);
			}

			.hint {
				margin: 0.4rem 0 0;
				min-height: 1.5em;
				font-family: var(--font-mono);
				font-size: var(--step--1, 0.85rem);
				color: color-mix(in oklch, var(--ink) 70%, transparent);
				text-align: center;
			}

			.overlay {
				pointer-events: none;
			}
		</style>
	</figure>
}
