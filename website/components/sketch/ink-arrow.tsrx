// A hand-drawn ink arrow. The wobble comes from a seeded generator, so the same
// props draw the same arrow on every render and in every environment.
const seeded = (seed: number): (() => number) => {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
};

const r1 = (n: number) => Math.round(n * 10) / 10;

const strokePath = (
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	bend: number,
	wobble: number,
	seed: number,
	part: string,
): string => {
	const next = seeded(seed);
	const length = Math.hypot(x2 - x1, y2 - y1) || 1;
	const nx = -(y2 - y1) / length;
	const ny = (x2 - x1) / length;
	const cx = (x1 + x2) / 2 + nx * bend;
	const cy = (y1 + y2) / 2 + ny * bend;
	const steps = 6;
	const points: Array<readonly [number, number]> = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const u = 1 - t;
		let x = u * u * x1 + 2 * u * t * cx + t * t * x2;
		let y = u * u * y1 + 2 * u * t * cy + t * t * y2;
		if (i > 0 && i < steps) {
			const j = (next() - 0.5) * 2 * wobble;
			x += nx * j;
			y += ny * j;
		}
		points.push([x, y]);
	}
	if (part === 'length') {
		let total = 0;
		for (let i = 1; i <= steps; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
		return String(Math.ceil(total * 1.05 + 4));
	}
	if (part === 'line') {
		let line = `M${r1(points[0][0])} ${r1(points[0][1])}`;
		for (let i = 0; i < steps; i++) {
			const p0 = points[i - 1] ?? points[i];
			const p1 = points[i];
			const p2 = points[i + 1];
			const p3 = points[i + 2] ?? p2;
			line += ` C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
		}
		return line;
	}
	const tail = points[steps - 1];
	const tip = points[steps];
	const angle = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
	const barb = 9 + next() * 3;
	const spread = 0.48 + (next() - 0.5) * 0.12;
	const left = angle + Math.PI - spread;
	const right = angle + Math.PI + spread + (next() - 0.5) * 0.1;
	const head = `M${r1(tip[0] + barb * Math.cos(left))} ${r1(tip[1] + barb * Math.sin(left))} L${r1(tip[0])} ${r1(tip[1])} L${r1(tip[0] + barb * 1.1 * Math.cos(right))} ${r1(tip[1] + barb * 1.1 * Math.sin(right))}`;
	return head;
};

// Coordinates are in the arrow's own box, `width` by `height`. The parent sizes
// the box and sets `color`; `shown` draws the stroke in and out.
export default function InkArrow({
	width,
	height,
	x1,
	y1,
	x2,
	y2,
	bend,
	seed,
	shown,
}: {
	readonly width: number;
	readonly height: number;
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
	/** Sideways pull at the middle of the stroke; negative bends the other way. */
	readonly bend?: number;
	readonly seed?: number;
	/** 'true' draws the arrow in, 'false' hides it. */
	readonly shown: string;
}) @{
	const wobble = Math.min(1.8, Math.hypot(x2 - x1, y2 - y1) * 0.018);
	const line = strokePath(x1, y1, x2, y2, bend ?? 0, wobble, seed ?? 7, 'line');
	const head = strokePath(x1, y1, x2, y2, bend ?? 0, wobble, seed ?? 7, 'head');
	const length = strokePath(x1, y1, x2, y2, bend ?? 0, wobble, seed ?? 7, 'length');
	const retrace = strokePath(x1 + 1, y1 + 0.6, x2 - 0.8, y2 + 0.5, (bend ?? 0) * 0.94, wobble * 0.7, (seed ?? 7) + 31, 'line');

	<svg
		class="ink-arrow"
		viewBox={'0 0 ' + width + ' ' + height}
		data-shown={shown}
		style={'--len:' + length}
		aria-hidden="true"
	>
		<path class="retrace" d={retrace} />
		<path class="line" d={line} />
		<path class="head" d={head} />
		<style>
			.ink-arrow {
				display: block;
				width: 100%;
				height: 100%;
				overflow: visible;
				fill: none;
				stroke: currentColor;
				stroke-linecap: round;
				stroke-linejoin: round;
				pointer-events: none;
			}

			path {
				stroke-width: var(--ink-weight, 2.4);
				stroke-dasharray: var(--len) calc(var(--len) * 2);
				stroke-dashoffset: 0;
				transition: stroke-dashoffset 520ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.retrace {
				stroke-width: calc(var(--ink-weight, 2.4) * 0.55);
				opacity: 0.45;
				transition-delay: 90ms;
			}

			.head {
				transition-duration: 200ms;
				transition-delay: 460ms;
			}

			.ink-arrow[data-shown='false'] {
				visibility: hidden;
			}

			.ink-arrow[data-shown='false'] path {
				stroke-dashoffset: var(--len);
				transition: none;
			}

			@media (prefers-reduced-motion: reduce) {
				path {
					transition: none !important;
				}
			}
		</style>
	</svg>
}
