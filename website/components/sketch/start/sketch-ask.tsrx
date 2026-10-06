// The handwritten question over a sketch figure, with a doubled pink underline.
export default function SketchAsk({ text }: { readonly text: string }) @{
	<figcaption class="sketch-ask">
		<span class="ask">{text}</span>
		<svg class="underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
			<path d="M3 9.5 C 60 5.2 120 10.8 180 7.4 C 225 5 262 8.6 297 6.2" />
			<path class="again" d="M14 11.8 C 80 8.6 150 12.4 230 9.6" />
		</svg>
		<style>
			.sketch-ask {
				position: relative;
				width: fit-content;
				max-width: 100%;
				margin: 0 auto var(--space-m);
				rotate: -1.5deg;
				text-align: center;
			}

			.ask {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-2);
				font-weight: 700;
				line-height: 1.15;
				color: var(--ink);
			}

			.underline {
				display: block;
				width: 100%;
				height: 0.55em;
				margin-top: -0.1em;
				fill: none;
				stroke: var(--pink);
				stroke-width: 4;
				stroke-linecap: round;
			}

			.underline .again {
				stroke-width: 2;
				opacity: 0.6;
			}

			@media (max-width: 40rem) {
				.ask {
					font-size: var(--step-1);
				}
			}
		</style>
	</figcaption>
}
