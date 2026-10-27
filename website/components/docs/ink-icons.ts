// The docs pages' own marks, built on the same 24-unit grid as the product marks in ink-logos.ts. Parts never overlap: the hatching fills even-odd.
import type { P } from '../figures/ink/ink.ts';

type Ring = P[];
type Shape = Ring | Ring[];

const TAU = Math.PI * 2;
const rad = (deg: number) => (deg * Math.PI) / 180;

function rect(x: number, y: number, w: number, h: number, r = 0): Ring {
	if (r <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
	const out: Ring = [];
	const corners: [number, number, number][] = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
	for (const [cx, cy, a0] of corners) for (let k = 0; k <= 4; k++) out.push([cx + r * Math.cos(rad(a0 + k * 22.5)), cy + r * Math.sin(rad(a0 + k * 22.5))]);
	return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 32): Ring {
	return Array.from({ length: n }, (_, k): P => [cx + rx * Math.cos((k / n) * TAU), cy + ry * Math.sin((k / n) * TAU)]);
}

const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r, Math.max(16, Math.round(r * 8)));

function area(ring: Ring): number {
	let a = 0;
	for (let k = 0; k < ring.length; k++) {
		const [x0, y0] = ring[k]!;
		const [x1, y1] = ring[(k + 1) % ring.length]!;
		a += x0 * y1 - x1 * y0;
	}
	return a / 2;
}

/** The same outline moved `t` inward, mitred at the corners. */
function inset(ring: Ring, t: number): Ring {
	const sign = area(ring) > 0 ? 1 : -1;
	const normal = (a: P, b: P): P => {
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
		return [(sign * -(b[1] - a[1])) / len, (sign * (b[0] - a[0])) / len];
	};
	return ring.map((p, k) => {
		const prev = ring[(k - 1 + ring.length) % ring.length]!;
		const next = ring[(k + 1) % ring.length]!;
		const n1 = normal(prev, p);
		const n2 = normal(p, next);
		const sum: P = [n1[0] + n2[0], n1[1] + n2[1]];
		const len = Math.hypot(sum[0], sum[1]) || 1;
		const m: P = [sum[0] / len, sum[1] / len];
		const reach = Math.min(t / Math.max(0.2, m[0] * n1[0] + m[1] * n1[1]), t * 3);
		return [p[0] + m[0] * reach, p[1] + m[1] * reach];
	});
}

/** An outline drawn as a band `t` wide: the shape with its inside cut out. */
const band = (ring: Ring, t: number): Ring[] => [ring, inset(ring, t)];
const frame = (x: number, y: number, w: number, h: number, t: number, r = 0): Ring[] => band(rect(x, y, w, h, r), t);
const ring = (cx: number, cy: number, r: number, t: number): Ring[] => [circle(cx, cy, r), circle(cx, cy, r - t)];

/** A stroke `t` wide along an open polyline, as one closed shape. */
function bar(points: P[], t: number): Ring {
	const h = t / 2;
	const left: P[] = [];
	const right: P[] = [];
	points.forEach((p, k) => {
		const a = points[Math.max(0, k - 1)]!;
		const b = points[Math.min(points.length - 1, k + 1)]!;
		const seg = (u: P, v: P): P => {
			const len = Math.hypot(v[0] - u[0], v[1] - u[1]) || 1;
			return [-(v[1] - u[1]) / len, (v[0] - u[0]) / len];
		};
		const n1 = k > 0 ? seg(a, p) : seg(p, b);
		const n2 = k < points.length - 1 ? seg(p, b) : n1;
		const sum: P = [n1[0] + n2[0], n1[1] + n2[1]];
		const len = Math.hypot(sum[0], sum[1]) || 1;
		const m: P = [sum[0] / len, sum[1] / len];
		const reach = Math.min(h / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]), h * 3);
		left.push([p[0] + m[0] * reach, p[1] + m[1] * reach]);
		right.push([p[0] - m[0] * reach, p[1] - m[1] * reach]);
	});
	return [...left, ...right.reverse()];
}

