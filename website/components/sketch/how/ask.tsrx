// The handwritten question at the top of a sketch figure, with its marker
// underline and a one-line hint telling the reader what to do.
export default function Ask({ question, hint }: { readonly question: string; readonly hint: string }) @{
	<figcaption class="sketch-ask">
		<span class="ask">{question}</span>
		<svg class="underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
			<path d="M3 9.5 C 60 5.2 120 10.8 180 7.4 C 225 5 262 8.6 297 6.2" />
			<path class="again" d="M14 11.8 C 80 8.6 150 12.4 230 9.6" />
		</svg>
		<span class="hint">{hint}</span>
		<style>
			.sketch-ask {
				position: relative;
				width: fit-content;
				max-width: 100%;
				margin: 0 auto var(--space-m);
				text-align: center;
			}

			.ask {
				display: block;
				rotate: -1.5deg;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-2);
				font-weight: 700;
				line-height: 1.15;
				color: var(--ink);
				text-wrap: balance;
			}

			.underline {
				display: block;
				width: 100%;
				height: 0.55em;
				margin-top: -0.1em;
				rotate: -1.5deg;
				fill: none;
				stroke: var(--pink);
				stroke-width: 4;
				stroke-linecap: round;
			}

			.underline .again {
				stroke-width: 2;
				opacity: 0.6;
			}

			.hint {
				display: block;
				margin-top: 0.35rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.25;
				color: color-mix(in oklch, var(--ink) 72%, var(--paper));
			}

			.hint:empty {
				display: none;
			}

			@container (max-width: 38rem) {
				.ask {
					font-size: var(--step-1);
				}
			}
		</style>
	</figcaption>
}
