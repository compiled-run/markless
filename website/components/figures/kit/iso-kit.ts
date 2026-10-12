export type Flat = [number, number];
export type Point3 = [number, number, number];
export type Plane = [number, number];

export interface Projection {
	origin: Flat;
	scale: number;
	azimuth?: number;
	elevation?: number;
	/** A pinhole camera: how far the eye sits from `target` toward the viewer. Absent means a parallel (isometric) camera. */
	distance?: number;
	/** The point the pinhole camera looks at; it projects where the parallel camera would put it. */
	target?: Point3;
	/** World direction toward the light; from the camera's left when not given. */
	light?: Point3;
}

/** A pinhole camera from an eye point looking at a target: parallel edges converge, near parts draw larger. Pass to `fitProjection`. */
export function perspectiveProjection({ eye, target }: { eye: Point3; target: Point3 }) {
	const toward: Point3 = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
	const distance = Math.hypot(...toward);
	return {
		azimuth: Math.atan2(toward[1], toward[0]) / RADIANS,
		elevation: Math.asin(toward[2] / distance) / RADIANS,
		distance,
		target,
	};
}

/** The parallel camera looking down the same axis as a pinhole one; the audit measures depth and overlap with it. */
export const parallelOf = ({ distance: _distance, target: _target, ...rest }: Projection): Projection => rest;

/** Where the eye of a pinhole camera sits, or undefined for a parallel camera. */
export function eyeOf(projection: Projection): Point3 | undefined {
	if (!projection.distance) return undefined;
	const { sinA, cosA, sinE, cosE } = cameraOf(projection);
	const [tx, ty, tz] = projection.target ?? [0, 0, 0];
	const d = projection.distance;
	return [tx + cosA * cosE * d, ty + sinA * cosE * d, tz + sinE * d];
}

export interface Plan {
	x: number;
	y: number;
	w: number;
	d: number;
	r: number;
}

export interface SolidPaths {
	fill: string;
	outline: string;
	crease: string;
	top: string;
	shades: string[];
	bevel?: string;
	seamless?: boolean;
}

export type Tone = 'hi' | 'mid' | 'lo' | 'faint';
export type LineTone = Tone | 'lit' | 'pencil' | 'red' | 'green' | 'blue';

export const AZIMUTH = 45;
export const ELEVATION = 30;
export const SHADES = 4;

const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);

interface Camera {
	sinA: number;
	cosA: number;
	sinE: number;
	cosE: number;
	k: number;
}

export function cameraOf({ scale, azimuth = AZIMUTH, elevation = ELEVATION }: Projection): Camera {
	const a = azimuth * RADIANS;
	const e = elevation * RADIANS;
	return {
		sinA: Math.sin(a),
		cosA: Math.cos(a),
		sinE: Math.sin(e),
		cosE: Math.cos(e),
		k: scale * UNIT,
	};
}

export function iso([x, y, z]: Point3, projection: Projection): Flat {
	const { origin, distance } = projection;
	const { sinA, cosA, sinE, cosE, k } = cameraOf(projection);
	const right = x * sinA - y * cosA;
	const down = (x * cosA + y * sinA) * sinE - z * cosE;
	if (!distance) return [origin[0] + right * k, origin[1] + down * k];
	const [tx, ty, tz] = projection.target ?? [0, 0, 0];
	const centreRight = tx * sinA - ty * cosA;
	const centreDown = (tx * cosA + ty * sinA) * sinE - tz * cosE;
	const toward = ((x - tx) * cosA + (y - ty) * sinA) * cosE + (z - tz) * sinE;
	const grow = distance / Math.max(distance * 0.05, distance - toward);
	return [
		origin[0] + (centreRight + (right - centreRight) * grow) * k,
		origin[1] + (centreDown + (down - centreDown) * grow) * k,
	];
}

export function towardViewer(projection: Projection): Plane {
	const { sinA, cosA } = cameraOf(projection);
	return [cosA, sinA];
}

export function depthOf([x, y, z]: Point3, projection: Projection) {
	const { sinA, cosA, sinE, cosE } = cameraOf(projection);
	return (x * cosA + y * sinA) * cosE + z * sinE;
}