function arc(cx: number, cy: number, r: number, from: number, to: number, n = 14): P[] {
	return Array.from({ length: n + 1 }, (_, k): P => {
		const a = rad(from + ((to - from) * k) / n);
		return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
	});
}

/** A plus sign as one shape, so its arms do not cross. */
function plus(cx: number, cy: number, size: number, t: number): Ring {
	const [s, h] = [size / 2, t / 2];
	return [[cx - h, cy - s], [cx + h, cy - s], [cx + h, cy - h], [cx + s, cy - h], [cx + s, cy + h], [cx + h, cy + h], [cx + h, cy + s], [cx - h, cy + s], [cx - h, cy + h], [cx - s, cy + h], [cx - s, cy - h], [cx - h, cy - h]];
}

/** The outline of whatever `inside` covers, traced by rays from a centre it can see all of. */
function blob(cx: number, cy: number, inside: (x: number, y: number) => boolean, n = 120): Ring {
	return Array.from({ length: n }, (_, k): P => {
		const a = (k / n) * TAU;
		let r = 16;
		while (r > 0 && !inside(cx + r * Math.cos(a), cy + r * Math.sin(a))) r -= 0.04;
		return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
	});
}

const inCircle = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inRect = (x: number, y: number, x0: number, y0: number, w: number, h: number) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;

