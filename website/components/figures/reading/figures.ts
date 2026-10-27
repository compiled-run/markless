// The three small figures: a slice of the guest list beside a phone showing what it does. Each comes wide (side by side) and tall (stacked) for narrow screens.
import { LINES, VALUES } from './model.ts';
import type { Token } from './printout.ts';
import { sketcher } from './sketch.ts';

type Tokens = readonly (readonly Token[])[];

const valueAt = (k: number) => LINES[VALUES[k]!.line]!.text.indexOf(VALUES[k]!.text);
const valueEnd = (k: number) => valueAt(k) + VALUES[k]!.text.length;

/** `{ }`: each value leaves its socket on the slip and lands on its spot on the phone. */
function values(tokens: Tokens, tall: boolean) {
	const k = tall ? sketcher(400, 440, tokens, 14) : sketcher(760, 250, tokens, 13);
	const lh = tall ? 32 : 30;
	const slip = tall ? { x0: 10, y0: 10, x1: 388, y1: 158 } : { x0: 14, y0: 26, x1: 380, y1: 166 };
	k.paper(slip.x0, slip.y0, slip.x1, slip.y1, 4);
	const c = k.code([5, 6, 7, 12], slip.x0 + 14, slip.y0 + 32, lh);
	const sockets = [0, 1, 2].map((v) => {
		const row = v === 2 ? 3 : v;
		return { x0: c.columnX(row, valueAt(v)), x1: c.columnX(row, valueEnd(v)), y: c.rows[row]!.y };
	});
	sockets.forEach((s, i) => k.socket(s.x0, s.x1, s.y, 100 + i * 120));
	const ph = tall ? k.phone(110, 200, 290, 420) : k.phone(488, 10, 668, 236);
	const x = ph.x0 + 18;
	const ada = ph.y0 + 50;
	const grace = ada + 36;
	const button = { x0: x - 4, y0: grace + 24, x1: x + 76, y1: grace + 54 };
	k.highlight(x - 8, ada - 5, x + 52, 26, 'land host');
	k.text(x, ada, 'Ada', 'ui bold land name');
	k.text(x, grace, 'Grace', 'ui land name');
	k.text(x + 60, ada + 2, 'host', 'hand small land host');
	k.paper(button.x0, button.y0, button.x1, button.y1, 6);
	k.text((button.x0 + button.x1) / 2, button.y1 - 10, 'Clear', 'ui mid');
	k.cursor(button.x1 - 14, button.y1 - 10, 'land clear');
	if (tall) {
		k.arrow([sockets[0]!.x1 + 4, sockets[0]!.y - 6], [x + 56, ada - 12], 600, 'pen travel', [[40, 0], [60, -120]]);
		k.arrow([sockets[1]!.x0 - 5, sockets[1]!.y - 4], [x - 6, ada - 4], 900, 'pen travel', [[-50, 10], [-70, -60]]);
		k.arrow([sockets[1]!.x0 - 5, sockets[1]!.y - 4], [x - 6, grace - 4], 950, 'pen travel', [[-50, 10], [-80, -40]]);
		k.arrow([(sockets[2]!.x0 + sockets[2]!.x1) / 2, sockets[2]!.y + 8], [button.x1 - 12, button.y1 - 12], 1200, 'pen travel', [[30, 90], [40, -60]]);
	} else {
		k.arrow([sockets[0]!.x1 + 4, sockets[0]!.y - 8], [x + 56, ada - 14], 600, 'pen travel', [[70, -60], [10, -50]]);
		k.arrow([sockets[1]!.x1 + 4, sockets[1]!.y - 4], [x - 8, ada - 4], 900, 'pen travel', [[170, 0], [-60, 0]]);
		k.arrow([sockets[1]!.x1 + 4, sockets[1]!.y - 4], [x - 8, grace - 4], 950, 'pen travel', [[170, 10], [-60, 0]]);
		k.arrow([sockets[2]!.x1 + 4, sockets[2]!.y - 2], [button.x1 - 12, button.y1 - 12], 1200, 'pen travel', [[130, 20], [-20, 60]]);
	}
	return k.out;
}