const tenth = (value: number) => {
	const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
	return text === '-0' ? '0' : text;
};

export function pathOf(points: Flat[], closed = false) {
	if (!points.length) return '';
	return (
		points.map(([x, y], at) => `${at ? 'L' : 'M'}${tenth(x)} ${tenth(y)}`).join('') +
		(closed ? 'Z' : '')
	);
}

export const joinPaths = (paths: string[]) => paths.filter(Boolean).join('');

export function roundedPlan({ x, y, w, d, r }: Plan, steps = 8): Plane[] {
	const radius = Math.max(0, Math.min(r, w / 2, d / 2));
	const corners: [number, number, number][] = [
		[x + w - radius, y + radius, -90],
		[x + w - radius, y + d - radius, 0],
		[x + radius, y + d - radius, 90],
		[x + radius, y + radius, 180],
	];
	const out: Plane[] = [];
	for (const [cx, cy, start] of corners) {
		const count = radius > 0 ? steps : 0;
		for (let step = 0; step <= count; step++) {
			const angle = (start + (count ? (90 * step) / count : 45)) * RADIANS;
			out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
		}
	}
	return out;
}

function signedArea(points: Plane[] | Flat[]) {
	let area = 0;
	for (let index = 0; index < points.length; index++) {
		const [ax, ay] = points[index]!;
		const [bx, by] = points[(index + 1) % points.length]!;
		area += ax * by - bx * ay;
	}
	return area / 2;
}

const oriented = (points: Flat[]) => (signedArea(points) < 0 ? [...points].reverse() : points);