function turn<S extends Shape>(shape: S, deg: number, cx = 12, cy = 12): S {
	const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
	const one = (r: Ring): Ring => r.map(([x, y]): P => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
	return (isRing(shape) ? one(shape) : shape.map(one)) as S;
}

const isRing = (shape: Shape): shape is Ring => typeof shape[0]![0] === 'number';

/** The side of a drum between two of its rims, each rim the near half of an ellipse. */
function drumBand(cx: number, top: number, bottom: number, rx: number, ry: number): Ring {
	const rim = (cy: number, from: number, to: number) => arc(cx, cy, rx, from, to).map(([x, y]): P => [x, cy + ((y - cy) * ry) / rx]);
	return [...rim(top, 180, 0), ...rim(bottom, 0, 180)];
}

/** A leaf from `a` to `b`, `w` across at its widest. */
function leaf(a: P, b: P, w: number, n = 18): Ring {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const len = Math.hypot(dx, dy) || 1;
	const [nx, ny] = [-dy / len, dx / len];
	const at = (t: number, side: number): P => {
		const off = side * (w / 2) * Math.sin(Math.PI * t);
		return [a[0] + dx * t + nx * off, a[1] + dy * t + ny * off];
	};
	const ts = Array.from({ length: n + 1 }, (_, k) => k / n);
	return [...ts.map((t) => at(t, 1)), ...ts.slice(1, -1).reverse().map((t) => at(t, -1))];
}

function path(...shapes: Shape[]): string {
	const rings = shapes.flatMap((s) => (isRing(s) ? [s] : s));
	return rings.map((r) => 'M' + r.map(([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`).join('L') + 'Z').join('');
}

const gear = blob(12, 12, (x, y) => {
	const a = Math.atan2(y - 12, x - 12);
	const tooth = ((((a / TAU) * 8) % 1) + 1) % 1;
	return inCircle(x, y, 12, 12, tooth > 0.2 && tooth < 0.62 ? 10.5 : 7.8);
});

/** One mark per docs page, keyed by what the page is about. */
export const ICONS = {
	'markless-mug': path(band(ellipse(10.2, 7.6, 6.6, 2.1), 1.3), ellipse(10.2, 7.6, 4.2, 0.8), [[3.4, 9.4], [4.3, 20], [6.2, 22.8], [14.2, 22.8], [16.1, 20], [17, 9.4], [16.4, 9.4], [10.2, 10.8], [4, 9.4]], bar(arc(17.4, 14.8, 4, -75, 80), 2.1), bar([[8, 0.8], [8.9, 2.3], [8, 3.8], [8.5, 4.6]], 1.1), bar([[12.2, 0.8], [13.1, 2.3], [12.2, 3.8], [12.7, 4.6]], 1.1)),
	sprout: path(bar([[12, 18.2], [12.2, 14], [11.6, 10.4]], 1.8), leaf([10.6, 11.2], [2.2, 6.4], 5.6), leaf([12.8, 9.6], [21.6, 2.4], 7), arc(12, 22, 9, 180, 360).map(([x, y]): P => [x, 22 + (y - 22) * 0.4])),
	'box-arrow': path(rect(3, 5.2, 18, 3, 0.8), band(rect(4, 9.4, 16, 13, 0.8), 1.6), [[7.4, 14.9], [12.2, 14.9], [12.2, 12.8], [16.6, 15.95], [12.2, 19.1], [12.2, 17], [7.4, 17]]),
	lens: path(ring(10, 10, 8, 1.9), bar(arc(10, 10, 4.6, 200, 250, 6), 1.3), bar([[16.2, 16.2], [21.6, 21.6]], 3.4)),
	jar: path(band(rect(4, 7, 16, 15.5, 3), 1.6), rect(5.5, 2.2, 13, 3.6, 1), turn(ellipse(9.2, 17.5, 1.9, 1.2), -20, 9.2, 17.5), turn(ellipse(14.2, 16.8, 1.9, 1.2), 25, 14.2, 16.8), turn(ellipse(11.6, 12.8, 1.9, 1.2), -5, 11.6, 12.8)),
	funnel: path(band([[2, 8], [22, 8], [14, 15.5], [14, 21], [10, 23], [10, 15.5]], 1.5), circle(7, 3.6, 2), circle(17, 3.6, 2), circle(12, 2.6, 1.4)),
	click: path([[9, 8], [9, 22.5], [12.4, 19], [14.8, 23.6], [17.4, 22.4], [15, 17.8], [19.8, 17.6]], bar([[9, 1.5], [9, 4.8]], 1.6), bar([[3.2, 3.8], [5.4, 6]], 1.6), bar([[2.2, 10.5], [5.4, 10.5]], 1.6), bar([[14.8, 3.8], [12.6, 6]], 1.6)),
	fork: path(bar([[7.6, 8.4], [12, 13.4], [16.4, 8.4]], 2.2), bar([[12, 15.4], [12, 22.5]], 2.2), [[3.8, 3.6], [9.4, 4.8], [5.2, 9]], [[20.2, 3.6], [14.6, 4.8], [18.8, 9]]),
	list: path(circle(4.5, 5.5, 1.8), circle(4.5, 12, 1.8), circle(4.5, 18.5, 1.8), rect(9, 4.4, 13, 2.2, 1.1), rect(9, 10.9, 10, 2.2, 1.1), rect(9, 17.4, 12, 2.2, 1.1)),
	hourglass: path(rect(4, 1.2, 16, 2.2, 1), rect(4, 20.6, 16, 2.2, 1), band([[6, 4], [18, 4], [18, 6.5], [13.4, 12], [18, 17.5], [18, 20], [6, 20], [6, 17.5], [10.6, 12], [6, 6.5]], 1.3), [[8.6, 18.4], [15.4, 18.4], [12, 15.2]], [[9.6, 7.4], [14.4, 7.4], [12, 10]]),
	brush: path(bar([[21.5, 2.5], [14.6, 9.4]], 2.6), turn(rect(11.6, 10.2, 4.6, 3.2, 0.6), -45, 13.9, 11.8), [[11.2, 13.6], [13, 15.4], [12.2, 18.6], [8.6, 21.4], [2.2, 22.2], [3.6, 18.8], [6.2, 15]]),
	brick: path(frame(2, 10, 20, 11.5, 1.6, 1), rect(5, 5.6, 5, 3.4, 0.8), rect(14, 5.6, 5, 3.4, 0.8)),
	crosshair: path(ring(12, 12, 8, 1.6), bar([[12, 0.8], [12, 3.4]], 1.8), bar([[12, 20.6], [12, 23.2]], 1.8), bar([[0.8, 12], [3.4, 12]], 1.8), bar([[20.6, 12], [23.2, 12]], 1.8), circle(12, 12, 2.4)),
	disk: path(band([[3, 3], [18, 3], [21, 6], [21, 21], [3, 21]], 1.6), [rect(7.5, 5.4, 8.5, 4.6, 0.4), rect(12.6, 6.2, 1.9, 3, 0.2)], frame(6.5, 13, 11, 6.4, 1.3, 0.4)),
	tag: path([[2, 12], [8, 5], [21.5, 5], [21.5, 19], [8, 19]], circle(8.6, 12, 1.7), bar([[11.6, 10], [18.5, 10]], 1.4), bar([[11.6, 14], [16.5, 14]], 1.4)),
	folder: path(band([[2, 4], [9, 4], [11, 6.5], [22, 6.5], [22, 20.5], [2, 20.5]], 1.6), rect(3.6, 9.2, 16.8, 1.3)),
	chain: path(turn(band(rect(1.5, 8.5, 12.5, 7, 3.5), 1.7), -40, 7.75, 12), turn(band(rect(10, 8.5, 12.5, 7, 3.5), 1.7), -40, 16.25, 12)),
	database: path([ellipse(12, 4.6, 8.5, 2.8), ellipse(12, 4.6, 6.6, 1.5)], drumBand(12, 5.8, 9.6, 8.5, 2.8), drumBand(12, 10.8, 14.6, 8.5, 2.8), drumBand(12, 15.8, 19.6, 8.5, 2.8)),
	braces: path(bar([[9.5, 2.5], [7.6, 3], [7, 5], [7, 9.6], [4.6, 12], [7, 14.4], [7, 19], [7.6, 21], [9.5, 21.5]], 1.9), bar([[14.5, 2.5], [16.4, 3], [17, 5], [17, 9.6], [19.4, 12], [17, 14.4], [17, 19], [16.4, 21], [14.5, 21.5]], 1.9), circle(12, 12, 1.3)),
	'cloud-up': path(band(blob(12.5, 13, (x, y) => inCircle(x, y, 6, 14.5, 4) || inCircle(x, y, 10.5, 10, 5.2) || inCircle(x, y, 16.5, 11, 4.4) || inCircle(x, y, 19, 15.2, 3.5) || inRect(x, y, 6, 12, 13, 6.7), 90), 1.6), [[12.5, 9.6], [16, 13.2], [13.7, 13.2], [13.7, 16.4], [11.3, 16.4], [11.3, 13.2], [9, 13.2]]),
	editor: path(frame(2, 3, 20, 18, 1.6, 1.5), circle(5.6, 6.6, 0.9), circle(8.4, 6.6, 0.9), rect(5, 10, 6, 1.6, 0.8), rect(7.6, 13.2, 7, 1.6, 0.8), rect(7.6, 16.4, 4.6, 1.6, 0.8), bar([[16.6, 12.6], [16.6, 18]], 1.4)),
	typecheck: path([[2.5, 3], [15, 3], [15, 6.2], [10.4, 6.2], [10.4, 21], [7.1, 21], [7.1, 6.2], [2.5, 6.2]], bar([[13, 15.8], [16, 19.2], [21.6, 10.6]], 2.4)),
	flask: path(band([[8.8, 2], [15.2, 2], [15.2, 4], [14.2, 4], [14.2, 9], [20.8, 20.2], [19.8, 22], [4.2, 22], [3.2, 20.2], [9.8, 9], [9.8, 4], [8.8, 4]], 1.4), [[8.4, 15.6], [15.6, 15.6], [18, 19.8], [6, 19.8]], circle(11, 12.4, 0.9), circle(13, 10.6, 0.7)),
	warning: path(band([[12, 2], [22.8, 21.2], [1.2, 21.2]], 1.6), bar([[12, 8.8], [12, 14.4]], 2.3), circle(12, 17.4, 1.3)),
	balance: path(circle(12, 3, 1.5), rect(2, 5.2, 20, 1.7, 0.8), bar([[12, 8], [12, 19.6]], 1.8), rect(7, 20.2, 10, 2.2, 1), bar([[4, 8], [1.6, 13.4]], 1), bar([[6, 8], [8.4, 13.4]], 1), bar([[18, 8], [15.6, 13.4]], 1), bar([[20, 8], [22.4, 13.4]], 1), arc(5, 14, 4.2, 0, 180), arc(19, 14, 4.2, 0, 180)),
	bulb: path(band(blob(12, 10, (x, y) => inCircle(x, y, 12, 9, 7.2) || (inRect(x, y, 8.4, 12, 7.2, 5.4) && y > 9)), 1.6), rect(8.4, 18.2, 7.2, 1.6, 0.8), rect(9.6, 20.6, 4.8, 1.6, 0.8), bar([[9.6, 14], [10.8, 10.6], [12, 13.4], [13.2, 10.6], [14.4, 14]], 1)),
	gear: path([gear, circle(12, 12, 3.2)]),
	envelope: path(frame(1.5, 5, 21, 14, 1.6, 1), bar([[4.4, 7.6], [12, 13.4], [19.6, 7.6]], 1.6)),
	play: path(ring(12, 12, 10.5, 1.6), [[9.4, 7.2], [17.4, 12], [9.4, 16.8]]),
	graph: path(ring(5, 5, 3, 1.2), ring(19, 6.5, 3, 1.2), ring(8, 19, 3, 1.2), ring(19.5, 18.5, 2.4, 1.1), bar([[8.1, 5.4], [15.9, 6.1]], 1.3), bar([[5.8, 8], [7.2, 16]], 1.3), bar([[11, 18.8], [17, 18.6]], 1.3), bar([[19.1, 9.6], [19.4, 16]], 1.3)),
	puzzle: path(blob(12, 13.5, (x, y) => (inRect(x, y, 3, 6.5, 15.5, 15.5) || inCircle(x, y, 10.75, 4.6, 2.9) || inCircle(x, y, 20.4, 14.25, 2.9)) && !inCircle(x, y, 3, 14.25, 2.6))),
	phone: path([rect(6, 1.5, 12, 21, 2.4), rect(7.6, 4.4, 8.8, 14.4, 0.6)], circle(12, 20.6, 0.9), rect(9.1, 6.6, 2.4, 2.4, 0.5), rect(12.5, 6.6, 2.4, 2.4, 0.5), rect(9.1, 10.2, 2.4, 2.4, 0.5), rect(12.5, 10.2, 2.4, 2.4, 0.5)),
	map: path([[1.5, 5.4], [7.6, 3], [7.6, 18.6], [1.5, 21]], [[8.6, 3.2], [15.4, 5.4], [15.4, 21], [8.6, 18.8]], [[16.4, 5.4], [22.5, 3], [22.5, 18.6], [16.4, 21]]),
	wrench: path(blob(16, 8, (x, y) => {
		const [dx, dy] = [x - 16, y - 8];
		const along = (dx - dy) / Math.SQRT2;
		const across = (dx + dy) / Math.SQRT2;
		const head = inCircle(x, y, 16, 8, 5.6) && !(along > 1.6 && Math.abs(across) < 2.1);
		const handle = along < 0 && along > -16 && Math.abs(across) < 1.7;
		return head || handle;
	}, 160)),
	'pull-request': path(ring(6, 4.8, 2.7, 1.2), ring(6, 19.2, 2.7, 1.2), ring(18, 19.2, 2.7, 1.2), bar([[6, 8.2], [6, 15.8]], 1.6), bar([[18, 15.8], [18, 9.4], [17, 6.6], [14.4, 4.8]], 1.6), [[10, 4.8], [13.8, 1.9], [13.8, 7.7]]),
	'check-circle': path(ring(12, 12, 10.5, 1.6), bar([[6.8, 12.4], [10.4, 16], [17.2, 8.2]], 2.4)),
	ruler: path(turn([...band(rect(0.5, 7.5, 23, 9, 0.8), 1.4), rect(4, 9.4, 1.3, 3.6), rect(7.6, 9.4, 1.3, 2.2), rect(11.2, 9.4, 1.3, 3.6), rect(14.8, 9.4, 1.3, 2.2), rect(18.4, 9.4, 1.3, 3.6)], -30)),
	pencil: path(turn([rect(1, 9.4, 2.6, 5.2, 0.8), rect(4.4, 9.4, 11.8, 5.2), [[17, 9.4], [22.8, 12], [17, 14.6]]], -45)),
	parcel: path(rect(1.5, 2.6, 21, 4.2, 0.8), [rect(3, 7.6, 18, 14.6, 0.6), rect(10.5, 9.2, 3, 5, 0.3), rect(5.4, 16.2, 6, 3.6, 0.3)]),
	book: path([rect(4, 2, 16.5, 20, 1.4), rect(8, 3.6, 10.8, 12.4, 0.4), rect(8, 17.6, 10.8, 2.8, 0.4)], rect(10.2, 6.4, 6.4, 1.6, 0.6), rect(10.2, 9.4, 4.4, 1.6, 0.6)),
	terminal: path(frame(1.5, 3.5, 21, 17, 1.6, 1.5), bar([[6, 9], [9.6, 12], [6, 15]], 1.9), rect(11, 14, 6.4, 1.9, 0.5)),
	stop: path(band(turn(ellipse(12, 12, 10.8, 10.8, 8), 22.5), 1.6), turn(plus(12, 12, 10, 2.4), 45)),
	mug: path(band(rect(3, 7.5, 13, 15, 2.2), 1.6), bar(arc(16, 15, 4.4, -80, 80), 1.8), bar([[7, 1.5], [8, 3], [7, 4.6], [7.6, 5.6]], 1.1), bar([[11.4, 1.5], [12.4, 3], [11.4, 4.6], [12, 5.6]], 1.1)),
	shapes: path(circle(6.5, 6.5, 4.4), rect(13.2, 2.1, 8.8, 8.8, 1), [[6.5, 13], [11, 21.8], [2, 21.8]], [[17.6, 12.8], [22.2, 17.4], [17.6, 22], [13, 17.4]]),
	palette: path([blob(11.5, 11, (x, y) => ((x - 12) / 10.6) ** 2 + ((y - 12) / 9.2) ** 2 <= 1 && !inCircle(x, y, 19.6, 16.6, 3.2)), circle(6.6, 9.6, 1.7), circle(10.8, 6.4, 1.7), circle(16, 7, 1.7), circle(7.4, 15, 1.7)]),
	checkbox: path(frame(2.5, 2.5, 19, 19, 1.8, 3), bar([[6.8, 12.4], [10.4, 16], [17, 7.8]], 2.4)),
	checklist: path(bar([[2, 5.4], [3.8, 7.4], [7.4, 2.8]], 1.7), bar([[2, 12.2], [3.8, 14.2], [7.4, 9.6]], 1.7), frame(2.2, 16, 5.6, 5.6, 1.3, 1), rect(10.5, 4.2, 11.5, 2.2, 1.1), rect(10.5, 11, 9, 2.2, 1.1), rect(10.5, 17.8, 10.5, 2.2, 1.1)),
	combobox: path(frame(1.5, 2, 21, 7, 1.4, 1.5), bar([[5.2, 3.9], [5.2, 7.1]], 1.2), bar([[16.4, 4.6], [18, 6.3], [19.6, 4.6]], 1.3), frame(1.5, 11, 21, 11.5, 1.4, 1.5), rect(4.2, 13.8, 11, 1.7, 0.8), rect(4.2, 17.6, 14, 1.7, 0.8)),
	otp: path(frame(1, 7, 4.4, 10, 1.2, 1), frame(6.9, 7, 4.4, 10, 1.2, 1), frame(12.8, 7, 4.4, 10, 1.2, 1), frame(18.7, 7, 4.4, 10, 1.2, 1), circle(3.2, 12, 1), circle(9.1, 12, 1), circle(15, 12, 1), bar([[20.9, 9.6], [20.9, 14.4]], 1)),
	radio: path(ring(5, 7, 3.6, 1.3), circle(5, 7, 1.4), ring(5, 17, 3.6, 1.3), rect(11, 5.9, 11, 2.2, 1.1), rect(11, 15.9, 8, 2.2, 1.1)),
	select: path(frame(1, 6, 22, 12, 1.5, 3), rect(4.2, 11.1, 8, 1.8, 0.9), [[14.6, 10.2], [20.2, 10.2], [17.4, 14]]),
	textbox: path(frame(1, 5, 22, 14, 1.5, 2), rect(4.2, 11.1, 7, 1.8, 0.9), [[13.2, 7.6], [17.2, 7.6], [17.2, 9.2], [16, 9.2], [16, 14.8], [17.2, 14.8], [17.2, 16.4], [13.2, 16.4], [13.2, 14.8], [14.4, 14.8], [14.4, 9.2], [13.2, 9.2]]),
	switch: path(band(rect(1.5, 6, 21, 12, 6), 1.6), circle(16.4, 12, 3.6)),
	accordion: path(rect(2, 1.5, 20, 3.6, 1.2), frame(3, 6.2, 18, 8, 1.2, 0.6), rect(5.6, 9.4, 9, 1.6, 0.8), rect(2, 15.4, 20, 3.4, 1.2), rect(2, 19.8, 20, 3.4, 1.2)),
	disclosure: path([[2.5, 4.4], [9, 4.4], [5.75, 8.6]], rect(11, 5.3, 10.5, 2.4, 1.2), frame(2.5, 11.5, 19, 10.5, 1.4, 1), rect(5.2, 14.5, 10, 1.7, 0.8), rect(5.2, 18, 13, 1.7, 0.8)),
	modal: path([rect(1.5, 2.5, 21, 19, 1.5), rect(5.5, 6.5, 13, 11, 1)], rect(7.6, 9, 8.8, 1.7, 0.8), rect(7.6, 12.6, 5.6, 1.7, 0.8)),
	hamburger: path(frame(1.5, 2.5, 21, 7, 1.3, 1), circle(5.2, 6, 1.4), rect(11, 5.2, 3.6, 1.6, 0.6), rect(16.4, 5.2, 3.6, 1.6, 0.6), rect(1.5, 13.4, 15, 2, 1), rect(1.5, 18.4, 20, 2, 1)),
	tabs: path(band([[2, 22], [2, 3.5], [9.4, 3.5], [9.4, 8.5], [22, 8.5], [22, 22]], 1.4), rect(10.3, 3.5, 5.3, 4, 0.6), rect(16.5, 3.5, 5.3, 4, 0.6), rect(5, 12.4, 10, 1.7, 0.8), rect(5, 16, 13, 1.7, 0.8)),
	tree: path(rect(2, 1.5, 7, 5.5, 1), bar([[5.5, 8], [5.5, 19.6], [10, 19.6]], 1.4), bar([[6.4, 12.8], [10, 12.8]], 1.4), frame(11, 10.6, 11, 4.4, 1.2, 1), frame(11, 17.4, 11, 4.4, 1.2, 1)),
	drawer: path(frame(1.5, 3, 21, 18, 1.4, 1.2), rect(13.4, 5.4, 7, 13.2, 0.6), bar([[6.4, 9], [9.4, 12], [6.4, 15]], 1.5)),
	hovercard: path(frame(6, 1.5, 16.5, 12.5, 1.4, 1.2), circle(10.2, 6, 1.9), rect(13.4, 5.2, 6.6, 1.5, 0.7), rect(9, 9.6, 10.6, 1.5, 0.7), [[2.6, 13.4], [2.6, 23], [4.9, 20.8], [6.5, 23.8], [8.1, 23], [6.6, 20.1], [9.8, 19.9]]),
	popover: path(band([[2, 1.5], [22, 1.5], [22, 12.5], [9.5, 12.5], [6.6, 15.4], [3.7, 12.5], [2, 12.5]], 1.4), rect(5, 5, 11, 1.6, 0.8), rect(5, 8.2, 14, 1.6, 0.8), rect(2, 17.4, 9.4, 5, 1.4)),
	tooltip: path([[5, 2.5], [19, 2.5], [19, 9.8], [13.6, 9.8], [12, 12.2], [10.4, 9.8], [5, 9.8]], rect(3.5, 14.8, 17, 2.4, 1.2), rect(3.5, 19, 3, 1.3, 0.6), rect(8.2, 19, 3, 1.3, 0.6), rect(12.9, 19, 3, 1.3, 0.6), rect(17.6, 19, 2.9, 1.3, 0.6)),
	gridlist: path(frame(2, 2, 9, 9, 1.4, 1.2), frame(13, 2, 9, 9, 1.4, 1.2), frame(2, 13, 9, 9, 1.4, 1.2), frame(13, 13, 9, 9, 1.4, 1.2), rect(4.4, 6.9, 4.2, 1.4, 0.6), rect(15.4, 6.9, 4.2, 1.4, 0.6), rect(4.4, 17.9, 4.2, 1.4, 0.6), rect(15.4, 17.9, 4.2, 1.4, 0.6)),
	table: path(frame(1.5, 3, 21, 18, 1.4, 1), rect(3.2, 8.4, 17.6, 1.3), rect(3.2, 14.2, 17.6, 1.3), rect(8.6, 4.7, 1.3, 3.4), rect(8.6, 10, 1.3, 3.9), rect(8.6, 15.8, 1.3, 3.5)),
	resizable: path(frame(1, 4, 7.5, 16, 1.3, 1), frame(15.5, 4, 7.5, 16, 1.3, 1), [[9.2, 12], [11.4, 9.6], [11.4, 11.1], [12.6, 11.1], [12.6, 9.6], [14.8, 12], [12.6, 14.4], [12.6, 12.9], [11.4, 12.9], [11.4, 14.4]]),
	carousel: path(frame(6, 2.5, 12, 15, 1.4, 1.2), rect(1.4, 4.6, 3.2, 10.8, 0.8), rect(19.4, 4.6, 3.2, 10.8, 0.8), circle(8.6, 21.2, 1), circle(12, 21.2, 1.5), circle(15.4, 21.2, 1)),
	pagination: path(frame(1, 7.5, 6.4, 9, 1.2, 1), bar([[5, 10], [3.3, 12], [5, 14]], 1.2), rect(8.8, 7.5, 6.4, 9, 1), frame(16.6, 7.5, 6.4, 9, 1.2, 1), bar([[19, 10], [20.7, 12], [19, 14]], 1.2)),
	progress: path(band(rect(1, 7.5, 22, 9, 4.5), 1.4), rect(3.2, 9.8, 11.5, 4.4, 2.2)),
	qrcode: path(frame(1.5, 1.5, 8, 8, 1.5, 0.6), rect(4.1, 4.1, 2.8, 2.8, 0.3), frame(14.5, 1.5, 8, 8, 1.5, 0.6), rect(17.1, 4.1, 2.8, 2.8, 0.3), frame(1.5, 14.5, 8, 8, 1.5, 0.6), rect(4.1, 17.1, 2.8, 2.8, 0.3), rect(11, 2, 2.2, 2.2), rect(11, 6.5, 2.2, 2.2), rect(11, 11, 2.2, 2.2), rect(2, 11, 2.2, 2.2), rect(6.5, 11, 2.2, 2.2), rect(15, 11, 2.2, 2.2), rect(19.8, 11, 2.2, 2.2), rect(11, 15.5, 2.2, 2.2), rect(15, 15.5, 2.2, 2.2), rect(19.8, 17.2, 2.2, 2.2), rect(11, 20, 2.2, 2.2), rect(15.5, 20, 2.2, 2.2)),
	bell: path(blob(12, 12, (x, y) => (inCircle(x, y, 12, 10.2, 6.6) && y <= 10.2) || (y > 10.2 && y <= 16.6 && Math.abs(x - 12) <= 6.6 + (y - 10.2) * 0.3) || (y > 16.6 && y <= 18.4 && Math.abs(x - 12) <= 9.6)), circle(12, 2.2, 1.2), arc(12, 19.6, 2.4, 0, 180)),
};
