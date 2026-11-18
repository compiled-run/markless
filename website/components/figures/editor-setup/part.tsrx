// One frozen part of a tooling figure, painted in the site's ink; the figure around it sets the colour tokens and any --on dial.
import type { DeskArt } from '../ink/sheets.ts';

export default function Part({ art }: { readonly art: DeskArt }) @{
	<g>
		@for (const layer of art.layers; key layer.key) {
			<g>
				@for (const item of layer.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
				@for (const text of layer.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
		}
		<style>
			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.desk-ink {
				fill: var(--ink);
			}

			.kraft {
				fill: var(--kraft);
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
			}

			.pen {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.faint {
				opacity: 0.45;
			}

			.perforation {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.6;
				opacity: 0.35;
			}

			.swipe,
			.band {
				fill: var(--yellow);
				opacity: 0.6;
				mix-blend-mode: multiply;

				html.dark & {
					fill: color-mix(in srgb, var(--yellow) 60%, var(--cream));
					opacity: 1;
					mix-blend-mode: normal;
				}
			}

			.pink-wash {
				fill: var(--pink);
				opacity: 0.75;

				html.dark & {
					fill: color-mix(in srgb, var(--pink) 75%, var(--cream));
					opacity: 1;
				}
			}

			.squiggle {
				fill: var(--c-err);
			}

			.track {
				fill: color-mix(in oklch, var(--pink) calc(var(--on, 1) * 70%), var(--sheet));
			}

			.knob-on {
				opacity: var(--on, 1);
			}

			.knob-off {
				opacity: calc(1 - var(--on, 1));
			}

			text {
				white-space: pre;
				fill: var(--sheet-ink);
			}

			.mono,
			.dim,
			.bold,
			.num {
				font-family: var(--font-mono);
				font-variation-settings: 'MONO' 1, 'CASL' 0;
				font-size: 10px;
				font-weight: 500;
			}

			.dim {
				opacity: 0.55;
			}

			.bold {
				font-weight: 800;
			}

			.num {
				font-size: 9px;
				opacity: 0.45;
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
				font-size: 15px;
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

			.num-ring {
				font-size: 10px;
			}

			.tint-kw {
				fill: var(--c-kw);
			}

			.tint-fn,
			.tint-attr {
				fill: var(--c-fn);
			}

			.tint-str {
				fill: var(--c-str);
			}

			.tint-num {
				fill: var(--c-num);
			}

			.tint-tag {
				fill: var(--c-tag);
			}

			.tint-err {
				fill: var(--c-err);
			}
		</style>
	</g>
}