function convexHull(points: Flat[]): Flat[] {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (sorted.length < 3) return sorted;
	const cross = (o: Flat, a: Flat, b: Flat) =>
		(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: Flat[] = [];
	for (const point of sorted) {
		while (
			lower.length >= 2 &&
			cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
		)
			lower.pop();
		lower.push(point);
	}
	const upper: Flat[] = [];
	for (let index = sorted.length - 1; index >= 0; index--) {
		const point = sorted[index]!;
		while (
			upper.length >= 2 &&
			cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
		)
			upper.pop();
		upper.push(point);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function runsOf(flags: boolean[], want: boolean) {
	const count = flags.length;
	const runs: number[][] = [];
	const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
	if (start < 0)
		return flags[0] === want
			? [Array.from({ length: count + 1 }, (_, index) => index % count)]
			: [];
	let run: number[] | null = null;
	for (let step = 0; step < count; step++) {
		const index = (start + step) % count;
		if (flags[index] === want) {
			if (!run) run = [index];
			run.push((index + 1) % count);
		} else if (run) {
			runs.push(run);
			run = null;
		}
	}
	if (run) runs.push(run);
	return runs;
}

export interface ExtrudeOptions {
	convex?: boolean;
	bevel?: number;
}

export function extrude(
	ring: Plane[],
	z: number,
	height: number,
	projection: Projection,
	options: ExtrudeOptions = {},
): SolidPaths {
	const convex = options.convex ?? true;
	const count = ring.length;
	const counter = signedArea(ring) > 0;
	const [vx, vy] = towardViewer(projection);
	const eye = eyeOf(projection);
	const { sinA, cosA } = cameraOf(projection);
	const normals = ring.map(([ax, ay], index) => {
		const [bx, by] = ring[(index + 1) % count]!;
		const dx = bx - ax;
		const dy = by - ay;
		const length = Math.hypot(dx, dy) || 1;
		return (counter ? [dy / length, -dx / length] : [-dy / length, dx / length]) as Plane;
	});
	const facing = normals.map(([nx, ny], index) => {
		if (!eye) return nx * vx + ny * vy > 1e-9;
		const [ax, ay] = ring[index]!;
		const [bx, by] = ring[(index + 1) % count]!;
		return nx * (eye[0] - (ax + bx) / 2) + ny * (eye[1] - (ay + by) / 2) > 1e-9;
	});
	const top = ring.map(([x, y]) => iso([x, y, z + height], projection));
	const bottom = ring.map(([x, y]) => iso([x, y, z], projection));
	const outline: string[] = [];
	const crease: string[] = [];
	for (const run of runsOf(facing, false)) outline.push(pathOf(run.map((index) => top[index]!)));
	for (const run of runsOf(facing, true)) {
		crease.push(pathOf(run.map((index) => top[index]!)));
		if (height > 0) outline.push(pathOf(run.map((index) => bottom[index]!)));
	}
	if (height > 0) {
		for (let index = 0; index < count; index++) {
			if (facing[(index + count - 1) % count] !== facing[index])
				outline.push(pathOf([top[index]!, bottom[index]!]));
		}
	}
	let fill: string;
	if (convex) {
		fill = pathOf(convexHull([...top, ...bottom]), true);
	} else {
		const parts = [pathOf(oriented(top), true), pathOf(oriented(bottom), true)];
		for (let index = 0; index < count; index++) {
			if (!facing[index]) continue;
			const next = (index + 1) % count;
			parts.push(
				pathOf(oriented([top[index]!, top[next]!, bottom[next]!, bottom[index]!]), true),
			);
		}
		fill = parts.join('');
	}
	const buckets: string[][] = Array.from({ length: SHADES }, () => []);
	if (height > 0) {
		const flatLight = projection.light ? Math.hypot(projection.light[0], projection.light[1]) || 1 : 1;
		const [lx, ly] = projection.light ? [projection.light[0] / flatLight, projection.light[1] / flatLight] : [-sinA, cosA];
		for (let index = 0; index < count; index++) {
			if (!facing[index]) continue;
			const [nx, ny] = normals[index]!;
			const lit = (nx * lx + ny * ly + 1) / 2;
			const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
			const next = (index + 1) % count;
			buckets[shade]!.push(
				pathOf(oriented([top[index]!, top[next]!, bottom[next]!, bottom[index]!]), true),
			);
		}
	}
	let bevel: string | undefined;
	if (options.bevel && options.bevel > 0) {
		const by = options.bevel;
		const inset = ring.map(([x, y], index) => {
			const [ax, ay] = normals[(index + count - 1) % count]!;
			const [bx, by2] = normals[index]!;
			const mx = ax + bx;
			const my = ay + by2;
			const length = Math.hypot(mx, my) || 1;
			return [x - (mx / length) * by, y - (my / length) * by] as Plane;
		});
		const insetTop = inset.map(([x, y]) => iso([x, y, z + height], projection));
		bevel = runsOf(facing, true)
			.map((run) =>
				pathOf([
					top[run[0]!]!,
					...run.slice(1, -1).map((index) => insetTop[index]!),
					top[run[run.length - 1]!]!,
				]),
			)
			.join('');
	}
	return {
		fill,
		outline: outline.join(''),
		crease: crease.join(''),
		top: pathOf(oriented(top), true),
		shades: buckets.map((paths) => paths.join('')),
		bevel,
	};
}

export const ringOf = (plan: Plan, steps = 8): Plane[] => roundedPlan(plan, steps);

export function slabOf(
	plan: Plan,
	z: number,
	height: number,
	projection: Projection,
	steps = 8,
	bevel = 0,
) {
	return extrude(ringOf(plan, steps), z, height, projection, { convex: true, bevel });
}

export function circleRing(cx: number, cy: number, radius: number, steps = 40): Plane[] {
	return Array.from({ length: steps }, (_, step) => {
		const angle = (step / steps) * Math.PI * 2;
		return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as Plane;
	});
}

export function cylinder(
	cx: number,
	cy: number,
	radius: number,
	z: number,
	height: number,
	projection: Projection,
	steps = 32,
	bevel = 0,
) {
	return extrude(circleRing(cx, cy, radius, steps), z, height, projection, {
		convex: true,
		bevel,
	});
}

export const insetPlan = ({ x, y, w, d, r }: Plan, by: number): Plan => ({
	x: x + by,
	y: y + by,
	w: w - by * 2,
	d: d - by * 2,
	r: Math.max(0, r - by),
});

export function onTop(points: Plane[], z: number, projection: Projection, closed = false) {
	return pathOf(
		points.map(([x, y]) => iso([x, y, z], projection)),
		closed,
	);
}

export const planOutline = (plan: Plan, z: number, projection: Projection, steps = 8) =>
	onTop(ringOf(plan, steps), z, projection, true);

export const lineOnTop = (from: Plane, to: Plane, z: number, projection: Projection) =>
	onTop([from, to], z, projection);

export const segment = (from: Point3, to: Point3, projection: Projection) =>
	pathOf([iso(from, projection), iso(to, projection)]);

export const rise = (at: Plane, from: number, to: number, projection: Projection) =>
	segment([at[0], at[1], from], [at[0], at[1], to], projection);

export const ring = (
	cx: number,
	cy: number,
	radius: number,
	z: number,
	projection: Projection,
	steps = 40,
) => onTop(circleRing(cx, cy, radius, steps), z, projection, true);

export const pointsAt = (points: Point3[], projection: Projection): Flat[] =>
	points.map((point) => iso(point, projection));

export function dotGrid(
	x: number,
	y: number,
	columns: number,
	rows: number,
	gap: number,
	z: number,
	projection: Projection,
): Flat[] {
	const dots: Flat[] = [];
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++)
			dots.push(iso([x + column * gap, y + row * gap, z], projection));
	}
	return dots;
}

export function corners({ x, y, w, d }: Plan, inset = 0): Plane[] {
	return [
		[x + inset, y + inset],
		[x + w - inset, y + inset],
		[x + inset, y + d - inset],
		[x + w - inset, y + d - inset],
	];
}

export function boxCorners({ x, y, w, d }: Plan, z0: number, z1: number): Point3[] {
	const out: Point3[] = [];
	for (const px of [x, x + w])
		for (const py of [y, y + d]) for (const z of [z0, z1]) out.push([px, py, z]);
	return out;
}

export function knurl(
	cx: number,
	cy: number,
	radius: number,
	z0: number,
	z1: number,
	count: number,
	projection: Projection,
	inset = 0.4,
) {
	const [vx, vy] = towardViewer(projection);
	const lines: string[] = [];
	for (let index = 0; index < count; index++) {
		const angle = (index / count) * Math.PI * 2;
		const nx = Math.cos(angle);
		const ny = Math.sin(angle);
		if (nx * vx + ny * vy < 0.15) continue;
		lines.push(
			segment(
				[cx + radius * nx, cy + radius * ny, z0 + inset],
				[cx + radius * nx, cy + radius * ny, z1 - inset],
				projection,
			),
		);
	}
	return lines.join('');
}

export function sideArc(
	cx: number,
	cy: number,
	radius: number,
	z: number,
	projection: Projection,
	steps = 24,
) {
	const [vx, vy] = towardViewer(projection);
	const facing = Math.atan2(vy, vx);
	const points: Flat[] = [];
	for (let step = 0; step <= steps; step++) {
		const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
		points.push(
			iso([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z], projection),
		);
	}
	return pathOf(points);
}

export function ringSeam(ring: Plane[], z: number, projection: Projection) {
	const count = ring.length;
	const counter = signedArea(ring) > 0;
	const [vx, vy] = towardViewer(projection);
	const facing = ring.map(([ax, ay], index) => {
		const [bx, by] = ring[(index + 1) % count];
		const dx = bx - ax;
		const dy = by - ay;
		const [nx, ny] = counter ? [dy, -dx] : [-dy, dx];
		return nx * vx + ny * vy > 1e-9;
	});
	return runsOf(facing, true)
		.map((run) =>
			pathOf(run.map((index) => iso([ring[index][0], ring[index][1], z], projection))),
		)
		.join('');
}

export const sideSeam = (plan: Plan, z: number, projection: Projection, steps = 8) =>
	ringSeam(ringOf(plan, steps), z, projection);

export function sideRing(
	center: Point3,
	radius: number,
	axis: 'x' | 'y',
	projection: Projection,
	steps = 20,
) {
	const [px, py, pz] = center;
	const points: Flat[] = [];
	for (let step = 0; step < steps; step++) {
		const angle = (step / steps) * Math.PI * 2;
		const u = radius * Math.cos(angle);
		const v = radius * Math.sin(angle);
		points.push(iso(axis === 'x' ? [px, py + u, pz + v] : [px + u, py, pz + v], projection));
	}
	return pathOf(points, true);
}

export function coil(
	from: number,
	to: number,
	center: Plane,
	radius: number,
	turns: number,
	axis: 'x' | 'y',
	projection: Projection,
	perTurn = 16,
) {
	const count = Math.max(1, Math.round(turns * perTurn));
	const back: string[] = [];
	const front: string[] = [];
	let run: Flat[] = [];
	let near: boolean | null = null;
	for (let index = 0; index <= count; index++) {
		const share = index / count;
		const angle = share * turns * Math.PI * 2;
		const u = radius * Math.cos(angle);
		const v = radius * Math.sin(angle);
		const along = from + (to - from) * share;
		const point: Point3 =
			axis === 'x'
				? [along, center[0] + u, center[1] + v]
				: [center[0] + u, along, center[1] + v];
		const normal: Point3 =
			axis === 'x'
				? [0, Math.cos(angle), Math.sin(angle)]
				: [Math.cos(angle), 0, Math.sin(angle)];
		const facing = depthOf(normal, projection) > 0;
		const flat = iso(point, projection);
		if (near === null) near = facing;
		if (facing !== near) {
			run.push(flat);
			(near ? front : back).push(pathOf(run));
			run = [flat];
			near = facing;
			continue;
		}
		run.push(flat);
	}
	if (run.length > 1) (near ? front : back).push(pathOf(run));
	return { back: back.join(''), front: front.join('') };
}

export interface Ticks {
	minor: string;
	major: string;
}

export function topTicks(
	from: number,
	to: number,
	step: number,
	every: number,
	edge: number,
	z: number,
	lengths: [number, number],
	projection: Projection,
	axis: 'x' | 'y' = 'x',
): Ticks {
	const minor: string[] = [];
	const major: string[] = [];
	const first = Math.ceil(from / step) * step;
	for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
		const big = index % every === 0;
		const length = big ? lengths[1] : lengths[0];
		const a: Plane = axis === 'x' ? [at, edge] : [edge, at];
		const b: Plane = axis === 'x' ? [at, edge + length] : [edge + length, at];
		(big ? major : minor).push(lineOnTop(a, b, z, projection));
	}
	return { minor: minor.join(''), major: major.join('') };
}

