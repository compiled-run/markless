// Brief (checklist passed). Belief: the request's method and path pick the one file in api/ that answers.
// Objects: the machine (each selection button is a file), the coin (the request), the tray (the answer).
// Action: type an id, drop the coin in GET or POST. Change: that file's button lights, its coil turns, its card drops. Unchanged: the other file.
// Prevents: "any request to the path runs the code". Surprise: a POST to /api/users/42 lights nothing; the coin rattles back with 404.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, r1, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 450;

const BODY = { x0: 120, y0: 16, x1: 470, y1: 404 };
const DEPTH = { dx: 30, dy: -14 };
const WINDOW = { x0: 140, y0: 36, x1: 360, y1: 282 };
const SHELVES = [{ y: 64, lip: 126 }, { y: 170, lip: 230 }];
const CARD = { w: 86, h: 46 };
const COIL = { x: 250, r: 13 };
const PANEL = { x0: 372, x1: 458 };
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', ''] as const;
const KEY = { x0: 380, y0: 80, w: 20, h: 16, gap: 5 };
export const SLOTS = { GET: { x: 415, y: 193 }, POST: { x: 415, y: 229 } } as const;
const TRAY = { x0: 150, y0: 304, x1: 350, y1: 366 };
const CUP = { x0: 384, y0: 318, x1: 446, y1: 356 };
const COIN = { x: 560, y: 300, r: 17 };

const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** The cabinet: front face, its side and top in depth, glass window with glare, and the shadow it casts on the desk. */
function cabinetArt() {
	const front = roundRect(BODY.x0, BODY.y0, BODY.x1, BODY.y1, 8);
	const side: P[] = [[BODY.x1, BODY.y0 + 6], [BODY.x1 + DEPTH.dx, BODY.y0 + 6 + DEPTH.dy], [BODY.x1 + DEPTH.dx, BODY.y1 + DEPTH.dy], [BODY.x1, BODY.y1]];
	const top: P[] = [[BODY.x0 + 6, BODY.y0], [BODY.x0 + 6 + DEPTH.dx, BODY.y0 + DEPTH.dy], [BODY.x1 + DEPTH.dx, BODY.y0 + DEPTH.dy], [BODY.x1, BODY.y0]];
	const cast: P[] = [[BODY.x0 + 20, BODY.y1], [BODY.x1 + DEPTH.dx, BODY.y1 + DEPTH.dy], [BODY.x1 + DEPTH.dx + 70, BODY.y1 + 8], [BODY.x0 + 90, BODY.y1 + 22]];
	const glass = rect(WINDOW.x0, WINDOW.y0, WINDOW.x1, WINDOW.y1);
	const glare = [0, 1].map((k) => stroke([[WINDOW.x0 + 14 + k * 12, WINDOW.y0 + 70], [WINDOW.x0 + 44 + k * 12, WINDOW.y0 + 10]], { w: 1.2, seed: 4010 + k, over: 0 })).join('');
	const feet = [BODY.x0 + 14, BODY.x1 - 34].map((x, k) => outline(rect(x, BODY.y1 - 2, x + 20, BODY.y1 + 8), { w: 1, seed: 4020 + k })).join('');
	return {
		cast: wash(cast, 4001, 1.5, 3),
		castHatch: hatch(cast, -0.5, 2.6, 4002, { cluster: 5, skip: 0.25, trim: 0.5 }),
		front: pathOf(front, true),
		side: pathOf(side, true),
		top: pathOf(top, true),
		shade: hatch(side, 1.25, 1.9, 4003, { cluster: 4, skip: 0.2, trim: 0.4 }) + hatch(top, 0.05, 3, 4004, { cluster: 3, skip: 0.4, trim: 0.5 }),
		glass: pathOf(glass, true),
		glassHatch: hatch(glass, 1.1, 9, 4005, { cluster: 2, skip: 0.6, trim: 0.7 }),
		glare,
		ink: outline(front, { w: 2.2, heavy: 1.6, seed: 4006 }) + outline(side, { w: 1.6, heavy: 1.2, seed: 4007 }) + outline(top, { w: 1.2, seed: 4008 }) + outline(glass, { w: 1.4, heavy: 0.9, seed: 4009 }) + feet,
	};
}