/** `@{ }`: the body as index cards read top to bottom; only the last card, the element, shows up on the page. */
function steps(tokens: Tokens, tall: boolean) {
	const k = tall ? sketcher(400, 550, tokens, 13) : sketcher(760, 262, tokens, 13);
	const cardW = tall ? 352 : 330;
	const left = tall ? 38 : 50;
	const gap = tall ? 66 : 74;
	const cards = [0, 1, 2].map((i) => ({ x0: left + [0, 8, -4][i]!, y0: 14 + i * gap, x1: left + [0, 8, -4][i]! + cardW, y1: 14 + i * gap + 52 }));
	k.pen([[left - 22, 6], [left - 22, cards[2]!.y1 + 6]], 0, 'pen guide');
	k.pen([[left - 22, 6], [left - 22, cards[2]!.y1 + 6]], 200, 'pulse read');
	cards.forEach((card, i) => {
		k.paper(card.x0, card.y0, card.x1, card.y1, 3);
		k.code([[1, 2, 3][i]!], card.x0 + 14, card.y0 + 32, 0);
		const my = (card.y0 + card.y1) / 2;
		k.pen(Array.from({ length: 20 }, (_, a): [number, number] => [left - 22 + Math.cos((a / 18) * Math.PI * 2 - 1.6) * 11, my + Math.sin((a / 18) * Math.PI * 2 - 1.6) * 11]), 300 + i * 500);
		k.text(left - 26, my + 5, String(i + 1), 'hand');
	});
	k.text(cards[2]!.x0 + 14 + 10 * k.advance, cards[2]!.y0 + 32, '…the whole element', 'hand small');
	k.paper(cards[2]!.x0, cards[2]!.y0, cards[2]!.x1, cards[2]!.y1, 3, 'lift');
	k.code([3], cards[2]!.x0 + 14, cards[2]!.y0 + 32, 0, 'lift');
	if (tall) k.text(left - 30, cards[2]!.y1 + 34, '1 and 2 leave nothing on the page', 'hand small');
	else [0, 1].forEach((i) => k.text(cards[i]!.x1 + 14, (cards[i]!.y0 + cards[i]!.y1) / 2 + 5, 'nothing on the page', 'hand small'));
	const ph = tall ? k.phone(110, 290, 290, 530) : k.phone(560, 10, 740, 250);
	const x = ph.x0 + 18;
	const top = ph.y0 + 24;
	k.pen([[ph.x0 + 8, top], [ph.x1 - 8, top], [ph.x1 - 8, top + 150], [ph.x0 + 8, top + 150], [ph.x0 + 8, top]], 1800, 'pen shows');
	k.text(x, top + 34, 'Ada', 'ui bold shows');
	k.text(x, top + 68, 'Grace', 'ui shows');
	k.paper(x - 4, top + 90, x + 76, top + 120, 6, 'shows');
	k.text(x + 36, top + 110, 'Clear', 'ui mid shows');
	const from: [number, number] = tall ? [cards[2]!.x0 + cardW / 2, cards[2]!.y1 + 48] : [cards[2]!.x1 + 6, (cards[2]!.y0 + cards[2]!.y1) / 2];
	const to: [number, number] = tall ? [(ph.x0 + ph.x1) / 2, ph.y0 + 14] : [ph.x0 + 4, top + 40];
	k.arrow(from, to, 1600, 'pen', tall ? [[0, 30], [0, -40]] : [[70, 0], [-60, 30]]);
	k.text(tall ? from[0] + 18 : from[0] + 30, tall ? from[1] + 26 : from[1] - 14, 'what shows up', 'hand small');
	return { layout: k.out, lift: { x: to[0] - cards[2]!.x0, y: to[1] - cards[2]!.y0 } };
}

