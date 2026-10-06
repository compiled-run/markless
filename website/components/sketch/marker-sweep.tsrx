// A highlighter stroke laid over text. It fills the nearest positioned box, or
// the box `place` names, and sweeps across each time `beat` flips between
// 'odd' and 'even'; 'rest' shows nothing. Set `--sweep-delay` on an ancestor to
// stagger it.
export default function MarkerSweep({
	beat,
	tone,
	place,
}: {
	readonly beat: string;
	/** 'yellow' (default), 'pink', 'green' or 'purple'. */
	readonly tone?: string;
	/** Inline left/top/width/height for an overlay placed by measurement; '' fills the parent. */
	readonly place: string;
}) @{
	<svg
		class="marker-sweep"
		viewBox="0 0 100 24"
		preserveAspectRatio="none"
		data-beat={beat}
		data-tone={tone ?? 'yellow'}
		style={place}
		aria-hidden="true"
	>
		<path class="pass" d="M3 14.5 C 24 12.2 52 15.6 97 12.4" />
		<path class="edge" d="M5 8.6 C 30 7.2 64 9.8 95 7.8" />
		<path class="edge low" d="M4 19.8 C 34 18.6 66 20.6 96 18.2" />
		<style>
			.marker-sweep {
				position: absolute;
				inset: -0.12em -0.28em;
				width: calc(100% + 0.56em);
				height: calc(100% + 0.24em);
				z-index: 1;
				overflow: visible;
				fill: none;
				stroke: var(--sweep, var(--yellow));
				stroke-linecap: round;
				mix-blend-mode: var(--sweep-blend, multiply);
				pointer-events: none;
				--sweep-time: 420ms;
			}

			.marker-sweep[data-tone='pink'] {
				--sweep: var(--pink);
			}

			.marker-sweep[data-tone='green'] {
				--sweep: var(--green-star);
			}

			.marker-sweep[data-tone='purple'] {
				--sweep: var(--purple);
			}

			path {
				stroke-dasharray: 100 200;
				stroke-dashoffset: 100;
				animation-duration: var(--sweep-time);
				animation-delay: var(--sweep-delay, 0ms);
				animation-timing-function: cubic-bezier(0.25, 0.6, 0.3, 1);
				animation-fill-mode: both;
			}

			.pass {
				stroke-width: 15;
				opacity: 0.85;
			}

			.edge {
				stroke-width: 5;
				opacity: 0.55;
			}

			.low {
				opacity: 0.4;
			}

			.marker-sweep[data-beat='rest'] {
				visibility: hidden;
			}

			.marker-sweep[data-beat='odd'] path {
				animation-name: sweep-odd;
			}

			.marker-sweep[data-beat='even'] path {
				animation-name: sweep-even;
			}

			@keyframes sweep-odd {
				from {
					stroke-dashoffset: 100;
				}
				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes sweep-even {
				from {
					stroke-dashoffset: 100;
				}
				to {
					stroke-dashoffset: 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.marker-sweep path {
					animation: none !important;
					stroke-dashoffset: 0;
				}
			}
		</style>
	</svg>
}