export function sideTicks(
	from: number,
	to: number,
	step: number,
	every: number,
	face: number,
	top: number,
	lengths: [number, number],
	projection: Projection,
	axis: 'x' | 'y' = 'x',
): Ticks {
	const minor: string[] = [];
	const major: string[] = [];
	const first = Math.ceil(from / step) * step;
	for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
		const big = index % every === 0;
		const length = big ? lengths[1] : lengths[0];
		const a: Point3 = axis === 'x' ? [at, face, top] : [face, at, top];
		const b: Point3 = axis === 'x' ? [at, face, top - length] : [face, at, top - length];
		(big ? major : minor).push(segment(a, b, projection));
	}
	return { minor: minor.join(''), major: major.join('') };
}

export function radialTicks(
	cx: number,
	cy: number,
	radius: number,
	count: number,
	every: number,
	z: number,
	lengths: [number, number],
	projection: Projection,
	from = 0,
	span = Math.PI * 2,
): Ticks {
	const minor: string[] = [];
	const major: string[] = [];
	const closed = Math.abs(span - Math.PI * 2) < 1e-9;
	const steps = closed ? count : count + 1;
	for (let index = 0; index < steps; index++) {
		const angle = from + (index / count) * span;
		const big = index % every === 0;
		const inner = radius - (big ? lengths[1] : lengths[0]);
		const sx = Math.sin(angle);
		const sy = -Math.cos(angle);
		(big ? major : minor).push(
			lineOnTop(
				[cx + sx * inner, cy + sy * inner],
				[cx + sx * radius, cy + sy * radius],
				z,
				projection,
			),
		);
	}
	return { minor: minor.join(''), major: major.join('') };
}