/** `@for` traces the row once per guest; `@if` is a flap that opens on "No one yet" when the list is empty. */
function blocks(tokens: Tokens, tall: boolean) {
	const k = tall ? sketcher(400, 540, tokens, 14) : sketcher(760, 290, tokens, 13);
	const lh = tall ? 30 : 28;
	const slip = tall ? { x0: 10, y0: 10, x1: 388, y1: 212 } : { x0: 14, y0: 14, x1: 372, y1: 200 };
	k.paper(slip.x0, slip.y0, slip.x1, slip.y1, 4);
	const row = [{ line: 5, from: 0, to: 9 }, { text: '{…}' }, { line: 5, from: 39, to: 40 }, { line: 6, from: 0, to: 6 }, { line: 7, from: 0, to: 4 }] as const;
	const c = k.code([4, row, 8, 9, 10, 11], slip.x0 + 14, slip.y0 + 30, lh);
	const bx = slip.x1 - 12;
	const bracket = (r0: number, r1: number, at: number) => {
		const y0 = c.rows[r0]!.y - lh * 0.65;
		const y1 = c.rows[r1]!.y + lh * 0.2;
		k.pen([[bx - 8, y0], [bx, y0 + 4], [bx, (y0 + y1) / 2 - 6], [bx + 6, (y0 + y1) / 2], [bx, (y0 + y1) / 2 + 6], [bx, y1 - 4], [bx - 8, y1]], at);
		return (y0 + y1) / 2;
	};
	const forMid = bracket(0, 2, 100);
	const ifMid = bracket(3, 5, 1600);
	const ph = tall ? k.phone(150, 250, 330, 520) : k.phone(520, 10, 700, 280);
	const x0 = ph.x0 + 10;
	const x1 = ph.x1 - 10;
	const rowY = [ph.y0 + 16, ph.y0 + 52];
	rowY.forEach((y, i) => {
		k.pen([[x0, y], [x1, y], [x1, y + 30], [x0, y + 30], [x0, y]], 500 + i * 600, 'pen row');
		k.text(x0 + 12, y + 21, ['Ada', 'Grace'][i]!, i === 0 ? 'ui bold row' : 'ui row');
		k.text(x1 - 16, y + 21, String(i + 1), 'hand small row');
	});
	const flap = ph.y0 + 100;
	k.paper(x0, flap, x1, flap + 40, 3, 'flap open');
	k.text(x0 + 12, flap + 26, 'No one yet', 'ui flap open');
	k.tucked(x0 + 2, flap + 14, x1 - 2, flap + 40, 'flap shut');
	k.paper(x0, flap, x1, flap + 12, 2, 'flap shut');
	k.text(x1 - 30, flap + 10, 'fold', 'hand tiny flap shut');
	const button = { x0: x0 + 4, y0: flap + 62, x1: x0 + 84, y1: flap + 92 };
	k.paper(button.x0, button.y0, button.x1, button.y1, 6);
	k.text((button.x0 + button.x1) / 2, button.y1 - 10, 'Clear', 'ui mid');
	k.cursor(button.x1 - 14, button.y1 - 10, '');
	if (tall) {
		k.arrow([bx + 8, forMid], [x1 + 4, rowY[0]! + 30], 300, 'pen', [[30, 40], [60, -40]]);
		k.arrow([bx + 8, ifMid], [x1 + 4, flap + 8], 1800, 'pen', [[30, 40], [60, -20]]);
		k.text(14, rowY[0]! + 26, 'once per', 'hand small');
		k.text(14, rowY[0]! + 46, 'guest', 'hand small');
		k.text(14, flap + 10, 'only when', 'hand small');
		k.text(14, flap + 30, "no one's going", 'hand small');
	} else {
		k.arrow([bx + 10, forMid], [x0 - 6, rowY[0]! + 30], 300, 'pen', [[50, 0], [-50, 0]]);
		k.arrow([bx + 10, ifMid], [x0 - 6, flap + 8], 1800, 'pen', [[50, 0], [-50, 0]]);
		k.text(bx + 18, forMid - 30, 'once per', 'hand small');
		k.text(bx + 18, forMid - 12, 'guest', 'hand small');
		k.text(bx + 18, ifMid + 26, 'only when', 'hand small');
		k.text(bx + 18, ifMid + 44, "no one's going", 'hand small');
	}
	return k.out;
}

/** The three figures in both shapes, frozen into figures.art.ts. */
export function drawings(tokens: Tokens) {
	const wide = steps(tokens, false);
	const tall = steps(tokens, true);
	return {
		values: { wide: values(tokens, false), tall: values(tokens, true) },
		steps: { wide: wide.layout, tall: tall.layout, lift: { wide: wide.lift, tall: tall.lift } },
		blocks: { wide: blocks(tokens, false), tall: blocks(tokens, true) },
	};
}
