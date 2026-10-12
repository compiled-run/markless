import type { Flat, Plane, Point3, Projection } from './iso-kit.ts';
import { iso, pathOf } from './iso-kit.ts';
import { add3, bandOf, dot3, lightOf, mul3, unit3, viewOf } from './lathe.ts';
import { hatchOf, hatchStyle } from './sketch.ts';

const TAU = Math.PI * 2;

export interface Frame {
	o: Point3;
	a: Point3;
	u: Point3;
	v: Point3;
}

/** One face of a toothed wheel: its screen path and its light bucket (0–3 sides, 4 the lit cap). */
export interface GearFace {
	d: string;
	shade: number;
}

/** A spur-gear outline in the wheel's own plane, turned by `angle` radians. */
export function toothRing(teeth: number, radius: number, depth: number, angle = 0): Plane[] {
	const step = TAU / teeth;
	const tip = radius + depth / 2;
	const root = radius - depth / 2;
	const points: Plane[] = [];
	const at = (a: number, r: number): Plane => [r * Math.cos(a), r * Math.sin(a)];
	for (let index = 0; index < teeth; index++) {
		const a = angle + index * step;
		points.push(at(a, root), at(a + step * 0.2, root), at(a + step * 0.34, tip), at(a + step * 0.66, tip), at(a + step * 0.8, root));
	}
	return points;
}

const signedArea = (points: Plane[]) => {
	let sum = 0;
	for (let index = 0; index < points.length; index++) {
		const [ax, ay] = points[index]!;
		const [bx, by] = points[(index + 1) % points.length]!;
		sum += ax * by - bx * ay;
	}
	return sum;
};

/** The visible faces of a prism with any (even concave) outline along a frame's axis, far to near, ready to paint in turn. */
export function gearFaces(F: Frame, ring: Plane[], s0: number, s1: number, P: Projection): GearFace[] {
	const V = viewOf(P);
	const L = lightOf(P);
	const counter = signedArea(ring) > 0;
	const at = (s: number, [x, y]: Plane): Point3 => add3(add3(add3(F.o, mul3(F.a, s)), mul3(F.u, x)), mul3(F.v, y));
	const n = ring.length;
	const sides: { d: string; shade: number; depth: number }[] = [];
	for (let j = 0; j < n; j++) {
		const p = ring[j]!;
		const q = ring[(j + 1) % n]!;
		const outward: Plane = counter ? [q[1] - p[1], -(q[0] - p[0])] : [-(q[1] - p[1]), q[0] - p[0]];
		const normal = unit3(add3(mul3(F.u, outward[0]), mul3(F.v, outward[1])));
		if (dot3(normal, V) <= 1e-6) continue;
		const corners = [at(s0, p), at(s0, q), at(s1, q), at(s1, p)];
		const middle = mul3(corners.reduce((sum: Point3, point) => add3(sum, point), [0, 0, 0]), 0.25);
		sides.push({
			d: pathOf(corners.map((point): Flat => iso(point, P)), true),
			shade: bandOf(dot3(normal, L)),
			depth: dot3(middle, V),
		});
	}
	sides.sort((a, b) => a.depth - b.depth);
	const facing = dot3(F.a, V) > 0;
	const capS = facing ? s1 : s0;
	const capNormal = facing ? F.a : mul3(F.a, -1);
	const cap = { d: pathOf(ring.map((point) => iso(at(capS, point), P)), true), shade: bandOf(dot3(capNormal, L)) };
	return [...sides.map(({ d, shade }) => ({ d, shade })), cap];
}

const TINT = [13, 7, 3, 0];

/** Inline style for one face, so markup written at runtime matches the server render without the scoped classes. */
export const faceStyle = (face: GearFace, edge: string) => {
	const fill = face.shade >= 4 ? 'var(--wash-top)' : `color-mix(in oklch, var(--wash), var(--anatomy-shadow) ${TINT[face.shade]}%)`;
	return `fill:${fill};stroke:var(--anatomy-${edge});stroke-width:0.8;stroke-linejoin:round`;
};

/** Each face with its inline style; shaded sides carry their pencil hatching straight after them. */
export const paintedFaces = (faces: GearFace[], edge = 'mid') =>
	faces
		.flatMap((face, index, all) => {
			const painted = { d: face.d, style: faceStyle(face, edge) };
			const density = index === all.length - 1 ? Math.max(2, face.shade) : face.shade;
			return face.shade < 4 ? [painted, { d: hatchOf(face.d, density), style: hatchStyle(density) }] : [painted];
		})
		.map((face, index) => ({ index, ...face }));

/** Markup for a toothed wheel, painted face by face; `edge` names the `--anatomy-*` tone of its lines. */
export const gearSvg = (faces: GearFace[], edge = 'mid') =>
	paintedFaces(faces, edge).map((face) => `<path d="${face.d}" style="${face.style}"/>`).join('');
