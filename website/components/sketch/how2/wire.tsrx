// One subscription path: a faint pencil line that is always there, and a marker
// stroke drawn over it each time `beat` flips between 'odd' and 'even'. The
// parent sizes the wire; `--wire-delay` staggers it.
export default function Wire({ beat, way, tone }: {
	readonly beat: string;
	/** 'across' (default, left to right) or 'down'. */
	readonly way?: string;
	/** 'pink' (default) or 'purple'. */
	readonly tone?: string;
}) @{
	<span class="wire" data-way={way ?? 'across'} data-beat={beat} data-tone={tone ?? 'pink'} aria-hidden="true">
		<svg class="run wide" viewBox="0 0 100 20" preserveAspectRatio="none">
			<path class="pencil" d="M0 10.6 C 22 9.2 46 11.8 70 9.8 C 82 9 92 10.6 100 10" />
			<path class="ink" d="M0 10.6 C 22 9.2 46 11.8 70 9.8 C 82 9 92 10.6 100 10" />
		</svg>
		<svg class="run tall" viewBox="0 0 20 100" preserveAspectRatio="none">
			<path class="pencil" d="M10.6 0 C 9.2 22 11.8 46 9.8 70 C 9 82 10.6 92 10 100" />
			<path class="ink" d="M10.6 0 C 9.2 22 11.8 46 9.8 70 C 9 82 10.6 92 10 100" />
		</svg>
		<svg class="head" viewBox="0 0 12 20">
			<path class="pencil" d="M2 3.5 L10.5 10 L2.4 16.8" />
			<path class="ink" d="M2 3.5 L10.5 10 L2.4 16.8" />
		</svg>
		<style>
			.wire {
				display: flex;
				align-items: center;
				width: 100%;
				height: 100%;
				--ink-tone: var(--pink);
			}

			.wire[data-tone='purple'] {
				--ink-tone: var(--purple);
			}

			.wire[data-way='down'] {
				flex-direction: column;
			}

			svg {
				display: block;
				overflow: visible;
				fill: none;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.run {
				flex: 1;
				width: 100%;
				height: 1.2rem;
			}

			.head {
				flex: none;
				width: 0.62rem;
				height: 1.05rem;
				margin-left: -0.5rem;
			}

			.tall,
			.wire[data-way='down'] .wide {
				display: none;
			}

			.wire[data-way='down'] .tall {
				display: block;
				width: 1.2rem;
				height: 100%;
			}

			.wire[data-way='down'] .head {
				rotate: 90deg;
				margin: -0.5rem 0 0;
			}

			.pencil {
				vector-effect: non-scaling-stroke;
				stroke: color-mix(in oklch, var(--ink) 38%, transparent);
				stroke-width: 1.6;
				stroke-dasharray: 3 4;
			}

			.head .pencil {
				stroke-dasharray: none;
			}

			.ink {
				stroke: var(--ink-tone);
				stroke-width: 4.2;
				--dash: 104;
				stroke-dasharray: var(--dash) 300;
				stroke-dashoffset: var(--dash);
				animation: 380ms cubic-bezier(0.3, 0.6, 0.3, 1) var(--wire-delay, 0ms) both;
			}

			.head .ink {
				--dash: 24;
				stroke-width: 3.4;
				animation-delay: calc(var(--wire-delay, 0ms) + 300ms);
				animation-duration: 160ms;
			}

			.wire[data-beat='rest'] .ink {
				visibility: hidden;
			}

			.wire[data-beat='odd'] .ink {
				animation-name: wire-odd;
			}

			.wire[data-beat='even'] .ink {
				animation-name: wire-even;
			}

			@keyframes wire-odd {
				from {
					stroke-dashoffset: var(--dash);
				}
				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes wire-even {
				from {
					stroke-dashoffset: var(--dash);
				}
				to {
					stroke-dashoffset: 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.ink {
					animation: none !important;
					stroke-dashoffset: 0;
				}
			}
		</style>
	</span>
}
