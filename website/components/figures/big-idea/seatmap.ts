// One seatmap.tsrx card above three hosts of equal weight: a browser, a phone and a server terminal, joined by dashed lines.
import { flatKit, rect, roundRect } from '../how/flat-kit.ts';
import { SEATS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 430;

const ROW_Y = 176;
const HOST_H = 180;
const COLS = [{ x: 14, w: 204 }, { x: 288, w: 104 }, { x: 462, w: 204 }];

type Box = { x: number; y: number; w: number; h: number };
const seatBoxes = (area: Box, gap: number, rounded: boolean) =>
	SEATS.map((seat, i) => {
		const col = i % 4;
		const row = Math.floor(i / 4);
		const size = Math.min((area.w - 3 * gap) / 4, (area.h - gap) / 2);
		const x = area.x + col * (size + gap);
		const y = area.y + row * (size + gap);
		return { seat, x, y, w: size, h: size, poly: rounded ? roundRect(x, y, x + size, y + size, 5, 4) : rect(x, y, size, size) };
	});

export function drawing() {
	const k = flatKit('b');
	const card = { x: 262, y: 8, w: 156, h: 110 };
	const file = k.group(() => {
		k.card(rect(card.x, card.y, card.w, card.h), 9500, { shadow: 5 });
		k.put('hatch light', k.hatch(rect(card.x + 1, card.y + 1, card.w - 2, 20), 0.1, 2.4, 9501, { cluster: 5 }));
		k.say('code file-name', card.x + 10, card.y + 15, 'seatmap.tsrx');
		["let seat = state('A2');", '', '<p>Your seat: {seat}</p>', '<button>…</button>'].forEach((line, i) => k.say('code file-code', card.x + 10, card.y + 40 + i * 16, line));
	});
	const [b, p, t] = COLS;
	k.windowFrame(b!.x, ROW_Y, b!.w, HOST_H, 'seats.app', 9600);
	const browserSeats = seatBoxes({ x: b!.x + 14, y: ROW_Y + 68, w: b!.w - 28, h: 90 }, 8, false);
	k.card(roundRect(p!.x, ROW_Y - 10, p!.x + p!.w, ROW_Y + HOST_H + 10, 16, 6), 9700, { shadow: 5, w: 1.5 });
	k.put('ink', k.outline(roundRect(p!.x + 7, ROW_Y + 8, p!.x + p!.w - 7, ROW_Y + HOST_H - 8, 6, 4), { w: 0.8, seed: 9701 }) + k.outline(roundRect(p!.x + 38, ROW_Y - 4, p!.x + p!.w - 38, ROW_Y + 1, 2, 3), { w: 0.7, seed: 9702 }));
	const phoneSeats = seatBoxes({ x: p!.x + 13, y: ROW_Y + 74, w: p!.w - 26, h: 40 }, 5, true);
	k.windowFrame(t!.x, ROW_Y, t!.w, HOST_H, 'server', 9800);
	const tag = roundRect(p!.x + 16, ROW_Y + HOST_H + 18, p!.x + p!.w - 16, ROW_Y + HOST_H + 34, 7, 4);
	k.put('paper', k.pathOf(tag, true));
	k.put('ink', k.outline(tag, { w: 0.8, seed: 9810 }));
	k.say('pencil-text early', p!.x + 26, ROW_Y + HOST_H + 30, 'early proof');
	const labelY = ROW_Y + HOST_H + 52;
	k.say('print host-label', b!.x + b!.w / 2 - 28, labelY, 'Browser');
	k.say('print host-label', p!.x + p!.w / 2 - 22, labelY, 'Phone');
	k.say('print host-label', t!.x + t!.w / 2 - 24, labelY, 'Server');
	const from: [number, number] = [card.x + card.w / 2, card.y + card.h];
	const link = (to: [number, number], seed: number) => {
		const mid: [number, number] = [(from[0] + to[0]) / 2, from[1] + 24];
		const pts = k.resample([from, mid, to], 4);
		return { dashed: k.pathOf(pts), ink: k.line(pts, { w: 1.3, seed, over: 0.2 }) };
	};
	const centre = (c: { x: number; w: number }): [number, number] => [c.x + c.w / 2, ROW_Y - 12];
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		file,
		fileAnchor: [card.x + card.w / 2, card.y + card.h / 2] as [number, number],
		targets: { browser: [b!.x + b!.w / 2, ROW_Y + 90] as [number, number], phone: [p!.x + p!.w / 2, ROW_Y + 90] as [number, number], terminal: [t!.x + t!.w / 2, ROW_Y + 90] as [number, number] },
		hosts: { browser: k.pathOf(rect(b!.x, ROW_Y, b!.w, HOST_H), true), phone: k.pathOf(rect(p!.x, ROW_Y - 10, p!.w, HOST_H + 20), true), terminal: k.pathOf(rect(t!.x, ROW_Y, t!.w, HOST_H), true), file: k.pathOf(rect(card.x, card.y, card.w, card.h), true) },
		links: { browser: link(centre(b!), 9900), phone: link(centre(p!), 9910), terminal: link(centre(t!), 9920) },
		browserSeats: browserSeats.map((s, i) => ({ key: s.seat, poly: k.pathOf(s.poly, true), ink: k.outline(s.poly, { w: 0.9, seed: 9930 + i }), spot: k.wash(s.poly, 9950 + i, 0.6, 1.4), x: s.x + s.w / 2 - 8, y: s.y + s.h / 2 + 5 })),
		phoneSeats: phoneSeats.map((s, i) => ({ key: s.seat, poly: k.pathOf(s.poly, true), ink: k.outline(s.poly, { w: 0.8, seed: 9970 + i }), spot: k.wash(s.poly, 9990 + i, 0.5, 1.2), x: s.x + s.w / 2 - 5.5, y: s.y + s.h / 2 + 3 })),
		titles: { browser: { x: b!.x + 14, y: ROW_Y + 52 }, phone: { x: p!.x + 13, y: ROW_Y + 58 } },
		terminalLines: [0, 1, 2, 3].map((i) => ({ x: t!.x + 12, y: ROW_Y + 56 + i * 22 })),
		empty: { browser: { x: b!.x + 50, y: ROW_Y + 104 }, phone: { x: p!.x + 26, y: ROW_Y + 104 }, terminal: { x: t!.x + 50, y: ROW_Y + 104 } },
	};
}