export const haloOf = (plan: Plan, z: number, height: number, projection: Projection) =>
	slabOf(plan, z, height, projection).fill;

export function axisVector(projection: Projection, [dx, dy, dz]: Point3): Flat {
	const origin = iso([0, 0, 0], projection);
	const moved = iso([dx, dy, dz], projection);
	return [moved[0] - origin[0], moved[1] - origin[1]];
}

const fine = (value: number) => Math.round(value * 100) / 100;

export function translateAlong(projection: Projection, by: Point3) {
	const [x, y] = axisVector(projection, by);
	return `translate(${fine(x)} ${fine(y)})`;
}

const thousandth = (value: number) => Math.round(value * 1000) / 1000;

function axesAt(at: Plane, z: number, projection: Projection) {
	const origin = iso([at[0], at[1], z], projection);
	const along = (point: Point3): Flat => {
		const [px, py] = iso(point, projection);
		return [px - origin[0], py - origin[1]];
	};
	return {
		origin,
		x: along([at[0] + 1, at[1], z]),
		y: along([at[0], at[1] + 1, z]),
		z: along([at[0], at[1], z + 1]),
	};
}

const matrixOf = (u: Flat, v: Flat, origin: Flat) =>
	`matrix(${thousandth(u[0])} ${thousandth(u[1])} ${thousandth(v[0])} ${thousandth(v[1])} ${thousandth(origin[0])} ${thousandth(origin[1])})`;

