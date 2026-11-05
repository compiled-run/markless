// Two shirts on the desk, both labelled card, each with its own name tape, and paper-card.tsrx's dye bath: the dye takes only on the shirt whose tape matches.
import { computed, state } from '@markless/core';
import { CLASS, describeLaundry, FILES, flip, LAUNDRY_TOUR } from './laundry-model.ts';
import { art } from './laundry.art.ts';

export default function LaundryAnatomy() @{
	let beat = state('rest');
	let touched = state(false);
	const said = computed(() => describeLaundry(beat !== 'rest'));

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
				const next = LAUNDRY_TOUR[step % LAUNDRY_TOUR.length];
				step++;
				if (next === 'dye') beat = flip(beat);
				else if (next === 'reset') beat = 'rest';
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
			aria-label="Dip both shirts in the dye"
			onClick={() => {
				touched = true;
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.tub.pencil} />
				<path class="shadow-wash" d={art.shirts[0].shadow} />
				<path class="hatch deep light" d={art.shirts[0].shadowHatch} />
				<path class="shirt" d={art.shirts[0].paper} />
				<g class="dyed">
					<path class="wash yellow" d={art.shirts[0].dye} />
					<path class="wash yellow pool" d={art.shirts[0].dyePool} />
				</g>
				<path class="hatch light" d={art.shirts[0].shade} />
				<path class="jar-ink" d={art.shirts[0].ink} />
				<path class="tag-paper" d={art.shirts[0].tag.paper} />
				<path class="tag-ink" d={art.shirts[0].tag.ink} />
				<text class="tag-word" transform={art.shirts[0].tag.matrix}>{CLASS}</text>
				<path class="tape" d={art.shirts[0].tape.paper} />
				<path class="tag-ink" d={art.shirts[0].tape.ink} />
				<text class="tape-word" transform={art.shirts[0].tape.matrix}>{FILES[0]}</text>
				<path class="shadow-wash" d={art.shirts[1].shadow} />
				<path class="hatch deep light" d={art.shirts[1].shadowHatch} />
				<path class="shirt" d={art.shirts[1].paper} />
				<path class="hatch light" d={art.shirts[1].shade} />
				<path class="jar-ink" d={art.shirts[1].ink} />
				<path class="tag-paper" d={art.shirts[1].tag.paper} />
				<path class="tag-ink" d={art.shirts[1].tag.ink} />
				<text class="tag-word" transform={art.shirts[1].tag.matrix}>{CLASS}</text>
				<path class="tape" d={art.shirts[1].tape.paper} />
				<path class="tag-ink" d={art.shirts[1].tape.ink} />
				<text class="tape-word" transform={art.shirts[1].tape.matrix}>{FILES[1]}</text>

				<path class="shadow-wash" d={art.tub.shadow} />
				<path class="hatch deep light" d={art.tub.shadowHatch} />
				<path class="tub" d={art.tub.body} />
				<path class="hatch light" d={art.tub.bodyHatch} />
				<path class="tub-dye" d={art.tub.dye} />
				<path class="wash yellow" d={art.tub.dyeWash} />
				<path class="jar-ink" d={art.tub.ink} />
				<path class="tag-paper" d={art.tub.label.paper} />
				<path class="tag-ink" d={art.tub.label.ink} />
				<text class="tape-word" transform={art.tub.label.matrix}>.{CLASS} in {FILES[0]}</text>

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>SAME LABEL, OTHER TAPE</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of two white T-shirts lying on a desk beside a tub of yellow dye. Both shirts have a neck label reading
			"{CLASS}". Below each label is a sewn name tape: the first reads "{FILES[0]}", the second "{FILES[1]}". The tub is labelled
			".{CLASS} in {FILES[0]}". Press the drawing, or Enter or Space, to dip both shirts: only the shirt with the {FILES[0]} tape turns
			yellow; the other stays white, though both are labelled {CLASS}. Escape washes it out.
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

			.shirt {
				fill: var(--paper);

				html.dark & {
					fill: color-mix(in oklch, var(--paper) 30%, var(--ink));
				}
			}

			.tape {
				fill: color-mix(in oklch, var(--paper) 60%, oklch(80% 0.05 20));
			}

			.tub {
				fill: color-mix(in oklch, var(--paper) 70%, white);

				html.dark & {
					fill: color-mix(in oklch, var(--paper) 40%, var(--ink));
				}
			}

			.tub-dye {
				fill: color-mix(in oklch, var(--yellow) 60%, var(--paper));
			}

			.tag-word,
			.tape-word {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 800;
				fill: var(--sheet-ink);
			}

			.tag-word {
				font-size: 8px;
			}

			.tape-word {
				font-size: 7px;
			}

			.dyed {
				opacity: 0;
			}

			.scene:not([data-beat='rest']) .dyed {
				animation: var(--soak) 1600ms 300ms both;
			}

			.scene[data-beat='odd'] {
				--soak: soak-a;
			}

			.scene[data-beat='even'] {
				--soak: soak-b;
			}

			@keyframes soak-a {
				0% {
					opacity: 0;
				}

				100% {
					opacity: 1;
				}
			}

			@keyframes soak-b {
				0% {
					opacity: 0;
				}

				100% {
					opacity: 1;
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
