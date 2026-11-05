// A marionette's control bar works two wooden hands on strings: each presses the real Count button on a page, one drawn on the spot by render(), one that arrived by post in an envelope from renderSSR(); both pages then read Count 1.
import { centreOf, ellipse, matrixOf, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, wash } from '../ink/ink.ts';
import { desk, type P, type Point3 } from '../ink/sheets.ts';

/** The two ways in, as the test calls them. */
export const WAYS = [
	{ key: 'drawn', call: 'render(Counter)' },
	{ key: 'posted', call: 'renderSSR(Counter)' },
];

/** The one check both tests share. */
export const CHECK = 'clickCounts()';

const PAGE = { w: 9.4, h: 6.2 };
const BUTTON = { u0: 2.2, v0: 2.6, u1: 7.4, v1: 4.4 };
const BAR_Z = 6.5;
const PRESS = 1400;
const HAND = 1.9;

export function drawing() {
	const k = desk(
		680,
		[
			{ key: 'envelope', x: 11.9, y: 5.6, w: 9.6, h: 5.2, turn: 0.07, kraft: true, curl: false },
			{ key: 'drawn', x: 0, y: 3, w: PAGE.w, h: PAGE.h, bar: 'browser', turn: -0.02 },
			{ key: 'posted', x: 11.4, y: 2.6, w: PAGE.w, h: PAGE.h, bar: 'browser', turn: 0.03 },
		],
		[
			[2, -2.4, BAR_Z + 2.4],
			[19, -2.4, BAR_Z + 2.4],
		],
	);
	k.lay();
	const P = k.raw.proj;

	const flap = k.raw.on('envelope', [[0, 5.2], [4.8, 2.4], [9.6, 5.2]], 0.02);
	k.raw.path(line(flap, { w: 1, seed: 2400 }), 'sheet-ink');
	k.raw.path(hatch(hull([...flap, ...k.raw.on('envelope', [[0, 5.2], [9.6, 5.2]])]), 1.1, 2.2, 2401, { cluster: 3, skip: 0.3 }), 'sheet-hatch light');
	const stamp = k.raw.on('envelope', roundRect(7.9, 3.7, 9.2, 4.9, 0.05, 1), 0.02);
	k.raw.path(pathOf(stamp, true), 'pink-wash');
	k.raw.path(outline(stamp, { w: 0.7, seed: 2402 }), 'sheet-ink');
	k.next();

	const fingers: Point3[] = [];
	for (const [i, way] of WAYS.entries()) {
		k.button(way.key, BUTTON.u0, BUTTON.v0, BUTTON.u1, BUTTON.v1, 'Count');
		k.row(way.key, 5.15, BUTTON.v1 - 0.42, '0', 'big', 'gone', PRESS + 300 + i * 200);
		k.swipe(way.key, 5.0, 5.8, BUTTON.v1 - 0.45, 'show', PRESS + 380 + i * 200);
		k.row(way.key, 5.15, BUTTON.v1 - 0.42, '1', 'big', 'show', PRESS + 400 + i * 200);
		k.row(way.key, 1, PAGE.h - 0.6, way.call, 'mono');
		k.tick(way.key, 8.4, PAGE.h - 0.6, 'draw', PRESS + 900 + i * 200);
		fingers.push(k.raw.at(way.key, BUTTON.u1 - 0.7, (BUTTON.v0 + BUTTON.v1) / 2, 0.3));
	}
	k.next();

	const bar = { a: [2.6, -1.2, BAR_Z] as Point3, b: [19, -1.2, BAR_Z] as Point3 };
	const cross = { a: [9.6, -1.7, BAR_Z + 0.1] as Point3, b: [12, -1.7, BAR_Z + 0.1] as Point3 };
	const stick = (a: Point3, b: Point3, r: number, seed: number) => {
		const top = [a, b].map((p) => P([p[0], p[1], p[2] + r]));
		const low = [a, b].map((p) => P([p[0], p[1] + r * 0.6, p[2] - r]));
		const body = [top[0]!, top[1]!, low[1]!, low[0]!];
		k.raw.path(wash(hull([a, b].flatMap((p) => [P(shadowOnDesk(p)), P(shadowOnDesk([p[0], p[1] + 0.4, p[2]]))])), seed, 0.6, 1.6), 'shadow-wash light');
		k.raw.path(pathOf(body, true), 'kraft');
		k.raw.path(hatch(body, 0.05, 1.6, seed + 1, { cluster: 4, skip: 0.3, trim: 0.3 }), 'sheet-hatch light');
		k.raw.path(outline(body, { w: 1.4, heavy: 1.4, centre: centreOf(body), seed: seed + 2 }), 'desk-ink');
	};
	const strings: string[] = [];
	const hands: { d: string; ink: string }[] = [];
	fingers.forEach((tip, i) => {
		const t = P(tip);
		const hand: P[] = [
			[t[0], t[1]],
			[t[0] + 3 * HAND, t[1] - 1 * HAND],
			[t[0] + 4 * HAND, t[1] - 12 * HAND],
			[t[0] + 9 * HAND, t[1] - 10 * HAND],
			[t[0] + 15 * HAND, t[1] - 12 * HAND],
			[t[0] + 20 * HAND, t[1] - 16 * HAND],
			[t[0] + 21 * HAND, t[1] - 28 * HAND],
			[t[0] + 16 * HAND, t[1] - 36 * HAND],
			[t[0] + 6 * HAND, t[1] - 36 * HAND],
			[t[0] - 3 * HAND, t[1] - 22 * HAND],
			[t[0] - 1 * HAND, t[1] - 18 * HAND],
			[t[0] + 2 * HAND, t[1] - 20 * HAND],
			[t[0] - 1 * HAND, t[1] - 2 * HAND],
		];
		const wrist: P = [t[0] + 10 * HAND, t[1] - 36 * HAND];
		const fromBar = i === 0 ? bar.a : bar.b;
		const mid: Point3 = [fromBar[0] + (i === 0 ? 1.2 : -1.2), fromBar[1], fromBar[2]];
		strings.push(pathOf([P(mid), wrist]), pathOf([P([i === 0 ? 9.8 : 11.8, -1.5, BAR_Z]), [t[0] + 18 * HAND, t[1] - 32 * HAND]]));
		hands.push({ d: pathOf(hand, true), ink: outline(hand, { w: 1.2, heavy: 1, centre: centreOf(hand), seed: 2500 + i * 10 }) + line([[t[0] + 6 * HAND, t[1] - 30 * HAND], [t[0] + 14 * HAND, t[1] - 30 * HAND]], { w: 0.6, seed: 2501 + i * 10, over: 0 }) });
		const dowel = ellipse(wrist[0], wrist[1] - 1, 1.8, 1.8, 10);
		hands.at(-1)!.ink += outline(dowel, { w: 0.8, seed: 2502 + i * 10 });
	});
	for (const s of strings) k.raw.path(s, 'roller');
	hands.forEach((h, i) => {
		const st = k.raw.motion('sink', PRESS - 120 + i * 200);
		k.raw.path(h.d, 'kraft sink', st);
		k.raw.path(h.ink, 'desk-ink sink', st);
	});
	stick(bar.a, bar.b, 0.32, 2600);
	stick(cross.a, cross.b, 0.42, 2610);
	const o: Point3 = [13.2, -2.1, BAR_Z + 0.5];
	k.raw.textWith(matrixOf(P(o), P([o[0] + 0.05, o[1], o[2]]), P([o[0], o[1] + 0.05, o[2]])), CHECK, 'mono desk-text');
	return k.build();
}
