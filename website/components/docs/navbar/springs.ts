// The navbar's springs, sampled into CSS linear() easings so the motion stays CSS-only.

export interface Spring {
	readonly stiffness: number;
	readonly damping: number;
	readonly mass: number;
}

/** Panels sliding between menus and dropping open: a touch of overshoot, settled in about 350 ms. */
export const SLIDE: Spring = { stiffness: 420, damping: 36, mass: 1 };
/** The small motions in a card's drawing on hover: livelier, with a visible bounce. */
export const HOVER: Spring = { stiffness: 420, damping: 18, mass: 1 };

/** Where a spring released at 0 toward 1 is after `t` seconds, starting at rest. */
function position({ stiffness, damping, mass }: Spring, t: number): number {
	const w0 = Math.sqrt(stiffness / mass);
	const zeta = damping / (2 * Math.sqrt(stiffness * mass));
	if (zeta < 1) {
		const wd = w0 * Math.sqrt(1 - zeta * zeta);
		return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
	}
	return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** How long the spring takes to stay within a thousandth of its target. */
export function settleMs(spring: Spring): number {
	let last = 0;
	for (let t = 0; t < 3; t += 0.001) if (Math.abs(position(spring, t) - 1) > 0.001) last = t;
	return Math.ceil((last + 0.001) * 1000);
}

/** The points of a curve a straight-line reading misses by more than `tolerance` (Ramer-Douglas-Peucker). */
function simplify(points: ReadonlyArray<readonly [number, number]>, tolerance: number): Array<readonly [number, number]> {
	if (points.length < 3) return [...points];
	const [x0, y0] = points[0]!;
	const [x1, y1] = points[points.length - 1]!;
	let worst = 0;
	let at = 0;
	for (let k = 1; k < points.length - 1; k++) {
		const [x, y] = points[k]!;
		const off = Math.abs(y - (y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)));
		if (off > worst) [worst, at] = [off, k];
	}
	if (worst <= tolerance) return [points[0]!, points[points.length - 1]!];
	return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

/** The spring as a CSS linear() easing over its settle time, thinned to the points that change its shape. */
export function springEasing(spring: Spring, samples = 120): string {
	const ms = settleMs(spring);
	const curve = Array.from({ length: samples + 1 }, (_, k) => [k / samples, k === samples ? 1 : position(spring, ((k / samples) * ms) / 1000)] as const);
	const stops = simplify(curve, 0.002).map(([x, y], k, all) => {
		const value = `${Math.round(y * 1000) / 1000}`;
		return k === 0 || k === all.length - 1 ? value : `${value} ${Math.round(x * 1000) / 10}%`;
	});
	return `linear(${stops.join(', ')})`;
}
