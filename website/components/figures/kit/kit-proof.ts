import * as A from './audit.ts';
import * as G from './lathe.ts';
import {
	boxCorners,
	coil,
	cylinder,
	fitProjection,
	insetPlan,
	planOutline,
	slabOf,
	topTicks,
	type Plan,
	type Point3,
} from './iso-kit.ts';

export const WIDTH = 640;
export const HEIGHT = 340;

export const BASE: Plan = { x: 0, y: 0, w: 140, d: 64, r: 5 };
export const BASE_TOP = 10;
const POST_R = 8;
const POST_TOP = 44;
const AXIS_Y = 30;
const AXIS_Z = 32;
const ROD_R = 2.4;
const FAR_X = 28;
const NEAR_X = 112;
export const ROD_FROM = FAR_X + POST_R;
export const ROD_TO = NEAR_X - POST_R;

export const P = fitProjection(
	[...boxCorners(BASE, 0, BASE_TOP), [FAR_X, AXIS_Y, POST_TOP], [NEAR_X, AXIS_Y, POST_TOP]],
	WIDTH,
	HEIGHT,
	{ pad: 30 },
);

const ROD_FRAME = G.frameOf([0, AXIS_Y, AXIS_Z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

export const proofArt = {
	width: WIDTH,
	height: HEIGHT,
	readout: `span ${ROD_TO - ROD_FROM}`,
	base: slabOf(BASE, 0, BASE_TOP, P, 8, 0.8),
	inlay: planOutline(insetPlan(BASE, 4), BASE_TOP, P),
	ruler: topTicks(
		BASE.x + 10,
		BASE.x + BASE.w - 10,
		5,
		4,
		BASE.d - 12,
		BASE_TOP,
		[2.5, 5],
		P,
		'x',
	),
	farPost: cylinder(FAR_X, AXIS_Y, POST_R, BASE_TOP, POST_TOP - BASE_TOP, P, 32, 0.6),
	nearPost: cylinder(NEAR_X, AXIS_Y, POST_R, BASE_TOP, POST_TOP - BASE_TOP, P, 32, 0.6),
	rod: G.disc(ROD_FROM, ROD_TO, ROD_R, ROD_FRAME, P),
	coil: coil(ROD_FROM + 3, ROD_TO - 3, [AXIS_Y, AXIS_Z], ROD_R + 2.2, 9, 'x', P),
};

export type ProofPart = 'base' | 'farPost' | 'rod' | 'nearPost';

export const PAINT_ORDER: readonly ProofPart[] = ['base', 'farPost', 'rod', 'nearPost'];

const centre = (x: number, y: number, z: number): Point3 => [x, y, z];

export function recordProof(projection = P) {
	const R = A.recorder(projection);
	const post = (x: number, name: string) =>
		A.cylinder(x, AXIS_Y, POST_R, BASE_TOP, POST_TOP - BASE_TOP, { name });
	R.put({
		name: 'base',
		at: centre(BASE.w / 2, BASE.d / 2, 0),
		shapes: [R.solid(A.slab(BASE, 0, BASE_TOP, { name: 'stand.base', ground: true }))],
	});
	R.put({
		name: 'farPost',
		at: centre(FAR_X, AXIS_Y, BASE_TOP),
		shapes: [R.solid(post(FAR_X, 'post.far'))],
	});
	R.put({
		name: 'rod',
		at: centre((ROD_FROM + ROD_TO) / 2, AXIS_Y, AXIS_Z),
		shapes: [R.solid(A.disc(ROD_FRAME, ROD_FROM, ROD_TO, ROD_R, { name: 'rod' }))],
	});
	R.put({
		name: 'nearPost',
		at: centre(NEAR_X, AXIS_Y, BASE_TOP),
		shapes: [R.solid(post(NEAR_X, 'post.near'))],
	});
	return R;
}
