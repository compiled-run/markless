// Two objects: a coat-check ticket named field on the desk, and a coat rack with the <input> coat on its hook.
import { createScene, ellipse, type P, roundRect, sheetAt } from '../ink/scene.ts';
import { centreOf, jitter, matrixOf } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, r1, resample, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 360;

/** The ticket lying on the desk, in desk centimetres. */
const TICKET = { u: 1.0, v: 2.2, w: 9.6, h: 11.6, turn: 0.05 };
/** The coat rack plank on the right, in screen pixels. */
const PLANK = { x: 486, y: 36, w: 64, h: 300 };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [],
	target: [15.2, -2.2, 0.4],
});
const { proj, onSheet } = scene;

function ticketAt(x: number, y: number): P {
	const c = Math.cos(TICKET.turn);
	const s = Math.sin(TICKET.turn);
	return [TICKET.u + x * c - y * s, TICKET.v + x * s + y * c];
}
const onTicket = (pts: P[], lift = 0.05): P[] => onSheet(pts.map(([x, y]) => ticketAt(x, y)), lift);
const ticketMatrix = (x: number, y: number) => {
	const at = (a: number, b: number) => {
		const [u, v] = ticketAt(a, b);
		return proj(sheetAt(u, v, 0.05));
	};
	return matrixOf(at(x, y), at(x + 0.1, y), at(x, y + 0.1));
};

/** The ticket: a stiff card stub with a punched hole, a perforated tear line, its number and its shadow. */
function ticketArt() {
	const { w, h } = TICKET;
	const edge = roundRect(0, 0, w, h, 0.4);
	const body = onTicket(edge);
	const cast = hull([...onTicket(edge, 0), ...onTicket(edge.map(([x, y]) => [x + 0.35, y + 0.4] as P), 0)]);
	const hole = onTicket(ellipse(w / 2, 1.1, 0.4, 0.4, 18));
	const perf = Array.from({ length: 15 }, (_, i) => {
		const x = 0.4 + (i / 14) * (w - 0.8);
		return stroke(onTicket([[x, 2.3], [x + 0.25, 2.3]]), { w: 0.8, seed: 4210 + i, over: 0 });
	}).join('');
	const shade = onTicket([[w - 1.3, 0.25], [w - 0.25, 0.25], [w - 0.25, h - 0.25], [w - 1.3, h - 0.25]]);
	return {
		cast: wash(cast, 4200, 1, 2),
		castHatch: hatch(cast, -0.6, 1.7, 4201, { cluster: 3, skip: 0.3, trim: 0.4 }),
		paper: pathOf(body, true),
		shade: hatch(shade, 1.2, 1.4, 4202, { cluster: 3, skip: 0.3, trim: 0.4 }),
		ink: outline(body, { w: 1.5, heavy: 1.1, centre: centreOf(body), seed: 4203 }) + outline(hole, { w: 0.9, seed: 4204 }),
		hole: pathOf(hole, true),
		perf,
		numberMatrix: ticketMatrix(w / 2, 5.0),
		nameMatrix: ticketMatrix(w / 2, 7.2),
		valueMatrix: ticketMatrix(w / 2, 9.0),
		spot: (() => {
			const [u, v] = ticketAt(w / 2, 8.6);
			return scene.spot(u, v, w / 2 - 0.7, 0.8, 4220);
		})(),
	};
}

/** The coat rack: an upright plank with two screws and one brass hook, drawn flat to the viewer. In screen pixels. */
function standArt() {
	const { x, y, w, h } = PLANK;
	const plank: P[] = jitter(resample(roundRect(x, y, x + w, y + h, 4), 6), 4300, 0.5);
	const side: P[] = [[x + w - 12, y + 4], [x + w - 2, y + 4], [x + w - 2, y + h - 4], [x + w - 12, y + h - 4]];
	const cast: P[] = plank.map(([px, py]) => [px + 10, py + 8] as P);
	const grain = [0.3, 0.55, 0.78].map((f, i) => line(resample([[x + w * f, y + 10], [x + w * f + 3, y + h * 0.5], [x + w * f - 2, y + h - 10]], 8), { w: 0.5, seed: 4310 + i, over: 0 })).join('');
	const screws = [y + 22, y + h - 22].map((sy, i) => outline(ellipse(x + w / 2, sy, 3.2, 3.2, 12), { w: 0.8, seed: 4320 + i }) + stroke([[x + w / 2 - 2, sy - 1.5], [x + w / 2 + 2, sy + 1.5]], { w: 0.6, seed: 4322 + i, over: 0 })).join('');
	const hx = x + w / 2;
	const hy = y + 62;
	const hookPts: P[] = [[hx, hy - 8], [hx + 6, hy + 4], [hx + 16, hy + 18], [hx + 30, hy + 22], [hx + 38, hy + 12], [hx + 36, hy + 2]];
	const tip: P = [hx + 26, hy + 21];
	return {
		cast: wash(cast, 4301, 0.8, 1.6),
		castHatch: hatch(cast, -0.6, 1.8, 4302, { cluster: 3, skip: 0.3, trim: 0.3 }),
		plank: pathOf(plank, true),
		plankShade: hatch(side, 1.45, 1.4, 4303, { cluster: 3, trim: 0.2 }),
		plankInk: outline(plank, { w: 1.5, heavy: 1.1, centre: centreOf(plank), seed: 4304 }) + grain + screws,
		hook: line(resample(hookPts, 2), { w: 3.6, seed: 4305, over: 0 }),
		hookAt: tip,
		pivot: `transform-origin:${r1(hx)}px ${r1(hy)}px`,
	};
}

