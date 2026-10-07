// A wobbly hand-drawn outline that fills the nearest positioned box. The parent
// sets `color`; `--box-fill` paints the inside.
export default function RoughBox({ shape }: {
	/** 'a' (default), 'b' or 'c': three slightly different hands. */
	readonly shape?: string;
}) @{
	<svg class="rough-box" viewBox="0 0 100 100" preserveAspectRatio="none" data-shape={shape ?? 'a'} aria-hidden="true">
		<path class="fill" d="M1.5 2.5 L98.5 1.5 L98.8 97.8 L1.2 98.6 Z" />
		<path class="a" d="M0.6 2.8 C 30 1.4 70 2.6 99.2 1.2 M98.4 0.2 C 99.4 30 98.2 70 99 99.4 M100 97.6 C 70 98.8 30 97.2 0.8 98.8 M1.6 100 C 0.4 70 1.8 30 0.8 0.6" />
		<path class="b" d="M-0.4 1.6 C 34 2.8 66 0.8 100.4 2.6 M99.4 -0.4 C 98.4 36 99.8 64 98.4 100.4 M99.6 98.6 C 64 97.4 36 99.6 -0.2 97.8 M0.6 99.6 C 1.8 64 0.2 36 1.8 -0.2" />
		<path class="c" d="M1.4 0.8 C 40 2.2 62 0.4 98.6 2 C 99.6 40 97.8 66 99.4 98.2 C 60 99.6 38 97.6 0.4 99.2 C -0.2 60 1.6 38 0.2 1.6" />
		<style>
			.rough-box {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
				pointer-events: none;
				fill: none;
				stroke: currentColor;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			path {
				vector-effect: non-scaling-stroke;
				stroke-width: var(--box-weight, 1.8);
			}

			.fill {
				stroke: none;
				fill: var(--box-fill, none);
			}

			.rough-box[data-shape='a'] .b,
			.rough-box[data-shape='a'] .c,
			.rough-box[data-shape='b'] .a,
			.rough-box[data-shape='b'] .c,
			.rough-box[data-shape='c'] .a {
				display: none;
			}

			.rough-box[data-shape='c'] .b {
				stroke-width: calc(var(--box-weight, 1.8) * 0.6);
				opacity: 0.55;
			}
		</style>
	</svg>
}
