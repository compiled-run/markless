// A calendar page beside its page source: the HTML a server sent, and the two data blocks under it.
import { flatKit, rect, roundRect } from '../how/flat-kit.ts';
import { DAYS, HTML, STATE_CARD, VIEW_CARD } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

export function drawing() {
	const k = flatKit('v');
	k.windowFrame(10, 40, 290, 300, 'calendar.app', 9200);
	k.say('print title big', 30, 96, 'March');
	const days = DAYS.map((day, i) => {
		const x = 30 + i * 84;
		const poly = roundRect(x, 160, x + 70, 210, 10, 5);
		k.put('paper', k.pathOf(poly, true));
		k.put('ink', k.outline(poly, { w: 1.2, heavy: 1, seed: 9210 + i }));
		return { key: 'd' + day, day, hit: k.pathOf(rect(x - 4, 156, 78, 58), true), spot: k.wash(poly, 9220 + i, 0.8, 1.6), x: x + 25, y: 192 };
	});
	k.card(roundRect(320, 40, 670, 360, 8, 5), 9300, { shadow: 6 });
	k.put('hatch light', k.hatch(rect(322, 42, 346, 24), 0.1, 2.4, 9301, { cluster: 6, skip: 0.2 }));
	k.put('ink', k.line([[320, 66], [670, 66]], { w: 0.9, seed: 9302 }));
	k.say('print title', 332, 59, 'View source');
	HTML.forEach((line, i) => k.say('code src', 334, 90 + i * 19, line));
	const card = (y: number, lines: readonly string[], seed: number) => {
		const poly = roundRect(334, y, 656, y + 14 + lines.length * 17, 6, 4);
		k.put('paper', k.pathOf(poly, true));
		k.put('ink', k.outline(poly, { w: 1, heavy: 0.8, seed }));
		lines.forEach((line, i) => k.say(i === 0 ? 'code card-title' : 'code src', 344, y + 17 + i * 17, line));
		return { hit: k.pathOf(rect(334, y, 322, 14 + lines.length * 17), true), spot: k.wash(poly, seed + 1, 0.6, 1.4) };
	};
	const stateCard = card(232, STATE_CARD, 9310);
	const viewCard = card(286, VIEW_CARD, 9320);
	const sw = roundRect(10, 6, 168, 32, 12, 6);
	k.put('paper', k.pathOf(sw, true));
	k.put('ink', k.outline(sw, { w: 1.2, heavy: 1, seed: 9330 }));
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		days,
		hits: { heading: k.pathOf(rect(26, 74, 140, 30), true), booked: k.pathOf(rect(26, 112, 260, 30), true), js: k.pathOf(rect(10, 6, 158, 26), true), state: stateCard.hit, view: viewCard.hit },
		lineSpots: HTML.map((_, i) => k.wash(rect(330, 76 + i * 19, 330, 18), 9400 + i, 0.6, 1.2)),
		cardSpots: { state: stateCard.spot, view: viewCard.spot },
		booked: { x: 30, y: 134 },
		jsWash: k.wash(sw, 9331, 1, 2),
		js: { x: 24, y: 24 },
		chunk: { x: 334, y: 386 },
	};
}
