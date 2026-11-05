// A playlist page with the `playing` value beside it, ruled to the only two spots that read it: the header and the marked row.
import { createDesk, ellipse, hatch, line, outline, type P, pathOf, roundRect } from '../how/desk-kit.ts';
import { SONGS, TITLE } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

export function drawing() {
	const desk = createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [11, 6, 0],
		elevation: 64,
		bounds: [[-0.4, -0.4, 0], [23, -0.4, 0], [23, 12.6, 0], [-0.4, 12.6, 0]],
	});
	desk.deskTone(-1, 23, 12.2, 13.6, 7900);
	const page = desk.flat([0, 0], -0.02, 0.02);
	desk.card(page, 14, 12, 8000, { cast: [0.3, 0.3, 0] });
	desk.put('hatch light', hatch(page.on([[0, 0], [14, 0], [14, 1.4], [0, 1.4]]), 0.12, 2.2, 8001, { cluster: 6, skip: 0.2 }));
	desk.put('ink', line(page.on([[0, 1.4], [14, 1.4]]), { w: 0.9, seed: 8002 }) + [0.6, 1.1, 1.6].map((u, i) => outline(page.on(ellipse(u, 0.7, 0.18, 0.18, 14)), { w: 0.8, seed: 8003 + i })).join(''));
	desk.say('print title big', page.matrix(0.9, 3.0, 0.14), TITLE);
	const titleHit = pathOf(page.on([[0.8, 1.9], [7, 1.9], [7, 3.4], [0.8, 3.4]]), true);
	const titleNote = page.matrix(7.4, 3.0, 0.1);
	const header = page.on(roundRect(0.8, 3.7, 13.2, 5.3, 0.3));
	desk.put('ink', outline(header, { w: 1, seed: 8010 }));
	desk.say('print', page.matrix(1.2, 4.75, 0.11), 'Now playing:');
	const rows = SONGS.map((song, i) => {
		const v = 6.4 + i * 1.8;
		const box = page.on([[0.8, v], [13.2, v], [13.2, v + 1.5], [0.8, v + 1.5]]);
		desk.put('ink faint', line(page.on([[0.8, v + 1.5], [13.2, v + 1.5]]), { w: 0.5, seed: 8020 + i, over: 0 }));
		desk.say('print', page.matrix(2.2, v + 1.0, 0.12), song);
		const dot = page.on(ellipse(1.4, v + 0.75, 0.35, 0.35, 18), 0.02);
		return { key: song, hit: pathOf(box, true), marker: desk.spot(dot, 8030 + i * 3), markerInk: outline(dot, { w: 1, seed: 8032 + i * 3 }), end: page.on([[13.2, v + 0.75]])[0]! };
	});
	const tagPlane = desk.flat([16.4, 4.6], 0.06, 0.02);
	const tag = desk.object(
		() => {
			desk.card(tagPlane, 5.6, 2.2, 8100, { cast: [0.3, 0.3, 0], r: 0.3 });
			desk.say('code tag-code', tagPlane.matrix(0.5, 1.4, 0.13), 'playing');
		},
		tagPlane.on([[0.2, 3.0]])[0]!,
		tagPlane.on([[0, 1.1]])[0]!,
	);
	const from = tag.anchor as unknown as P;
	const headerEnd = page.on([[13.2, 4.5]])[0]!;
	const rule = (to: P, seed: number) => line([from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], to], { w: 2, heavy: 0.6, seed, over: 0.3 });
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: desk.layers,
		words: desk.words,
		objects: { tag },
		rows: rows.map((r, i) => ({ key: r.key, hit: r.hit, marker: r.marker, markerInk: r.markerInk, rule: rule(r.end, 8200 + i), length: Math.round(Math.hypot(r.end[0] - from[0], r.end[1] - from[1])) })),
		headerRule: rule(headerEnd, 8210),
		headerText: page.matrix(5.6, 4.75, 0.11),
		titleHit,
		titleNote,
		headerSpot: desk.spot(page.on(roundRect(5.2, 3.95, 12.6, 5.05, 0.3), 0.02), 8220),
		note: desk.note(desk.at([19.4, 4.4, 0]), 8300, [430, 30]),
	};
}
