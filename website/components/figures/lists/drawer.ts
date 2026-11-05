// A library card-catalogue drawer: index cards standing in a row with title tabs, the drawer front with a brass label holder and a pull.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';
import { CARDS } from './drawer-model.ts';

export const WIDTH = 680;
export const HEIGHT = 340;
export const FRONT = { x: 120, y: 214, w: 440, h: 110 };
export const LABEL = { x: 270, y: 236, w: 140, h: 36 };
const CARD = { x: 150, y: 150, w: 330, h: 120 };
const TABS = [0, 100, 200];
const TAB = { w: 120, h: 22 };

function cardArt(i: number) {
	const tabX = CARD.x + 6 + TABS[i % 3]!;
	const outlinePts: P[] = [
		[CARD.x, CARD.y + TAB.h],
		[tabX, CARD.y + TAB.h],
		[tabX + 6, CARD.y],
		[tabX + TAB.w - 6, CARD.y],
		[tabX + TAB.w, CARD.y + TAB.h],
		[CARD.x + CARD.w, CARD.y + TAB.h],
		[CARD.x + CARD.w, CARD.y + CARD.h],
		[CARD.x, CARD.y + CARD.h],
	];
	const card = jitter(resample(outlinePts, 6, true), 3101 + i * 7, 0.7);
	return {
		card: pathOf(card, true),
		ink: outline(card, { w: 1.3, heavy: 0.9, seed: 3102 + i * 7 }) + line([[CARD.x + 16, CARD.y + 48], [CARD.x + CARD.w - 16, CARD.y + 49]], { w: 0.7, seed: 3103 + i * 7, over: 0 }),
		textX: tabX + TAB.w / 2,
		textY: CARD.y + 17,
	};
}

function frontArt() {
	const { x, y, w, h } = FRONT;
	const front = jitter(resample(roundRect(x, y, x + w, y + h, 6), 6, true), 3201, 1.1);
	const shadow = jitter(resample(roundRect(x + 10, y + 12, x + w + 10, y + h + 12, 6), 8, true), 3202, 1.2);
	const holder = jitter(resample(roundRect(LABEL.x - 8, LABEL.y - 6, LABEL.x + LABEL.w + 8, LABEL.y + LABEL.h + 6, 4), 4, true), 3203, 0.5);
	const pull: P[] = Array.from({ length: 19 }, (_, i) => {
		const a = Math.PI * (i / 18);
		return [x + w / 2 + Math.cos(a) * 34, y + 92 - Math.sin(a) * -8] as P;
	});
	const rivets = [LABEL.x - 3, LABEL.x + LABEL.w + 3].map((rx, i) => outline(ellipse(rx, LABEL.y + LABEL.h / 2, 2.5, 2.5, 10), { w: 0.9, seed: 3210 + i })).join('');
	const sides: P[] = jitter(resample([[x - 24, y + 4], [x, y], [x, y + h], [x - 24, y + h - 8]], 6, true), 3204, 0.8);
	const sidesR: P[] = sides.map(([px, py]) => [2 * x + w - px, py] as P);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 3205, { cluster: 4, skip: 0.3 }),
		front: pathOf(front, true),
		grain: hatch(front, 0.04, 7, 3206, { cluster: 2, skip: 0.55, trim: 0.75 }),
		sides: pathOf(sides, true) + pathOf(sidesR, true),
		sideInk: outline(sides, { w: 1.2, seed: 3207 }) + outline(sidesR, { w: 1.2, seed: 3208 }),
		holder: pathOf(holder, true),
		ink: outline(front, { w: 1.9, heavy: 1.5, seed: 3209 }) + outline(holder, { w: 1.3, seed: 3211 }) + rivets + line(pull, { w: 3, seed: 3212, over: 0 }),
		clipTop: y + 4,
	};
}

/** The whole figure, frozen into drawer.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		cards: CARDS.map((card, i) => ({ id: card.id, title: card.title, ...cardArt(i) })),
		front: frontArt(),
		label: LABEL,
	};
}
