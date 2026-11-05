// One seatmap.tsrx card and three hosts: a browser, a phone and a server terminal, each ready to draw the same plan.
import { flatKit, rect, roundRect } from '../how/flat-kit.ts';
import { SEATS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 390;

type Box = { x: number; y: number; w: number; h: number };
const seatBoxes = (area: Box, rounded: boolean) =>
	SEATS.map((seat, i) => {
		const col = i % 4;
		const row = Math.floor(i / 4);
		const w = (area.w - 3 * 8) / 4;
		const h = (area.h - 8) / 2;
		const x = area.x + col * (w + 8);
		const y = area.y + row * (h + 8);
		return { seat, x, y, w, h, poly: rounded ? roundRect(x, y, x + w, y + h, 7, 4) : rect(x, y, w, h) };
	});

export function drawing() {
	const k = flatKit('b');
	const file = k.group(() => {
		k.card(rect(18, 140, 128, 156), 9500, { shadow: 5 });
		k.put('hatch light', k.hatch(rect(19, 141, 126, 20), 0.1, 2.4, 9501, { cluster: 5 }));
		k.say('code file-name', 26, 155, 'seatmap.tsrx');
		['let seat =', "  state('A2');", '', '<p>', '  Your seat:', '  {seat}', '</p>'].forEach((line, i) => k.say('code file-code', 26, 182 + i * 15, line));
	});

	k.windowFrame(176, 26, 250, 190, 'seats.app', 9600);
	const browserSeats = seatBoxes({ x: 196, y: 92, w: 210, h: 90 }, false);

	k.card(roundRect(452, 20, 562, 240, 18, 6), 9700, { shadow: 5, w: 1.6 });
	k.put('ink', k.outline(roundRect(460, 40, 554, 222, 6, 4), { w: 0.8, seed: 9701 }) + k.outline(roundRect(492, 27, 522, 33, 3, 3), { w: 0.7, seed: 9702 }));
	k.say('pencil-text early', 470, 256, 'early proof');
	const phoneSeats = seatBoxes({ x: 466, y: 96, w: 82, h: 100 }, true);

	k.card(roundRect(176, 248, 670, 372, 8, 5), 9800, { shadow: 5, paper: 'term-paper' });
	k.put('ink', k.line([[176, 268], [670, 268]], { w: 0.8, seed: 9801 }));
	k.say('code term-title', 188, 262, 'server');

	const drop = (x: number, y: number, w: number, h: number) => k.pathOf(rect(x, y, w, h), true);
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		file,
		fileAnchor: [82, 218] as [number, number],
		targets: { browser: [300, 120] as [number, number], phone: [507, 130] as [number, number], terminal: [420, 310] as [number, number] },
		hosts: { browser: drop(176, 26, 250, 190), phone: drop(452, 20, 110, 220), terminal: drop(176, 248, 494, 124), file: drop(18, 140, 128, 156) },
		browserSeats: browserSeats.map((s, i) => ({ key: s.seat, poly: k.pathOf(s.poly, true), ink: k.outline(s.poly, { w: 0.9, seed: 9900 + i }), spot: k.wash(s.poly, 9920 + i, 0.6, 1.4), x: s.x + s.w / 2 - 9, y: s.y + s.h / 2 + 5 })),
		phoneSeats: phoneSeats.map((s, i) => ({ key: s.seat, poly: k.pathOf(s.poly, true), ink: k.outline(s.poly, { w: 0.9, seed: 9940 + i }), spot: k.wash(s.poly, 9960 + i, 0.6, 1.4), x: s.x + s.w / 2 - 8, y: s.y + s.h / 2 + 4 })),
		titles: { browser: { x: 196, y: 76 }, phone: { x: 470, y: 80 } },
		terminalLines: [0, 1, 2, 3].map((i) => ({ x: 190, y: 290 + i * 20 })),
		empty: { browser: { x: 236, y: 140 }, phone: { x: 472, y: 140 }, terminal: { x: 300, y: 320 } },
		note: k.note([70, 136], [60, 30], 9990),
	};
}