export function holdStill(element: Element, [dx, dy]: Flat) {
	const text = dx || dy ? `translate(${-dx} ${-dy})` : '';
	element
		.querySelectorAll('[data-hold]')
		.forEach((node) =>
			text ? node.setAttribute('transform', text) : node.removeAttribute('transform'),
		);
}

export function topMatrix(at: Plane, z: number, projection: Projection, along: 'x' | 'y' = 'x') {
	const { origin, x, y } = axesAt(at, z, projection);
	return along === 'x' ? matrixOf(x, y, origin) : matrixOf([-y[0], -y[1]], x, origin);
}

export function sideMatrix(at: Plane, z: number, projection: Projection, face: 'left' | 'right') {
	const { origin, x, y, z: up } = axesAt(at, z, projection);
	const down: Flat = [-up[0], -up[1]];
	return face === 'left' ? matrixOf(x, down, origin) : matrixOf([-y[0], -y[1]], down, origin);
}

export function screenRise(height: number, projection: Projection) {
	const { cosE, k } = cameraOf(projection);
	return height * cosE * k;
}

export interface FitOptions {
	pad?: number;
	headroom?: number;
	azimuth?: number;
	elevation?: number;
	/** A pinhole camera from `perspectiveProjection`; replaces `azimuth` and `elevation`. */
	camera?: { azimuth: number; elevation: number; distance: number; target: Point3 };
	light?: Point3;
}

export function fitProjection(
	points: Point3[],
	width: number,
	height: number,
	{ pad = 24, headroom = 0, azimuth = AZIMUTH, elevation = ELEVATION, camera, light }: FitOptions = {},
): Projection {
	const view = { ...(camera ?? { azimuth, elevation }), ...(light ? { light } : {}) };
	const unit: Projection = { origin: [0, 0], scale: 1, ...view };
	const flat = points.map((point) => iso(point, unit));
	const xs = flat.map(([x]) => x);
	const ys = flat.map(([, y]) => y);
	const left = Math.min(...xs);
	const right = Math.max(...xs);
	const up = Math.min(...ys);
	const down = Math.max(...ys);
	const scale = Math.min(
		(width - pad * 2) / (right - left),
		(height - pad * 2 - headroom) / (down - up),
	);
	return {
		origin: [
			width / 2 - ((left + right) / 2) * scale,
			headroom + (height - headroom) / 2 - ((up + down) / 2) * scale,
		],
		scale,
		...view,
	};
}

const escape = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const attrs = (pairs: Record<string, string | number | undefined | false>) =>
	Object.entries(pairs)
		.filter(([, value]) => value !== undefined && value !== false)
		.map(([key, value]) => ` ${key}="${escape(String(value))}"`)
		.join('');

export interface SolidStyle {
	tone?: Tone;
	crease?: Tone | 'none';
	halo?: boolean;
	lit?: boolean;
	flat?: boolean;
	className?: string;
	inner?: string;
}

