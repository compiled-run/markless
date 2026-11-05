// Two pages of the site use the word "resumes"; hover or press either and the term's tooltip shows the glossary's one meaning, word for word the same on both.
import { computed, state } from '@markless/core';
import { art } from './term.art.ts';

export default function TermFigure() @{
	let open = state(0);
	let touched = state(false);
	let said = state('');
	let hovered = state(-1);
	const hint = computed(() => (hovered >= 0 ? 'Hovering resumes on ' + art.pages[hovered]!.url : 'Hover resumes on either page.'));
	const dials = computed(() => '--ta:' + (open === 1 || open === 3 ? 1 : 0) + ';--tb:' + (open === 2 || open === 3 ? 1 : 0) + ';--both:' + (open === 3 ? 1 : 0));
	const tell = () => {
		said = open === 0 ? '' : open === 3 ? 'Both tooltips say the same thing: the browser carries on from server HTML and its payload.' : 'resume: the browser carries on from server HTML and its payload. It does not run the component body again.';
	};
	const toggle = (p: number) => {
		const bit = p === 0 ? 1 : 2;
		open = open & bit ? open - bit : open + bit;
		tell();
	};

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="Two pages of this site that use the word resumes. Keys 1 and 2 open each tooltip, Enter opens both, Escape closes them."
		onVisible={() => {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			const a = setTimeout(() => {
				if (!touched) open = 1;
			}, 1200);
			const b = setTimeout(() => {
				if (!touched) open = 3;
			}, 3000);
			return () => {
				clearTimeout(a);
				clearTimeout(b);
			};
		}}
		onKeyDown={(event) => {
			touched = true;
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				open = open === 3 ? 0 : 3;
				tell();
			} else if (event.key === 'Escape') {
				open = 0;
				tell();
			} else if (event.key === '1' || event.key === '2') toggle(Number(event.key) - 1);
		}}
	>
		<svg
			class="scene"
			style={dials}
			viewBox={art.view}
			aria-hidden="true"
			onClick={(event) => {
				touched = true;
				const term = (event.target as Element).closest('[data-term]');
				if (term) toggle(Number(term.getAttribute('data-term')));
			}}
			onPointerOver={(event) => {
				const term = (event.target as Element).closest('[data-term]');
				hovered = term ? Number(term.getAttribute('data-term')) : -1;
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
			<g>
				@for (const page of art.pages; key page.key) {
					<g class={'page page-' + page.key}>
						<g class="wash fade overlay">
							@for (const item of page.wash.paths; key item.key) {
								<path class={item.cls} d={item.d} />
							}
						</g>
						<g>
							@for (const line of page.lines; key line.key) {
								<text class="prose" transform={line.matrix}>
									{line.before}
									<tspan class="term">{line.term}</tspan>
									{line.after}
								</text>
							}
						</g>
						<g>
							@for (const item of page.underline.paths; key item.key) {
								<path class={item.cls} d={item.d} />
							}
						</g>
						<path class="hit" data-term={page.key} d={page.hit} />
					</g>
				}
			</g>
			<g>
				@for (const page of art.pages; key page.key) {
					<g class={'tip fade overlay tip-' + page.key}>
						<g>
							@for (const item of page.tip.paths; key item.key) {
								<path class={item.cls} d={item.d} />
							}
						</g>
						<g>
							@for (const text of page.tip.texts; key text.key) {
								<text class={text.cls} transform={text.matrix}>{text.text}</text>
							}
						</g>
					</g>
				}
			</g>
		</svg>
		<p class="hint" aria-hidden="true">{hint}</p>
		<figcaption class="sr">
			Two pen-and-ink pages from markless.dev. The How it works page says: It resumes. When a server renders the page, its HTML arrives already wired. The Contributing page says: @markless/web renders and resumes for the web. The word resumes is underlined on both, and its tooltip on either page reads the same: resume, the browser carries on from server HTML and its payload. It does not run the component body again.
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

			.prose {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 11px;
			}

			.term {
				font-weight: 700;
			}

			.tip-stem {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.9;
				stroke-dasharray: 2 2.5;
			}

			.term-line {
				fill: none;
				stroke: var(--pink);
				stroke-width: 1.4;
				stroke-dasharray: 1.5 2.5;
				stroke-linecap: round;
			}

			.wash {
				opacity: 0;
			}

			.page:hover .wash {
				opacity: 1;
			}

			.tip {
				opacity: 0;
				transition: opacity 160ms ease, transform 160ms ease;
			}

			.tip-0 {
				opacity: var(--ta);
			}

			.tip-1 {
				opacity: var(--tb);
			}

			.scene:has(.page-0 .hit:hover) .tip-0,
			.scene:has(.page-1 .hit:hover) .tip-1 {
				opacity: 1;
				transform: translateY(-1px);
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