/** One shelf: the card standing on its coil, the coil's front loop, and the lip below with the selection button. */
function shelfArt(k: number) {
	const { y, lip } = SHELVES[k]!;
	const cx = COIL.x;
	const card = roundRect(cx - CARD.w / 2, y, cx + CARD.w / 2, y + CARD.h, 4);
	const coilY = y + CARD.h + 8;
	const pitch = 18;
	const helix = Array.from({ length: 90 }, (_, i): P => {
		const t = (i / 89) * 4 * Math.PI * 2;
		return [WINDOW.x0 + 12 + (t / (Math.PI * 2)) * pitch * 2.1, coilY + Math.sin(t) * 6];
	});
	const shelf = rect(WINDOW.x0 + 2, coilY + 6, WINDOW.x1 - 2, coilY + 10);
	const plate = roundRect(WINDOW.x0 + 6, lip, WINDOW.x1 - 6, lip + 40, 4);
	const light = ellipse(WINDOW.x1 - 26, lip + 20, 9, 9, 22);
	return {
		card: pathOf(card, true),
		cardInk: outline(card, { w: 1.1, heavy: 0.7, seed: 4100 + k * 20 }) + [0, 1, 2].map((r) => line([[cx - 30, y + 14 + r * 10], [cx + 22 - r * 8, y + 14 + r * 10]], { w: 0.6, seed: 4101 + k * 20 + r, over: 0 })).join(''),
		coil: line(helix, { w: 1.4, seed: 4105 + k * 20, over: 0 }),
		pitch: `--pitch:${r1(pitch * 2.1)}px`,
		shelf: pathOf(shelf, true),
		shelfInk: outline(shelf, { w: 0.9, seed: 4107 + k * 20 }),
		plate: pathOf(plate, true),
		plateInk: outline(plate, { w: 1.2, heavy: 0.8, seed: 4108 + k * 20 }),
		light: pathOf(light, true),
		lightInk: outline(light, { w: 1.1, heavy: 0.8, seed: 4109 + k * 20 }),
		lightWash: wash(plate, 4110 + k * 20, 1.2, 3),
		route: { x: WINDOW.x0 + 16, y: lip + 18 },
		file: { x: WINDOW.x0 + 16, y: lip + 33 },
		drop: `--drop-y:${r1(TRAY.y0 + 10 - y)}px`,
	};
}

/** The control panel: the path display, the keypad and the two coin slots marked GET and POST. */
function panelArt() {
	const display = roundRect(PANEL.x0 - 2, 40, PANEL.x1 + 2, 66, 3);
	const keys = KEYS.map((label, i) => {
		const col = i % 3;
		const row = Math.floor(i / 3);
		const x = KEY.x0 + col * (KEY.w + KEY.gap);
		const y = KEY.y0 + row * (KEY.h + KEY.gap);
		const face = roundRect(x, y, x + KEY.w, y + KEY.h, 3);
		return { label, paper: pathOf(face, true), ink: outline(face, { w: 0.8, heavy: 0.6, seed: 4200 + i }), x: r1(x + KEY.w / 2), y: r1(y + KEY.h - 4) };
	});
	const keypad = roundRect(KEY.x0 - 5, KEY.y0 - 5, KEY.x0 + 3 * KEY.w + 2 * KEY.gap + 5, KEY.y0 + 4 * KEY.h + 3 * KEY.gap + 5, 4);
	const slot = (s: { x: number; y: number }, seed: number) => {
		const plate = roundRect(s.x - 34, s.y - 13, s.x + 34, s.y + 13, 4);
		const slit = roundRect(s.x + 8, s.y - 9, s.x + 13, s.y + 9, 2);
		return { plate: pathOf(plate, true), slit: pathOf(slit, true), ink: outline(plate, { w: 1, heavy: 0.7, seed }) + outline(slit, { w: 0.8, seed: seed + 1 }), label: { x: s.x - 28, y: s.y + 4 } };
	};
	return {
		display: pathOf(display, true),
		displayInk: outline(display, { w: 1, heavy: 0.7, seed: 4190 }),
		displayText: { x: PANEL.x0 + 2, y: 57 },
		keypad: pathOf(keypad, true),
		keypadInk: outline(keypad, { w: 0.9, seed: 4191 }),
		keys,
		get: slot(SLOTS.GET, 4250),
		post: slot(SLOTS.POST, 4260),
	};
}

