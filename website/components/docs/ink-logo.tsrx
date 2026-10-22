import { art } from './ink-logos.art.ts';
import type { LogoMark as Mark } from './ink-logos.ts';

export type { Mark };

/** A product's mark as a small ink drawing, about one letter tall, in the text colour. Decorative: put the product's name beside it as text. */
export default function InkLogo({ mark }: { readonly mark: Mark }) @{
	<svg class="ink-logo" viewBox={'0 0 ' + art.size + ' ' + art.size} aria-hidden="true">
		<path class="tone" d={art.logos[mark].tone} />
		<path class="hatch" d={art.logos[mark].hatch} />
		<path class="ink" d={art.logos[mark].ink} />
		<style>
			.ink-logo {
				display: inline-block;
				width: 1.2em;
				height: 1.2em;
				margin-inline-end: 0.22em;
				vertical-align: -0.25em;
				overflow: visible;
			}

			.tone {
				fill: currentColor;
				fill-rule: evenodd;
				opacity: 0.25;
			}

			.hatch {
				fill: none;
				stroke: currentColor;
				stroke-width: 1.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.ink {
				fill: currentColor;
			}
		</style>
	</svg>
}
