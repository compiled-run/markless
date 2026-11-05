// node_modules/@markless/ in a file explorer: run npm install and the packages land in dependency order; delete one and every package that needs it turns red.
import { computed, state } from '@markless/core';
import { art } from './packages.art.ts';

const ALL = art.rows.length;

export default function PackagesFigure() @{
	let installed = state(0);
	let deleted = state(-1);
	let touched = state(false);
	let hovered = state(-1);
	const hint = computed(() => (hovered >= 0 ? '@markless/' + art.rows[hovered]!.name + ': ' + art.rows[hovered]!.does : 'Hover a package to see what it does.'));
	let said = state('');
	const gone = computed(() => (deleted >= 0 ? art.rows[deleted]!.name : ''));

	const install = () => {
		deleted = -1;
		installed = 0;
		said = 'Installing.';
		const timer = setInterval(() => {
			installed = installed + 1;
			if (installed >= ALL) {
				clearInterval(timer);
				said = 'Installed @markless/core and the six packages it needs.';
			}
		}, 260);
	};
	const remove = (i: number) => {
		if (installed <= i) return;
		deleted = deleted === i ? -1 : i;
		if (deleted < 0) {
			said = art.rows[i]!.name + ' is back.';
			return;
		}
		const broken = art.rows.filter((row) => row.missing.some((miss) => miss.dep === art.rows[i]!.name)).map((row) => row.name);
		said = 'Deleted ' + art.rows[i]!.name + '. ' + (broken.length ? 'Missing it now: ' + broken.join(', ') + '.' : 'Nothing else needs it.');
	};

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="A terminal running npm install @markless/core above node_modules in a file explorer. Press Enter to install, keys 1 to 7 delete or restore a package, Escape resets."
		onVisible={() => {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				installed = ALL;
				return;
			}
			const idle = setTimeout(() => {
				if (!touched) install();
			}, 1200);
			return () => clearTimeout(idle);
		}}
		onKeyDown={(event) => {
			touched = true;
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				install();
			} else if (event.key === 'Escape') {
				installed = 0;
				deleted = -1;
				said = 'Empty again.';
			} else {
				const n = Number(event.key);
				if (n >= 1 && n <= ALL) remove(n - 1);
			}
		}}
	>
		<svg
			class="scene"
			viewBox={art.view}
			aria-hidden="true"
			onClick={(event) => {
				touched = true;
				const target = event.target as Element;
				const row = target.closest('[data-row]');
				if (row) return remove(Number(row.getAttribute('data-row')));
				if (target.closest('.run')) return install();
			}}
			onPointerOver={(event) => {
				const row = (event.target as Element).closest('[data-row]');
				hovered = row && installed > Number(row.getAttribute('data-row')) ? Number(row.getAttribute('data-row')) : -1;
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
			<path class="hit run" d={art.run} />
			<g>
				@for (const row of art.rows; key row.key) {
					<g class={'row' + (installed > row.key ? ' in' : '') + (deleted === row.key ? ' del' : '') + (row.missing.some((miss) => miss.dep === gone) ? ' red' : '')} data-row={row.key}>
						<path class="hit" d={row.hit} />
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
						<g class="shown fade overlay">
							<g>
								@for (const item of row.shown.paths; key item.key) {
									<path class={item.cls} d={item.d} />
								}
							</g>
							<g>
								@for (const text of row.shown.texts; key text.key) {
									<text class={text.cls + ' name'} transform={text.matrix}>{text.text}</text>
								}
							</g>
						</g>
						<g class="gone fade overlay">
							<g>
								@for (const item of row.gone.paths; key item.key) {
									<path class={item.cls} d={item.d} />
								}
							</g>
							<g>
								@for (const text of row.gone.texts; key text.key) {
									<text class={text.cls} transform={text.matrix}>{text.text}</text>
								}
							</g>
						</g>
						<g>
							@for (const miss of row.missing; key miss.key) {
								<g class={'miss fade overlay' + (miss.dep === gone ? ' on' : '')}>
									<g>
										@for (const item of miss.part.paths; key item.key) {
											<path class={item.cls} d={item.d} />
										}
									</g>
									<g>
										@for (const text of miss.part.texts; key text.key) {
											<text class={text.cls} transform={text.matrix}>{text.text}</text>
										}
									</g>
								</g>
							}
						</g>
					</g>
				}
			</g>
		</svg>
		<p class="hint" aria-hidden="true">{hint}</p>
		<figcaption class="sr">
			A pen-and-ink terminal runs npm install @markless/core, and a file explorer below fills node_modules/@markless with core, bundler, router, web, compiler, serializer and runtime, in dependency order. Delete web and core, bundler and router turn red: each is missing @markless/web.
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

			.shown,
			.gone,
			.miss {
				opacity: 0;
			}

			.in .shown,
			.in.del .gone,
			.in .miss.on {
				opacity: 1;
			}

			.name {
				fill: var(--sheet-ink);
			}

			.red .name {
				fill: var(--bad);
			}

			.hover {
				opacity: 0;
			}

			.in:hover .hover {
				opacity: 1;
			}

			.row:hover .miss,
			.row:hover .gone text {
				opacity: 0;
			}

			.row:hover .shown {
				transform: translateX(2px);
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