export function solidSvg(
	paths: SolidPaths,
	{
		tone = 'hi',
		crease = 'faint',
		halo = false,
		lit = false,
		flat = false,
		className,
		inner = '',
	}: SolidStyle = {},
) {
	const parts: string[] = [];
	if (halo) parts.push(`<path class="iso-halo" d="${paths.fill}"/>`);
	parts.push(`<path class="iso-fill" d="${paths.fill}"/>`);
	if (!flat) {
		paths.shades.forEach((d, shade) => {
			if (d) parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
		});
		parts.push(`<path class="iso-top" d="${paths.top}"/>`);
	}
	if (crease !== 'none' && paths.crease)
		parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
	if (crease !== 'none' && paths.bevel)
		parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
	if (inner) parts.push(inner);
	parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
	return `<g${attrs({ class: className ? `iso-solid ${className}` : 'iso-solid', 'data-lit': lit ? '' : undefined, 'data-seamless': paths.seamless ? '' : undefined })}>${parts.join('')}</g>`;
}

export interface LineStyle {
	tone?: LineTone;
	dotted?: boolean;
	dashed?: boolean;
	flow?: boolean;
	className?: string;
	free?: boolean | 'start' | 'end';
}

export function lineSvg(
	d: string,
	{ tone = 'lo', dotted = false, dashed = false, flow = false, className, free }: LineStyle = {},
) {
	if (!d) return '';
	return `<path${attrs({
		class: className ? `iso-line ${className}` : 'iso-line',
		'data-tone': tone,
		'data-free': free === true ? '' : free || undefined,
		'data-dotted': dotted ? '' : undefined,
		'data-dashed': dashed ? '' : undefined,
		'data-flow': flow ? '' : undefined,
		d,
	})}/>`;
}

export function dotsSvg(
	points: Array<Flat | [number, number, number]>,
	{
		size = 0.5,
		tone = 'mid',
		pulse = false,
	}: { size?: number; tone?: Tone; pulse?: boolean } = {},
) {
	const dots = points
		.map(
			([x, y, alpha]: number[], index) =>
				`<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${Math.max(0, alpha).toFixed(2)}"` : ''}${pulse ? ` data-pulse="" style="--pulse-at:${(index * 137) % 1600}ms"` : ''}/>`,
		)
		.join('');
	return `<g class="iso-dots" data-tone="${tone}">${dots}</g>`;
}

export type Faded = { d: string; alpha: number } | [string, number];

export function fadedSvg(list: Faded[], style: LineStyle = {}) {
	const groups = new Map<number, string>();
	for (const entry of list) {
		const [d, alpha] = Array.isArray(entry) ? entry : [entry.d, entry.alpha];
		if (!d || !(alpha > 0.02)) continue;
		const level = Math.min(1, Math.round(alpha * 20) / 20);
		groups.set(level, (groups.get(level) ?? '') + d);
	}
	return [...groups]
		.map(([alpha, d]) =>
			alpha >= 1
				? lineSvg(d, style)
				: `<g opacity="${alpha.toFixed(2)}">${lineSvg(d, style)}</g>`,
		)
		.join('');
}

export interface FadeLineStyle {
	fade?: number | [number, number];
	tone?: LineTone;
	className?: string;
	stops?: number;
}

export function fadeLineSvg(
	points: Flat[],
	{ fade = [0, 0], tone = 'lo', className, stops = 6 }: FadeLineStyle = {},
) {
	if (points.length < 2) return '';
	const ease = (t: number) => t * t * (3 - 2 * t);
	const hashOf = (text: string) => {
		let hash = 2166136261;
		for (let index = 0; index < text.length; index++)
			hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
		return (hash >>> 0).toString(36);
	};
	const lengths = [0];
	for (let index = 1; index < points.length; index++)
		lengths.push(
			lengths[index - 1] +
				Math.hypot(
					points[index][0] - points[index - 1][0],
					points[index][1] - points[index - 1][1],
				),
		);
	const at = (length: number): Flat => {
		let index = 1;
		while (index < points.length - 1 && lengths[index] < length) index++;
		const span = lengths[index] - lengths[index - 1] || 1;
		const t = Math.max(0, Math.min(1, (length - lengths[index - 1]) / span));
		return [
			points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t,
			points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t,
		];
	};
	const pieceOf = (from: number, to: number): Flat[] => [
		at(from),
		...points.filter((_, index) => lengths[index] > from + 1e-6 && lengths[index] < to - 1e-6),
		at(to),
	];
	const total = lengths[lengths.length - 1];
	if (total < 1e-6) return '';
	let [start, end] = Array.isArray(fade) ? fade : [fade, fade];
	if (start + end > total) {
		const share = total / (start + end);
		start *= share;
		end *= share;
	}
	const paint = `var(--anatomy-${tone})`;
	const ramp = (piece: Flat[], rising: boolean) => {
		const d = pathOf(piece);
		const [x1, y1] = piece[0];
		const [x2, y2] = piece[piece.length - 1];
		const id = `iso-fade-${hashOf(`${d}|${tone}|${rising}`)}`;
		const marks = Array.from({ length: stops + 1 }, (_, index) => {
			const t = index / stops;
			const alpha = ease(rising ? t : 1 - t);
			return `<stop offset="${t.toFixed(3)}" stop-opacity="${alpha.toFixed(3)}" style="stop-color:${paint}"/>`;
		}).join('');
		const gradient = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tenth(x1)}" y1="${tenth(y1)}" x2="${tenth(x2)}" y2="${tenth(y2)}">${marks}</linearGradient>`;
		return `<defs>${gradient}</defs><path${attrs({ class: className ? `iso-line ${className}` : 'iso-line', 'data-tone': tone, 'data-free': rising ? 'start' : 'end', d, style: `stroke:url(#${id})` })}/>`;
	};
	const parts: string[] = [];
	if (start > 0.05) parts.push(ramp(pieceOf(0, start), true));
	if (total - end - start > 0.05)
		parts.push(lineSvg(pathOf(pieceOf(start, total - end)), { tone, className }));
	if (end > 0.05) parts.push(ramp(pieceOf(total - end, total), false));
	return `<g class="iso-fade">${parts.join('')}</g>`;
}