/** The tray behind its flap, the card that lands in it, and the return cup with the coin that rattles back. */
function trayArt() {
	const tray = rect(TRAY.x0, TRAY.y0, TRAY.x1, TRAY.y1);
	const flap = rect(TRAY.x0 + 4, TRAY.y0 + 4, TRAY.x1 - 4, TRAY.y0 + 22);
	const card = roundRect(TRAY.x0 + 40, TRAY.y0 + 18, TRAY.x1 - 40, TRAY.y1 - 6, 4);
	const cup = roundRect(CUP.x0, CUP.y0, CUP.x1, CUP.y1, 6);
	const coin = ellipse((CUP.x0 + CUP.x1) / 2 + 4, CUP.y1 - 12, 11, 6, 22);
	const tag = roundRect(CUP.x0 + 4, CUP.y1 + 10, CUP.x0 + 50, CUP.y1 + 30, 3);
	return {
		tray: pathOf(tray, true),
		trayHatch: hatch(tray, 0.15, 1.3, 4300, { cluster: 4, trim: 0.2 }) + hatch(tray, -0.9, 1.7, 4301, { cluster: 2, skip: 0.3 }),
		trayInk: outline(tray, { w: 1.3, heavy: 1, seed: 4302 }),
		flap: pathOf(flap, true),
		flapInk: outline(flap, { w: 1, seed: 4303 }),
		card: pathOf(card, true),
		cardInk: outline(card, { w: 1.1, heavy: 0.7, seed: 4304 }),
		cardWash: wash(card, 4305, 1.2, 3),
		cardText: { x: (TRAY.x0 + TRAY.x1) / 2, y: TRAY.y1 - 18 },
		cup: pathOf(cup, true),
		cupHatch: hatch(cup, 0.2, 1.2, 4306, { cluster: 3, trim: 0.2 }),
		cupInk: outline(cup, { w: 1.2, heavy: 0.9, seed: 4307 }),
		coin: pathOf(coin, true),
		coinInk: outline(coin, { w: 1, heavy: 0.7, seed: 4308 }),
		tag: pathOf(tag, true),
		tagInk: outline(tag, { w: 0.9, seed: 4309 }),
		tagText: { x: CUP.x0 + 27, y: CUP.y1 + 25 },
	};
}

/** The coin on the desk: milled edge, hatched face, its shadow, and where each slot sits relative to it. */
function coinArt() {
	const rim = ellipse(COIN.x, COIN.y, COIN.r, COIN.r, 36);
	const face = ellipse(COIN.x, COIN.y, COIN.r - 4, COIN.r - 4, 30);
	const mill = Array.from({ length: 24 }, (_, i) => {
		const a = (i / 24) * Math.PI * 2;
		return stroke([[COIN.x + Math.cos(a) * (COIN.r - 2), COIN.y + Math.sin(a) * (COIN.r - 2)], [COIN.x + Math.cos(a) * COIN.r, COIN.y + Math.sin(a) * COIN.r]], { w: 0.5, seed: 4400 + i, over: 0 });
	}).join('');
	const shadow = ellipse(COIN.x + 7, COIN.y + 8, COIN.r, COIN.r * 0.7, 30);
	const to = (s: { x: number; y: number }) => `${r1(s.x + 10 - COIN.x)}px, ${r1(s.y - COIN.y)}px`;
	return {
		shadow: hatch(shadow, -0.6, 1.8, 4420, { cluster: 3, trim: 0.3 }),
		paper: pathOf(rim, true),
		wash: wash(face, 4421, 0.8, 2),
		shade: hatch(face, 0.8, 2.4, 4422, { cluster: 3, skip: 0.3, trim: 0.4 }),
		ink: outline(rim, { w: 1.3, heavy: 1, seed: 4423 }) + outline(face, { w: 0.7, seed: 4424 }) + mill,
		at: [COIN.x, COIN.y] as P,
		toGet: `--to: translate(${to(SLOTS.GET)})`,
		toPost: `--to: translate(${to(SLOTS.POST)})`,
	};
}

/** The whole figure, frozen into vending.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		cabinet: cabinetArt(),
		shelves: [shelfArt(0), shelfArt(1)],
		panel: panelArt(),
		tray: trayArt(),
		coin: coinArt(),
		slots: SLOTS,
		caption: { x: BODY.x0, y: 440 },
	};
}