/** The coat on the hook: shoulders, sleeves and hem, hanging from the hook's tip. In screen pixels. */
function coatArt(at: P) {
	const [x, y] = at;
	const k = 1.35;
	const raw: P[] = [
		[x, y], [x + 18, y + 10], [x + 36, y + 22], [x + 40, y + 70], [x + 32, y + 72], [x + 30, y + 40],
		[x + 34, y + 128], [x - 34, y + 128], [x - 30, y + 40], [x - 32, y + 72], [x - 40, y + 70], [x - 36, y + 22], [x - 18, y + 10],
	];
	const scale = ([px, py]: P): P => [x + (px - x) * k, y + (py - y) * k];
	const shape = raw.map(scale);
	const sil = jitter(resample(shape, 4), 4400, 0.6);
	const placket = line(resample([[x, y + 14], [x + 2, y + 126]].map((p) => scale(p as P)), 6), { w: 0.9, seed: 4401, over: 0 });
	const collar = line(resample([[x - 14, y + 8], [x, y + 26], [x + 14, y + 8]].map((p) => scale(p as P)), 3), { w: 1.1, seed: 4402, over: 0 });
	const buttons = [44, 70, 96].map((dy, i) => outline(ellipse(...scale([x + 7, y + dy]), 2.6, 2.6, 10), { w: 0.8, seed: 4403 + i })).join('');
	const shadeSide = ([[x + 4, y + 14], [x + 36, y + 22], [x + 40, y + 70], [x + 32, y + 72], [x + 30, y + 40], [x + 34, y + 128], [x + 4, y + 128]] as P[]).map(scale);
	const cast = shape.map(([px, py]) => [px + 10, py + 8] as P);
	const hang: P = [x, y];
	return {
		cast: wash(cast, 4409, 0.8, 1.6),
		paper: pathOf(sil, true),
		wash: wash(sil, 4410, 0.8, 2),
		shade: hatch(shadeSide, 1.25, 1.6, 4411, { cluster: 4, skip: 0.2, trim: 0.3 }),
		ink: outline(sil, { w: 1.4, heavy: 1, centre: centreOf(sil), seed: 4412 }) + placket + collar + buttons,
		spot: wash(shape, 4420, 1.4, 4),
		labelAt: `translate(${r1(x)} ${r1(y + 128 * k + 22)})`,
		origin: `transform-origin:${r1(hang[0])}px ${r1(hang[1])}px`,
	};
}

/** The screen offset from the coat to the ticket, so CSS can carry the coat over when the ticket is handed in. */
function toTicket(coatAt: P) {
	const [u, v] = ticketAt(TICKET.w / 2, 3.4);
	const t = proj(sheetAt(u, v, 0.05));
	return `--to-x:${r1((t[0] - coatAt[0]) * 0.35)}px;--to-y:${r1((t[1] - coatAt[1]) * 0.15)}px`;
}

/** Faint construction lines: the ticket's edges run on, and the hook's height. */
function pencil() {
	const runs: P[][] = [
		onSheet([ticketAt(0, -1.4), ticketAt(0, TICKET.h + 1.4)]),
		onSheet([ticketAt(-1.2, 0), ticketAt(TICKET.w + 1.8, 0)]),
		[[PLANK.x - 14, PLANK.y + 62], [PLANK.x + PLANK.w + 70, PLANK.y + 62]],
	];
	return runs.map((run, i) => pathOf(jitter(resample(run, 9), 4500 + i, 0.8))).join('');
}

/** The whole scene, frozen into coat-check.art.ts. */
export function drawing() {
	const stand = standArt();
	return {
		width: WIDTH,
		height: HEIGHT,
		pencil: pencil(),
		ticket: ticketArt(),
		stand,
		coat: coatArt(stand.hookAt),
		travel: toTicket(stand.hookAt),
	};
}
