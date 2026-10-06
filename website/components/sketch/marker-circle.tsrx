// A loose marker loop drawn round the nearest positioned box, redrawn each time
// `beat` flips between 'odd' and 'even'; 'rest' shows nothing. Set
// `--circle-delay` on an ancestor to stagger it.
export default function MarkerCircle({
	beat,
	tone,
}: {
	readonly beat: string;
	/** 'pink' (default), 'purple', 'green' or 'ink'. */
	readonly tone?: string;
}) @{
	<svg
		class="marker-circle"
		viewBox="0 0 120 50"
		preserveAspectRatio="none"
		data-beat={beat}
		data-tone={tone ?? 'pink'}
		aria-hidden="true"
	>
		<path
			d="M98 7.5 C 74 1.2 26 2.6 10 15.8 C -1 25.4 12 44.6 54 46.4 C 92 47.6 117.6 37.4 114.4 22.4 C 111.4 9.2 80 3.4 46 6.6 C 37 7.6 30 9.4 25 11.6"
		/>
		<style>
			.marker-circle {
				position: absolute;
				inset: -0.55em -0.75em -0.5em -0.7em;
				width: calc(100% + 1.45em);
				height: calc(100% + 1.05em);
				z-index: 1;
				overflow: visible;
				fill: none;
				stroke: var(--loop, var(--pink));
				stroke-width: 3.6;
				stroke-linecap: round;
				pointer-events: none;
			}

			.marker-circle[data-tone='purple'] {
				--loop: var(--purple);
			}

			.marker-circle[data-tone='green'] {
				--loop: var(--green-star);
			}

			.marker-circle[data-tone='ink'] {
				--loop: currentColor;
			}

			path {
				stroke-dasharray: 320 640;
				stroke-dashoffset: 320;
				animation: 520ms cubic-bezier(0.35, 0.55, 0.3, 1) var(--circle-delay, 0ms) both;
			}

			.marker-circle[data-beat='rest'] {
				visibility: hidden;
			}

			.marker-circle[data-beat='odd'] path {
				animation-name: loop-odd;
			}

			.marker-circle[data-beat='even'] path {
				animation-name: loop-even;
			}

			@keyframes loop-odd {
				from {
					stroke-dashoffset: 320;
				}
				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes loop-even {
				from {
					stroke-dashoffset: 320;
				}
				to {
					stroke-dashoffset: 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.marker-circle path {
					animation: none !important;
					stroke-dashoffset: 0;
				}
			}
		</style>
	</svg>
}