export interface WireStyle {
	via?: Flat[];
	tone?: LineTone;
	dotted?: boolean;
	dashed?: boolean;
	flow?: boolean;
	ends?: 'both' | 'from' | 'to' | 'none';
	size?: number;
}

export function wireSvg(
	from: Flat,
	to: Flat,
	{
		via = [],
		tone = 'lo',
		dotted = false,
		dashed = false,
		flow = false,
		ends = 'both',
		size = 1.2,
	}: WireStyle = {},
) {
	const d = pathOf([from, ...via, to]);
	const end = ([x, y]: Flat) =>
		`<circle class="iso-wire-end" cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"/>`;
	return `<g class="iso-wire" data-tone="${tone}">${lineSvg(d, { tone, dotted, dashed, flow })}${ends === 'both' || ends === 'from' ? end(from) : ''}${ends === 'both' || ends === 'to' ? end(to) : ''}</g>`;
}

export function faceTextSvg(
	transform: string,
	text: string,
	{
		size = 3,
		tone = 'mid',
		anchor = 'start',
	}: { size?: number; tone?: Tone; anchor?: 'start' | 'middle' | 'end' } = {},
) {
	return `<text class="iso-face-text" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="${anchor}">${escape(text)}</text>`;
}

export function groupSvg(
	children: string | string[],
	extra: Record<string, string | number | undefined | false> = {},
) {
	return `<g${attrs(extra)}>${Array.isArray(children) ? children.join('') : children}</g>`;
}

export interface FigureOptions {
	width: number;
	height: number;
	label: string;
	body: string | string[];
	className?: string;
}

export function figureSvg({ width, height, label, body, className }: FigureOptions) {
	return `<svg${attrs({
		xmlns: 'http://www.w3.org/2000/svg',
		class: `iso-svg${className ? ` ${className}` : ''}`,
		viewBox: `0 0 ${width} ${height}`,
		role: 'img',
		'aria-label': label,
	})}>${Array.isArray(body) ? body.join('') : body}</svg>`;
}
