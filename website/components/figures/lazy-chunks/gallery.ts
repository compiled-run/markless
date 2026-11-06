// A photo gallery in a browser beside its network panel: both click files arrive with the page, and each runs only when its button is pressed.
import { ellipse, flatKit, rect, roundRect } from '../how/flat-kit.ts';
import { FILES, PHOTOS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

export function drawing() {
	const k = flatKit('g');
	k.windowFrame(10, 40, 370, 320, 'photos.app', 7000);
	const thumbs = PHOTOS.map((name, i) => {
		const x = 34 + i * 112;
		const y = 86;
		return {
			key: name,
			name,
			art: k.group(() => {
				k.picture(x, y, 96, 68, i, 7100 + i * 20);
				k.say('print small-print', x, y + 84, name);
			}),
			label: [x, y - 8] as [number, number],
			hit: k.pathOf(rect(x - 4, y - 4, 104, 96), true),
		};
	});
	const large = PHOTOS.map((name, i) => ({ key: name, art: k.group(() => k.picture(34, 196, 250, 148, i, 7200 + i * 20)) }));
	k.put('pencil', k.line([[34, 196], [284, 196], [284, 344], [34, 344], [34, 196]], { w: 0.6, seed: 7300, over: 0 }));
	const share = k.group(() => {
		const b = roundRect(298, 300, 364, 330, 10, 5);
		k.put('paper', k.pathOf(b, true));
		k.put('wash pink', k.wash(b, 7310, 1, 2));
		k.put('ink', k.outline(b, { w: 1.2, heavy: 1, seed: 7311 }));
		k.say('label button-label', 310, 320, 'Share');
	});

	k.card(roundRect(400, 40, 670, 360, 8, 5), 7400, { shadow: 6 });
	k.put('hatch light', k.hatch(rect(402, 42, 266, 24), 0.1, 2.4, 7401, { cluster: 6, skip: 0.2 }));
	k.put('ink', k.line([[400, 66], [670, 66]], { w: 0.9, seed: 7402 }) + k.line([[400, 92], [670, 92]], { w: 0.6, seed: 7403, over: 0 }) + k.line([[548, 66], [548, 300]], { w: 0.5, seed: 7404, over: 0 }));
	k.say('print title', 412, 59, 'Network');
	k.say('label', 412, 84, 'File');
	k.say('label', 560, 84, 'Ran');
	const rows = [
		{ key: 'page', file: 'photos.html', y: 118 },
		{ key: 'open', file: FILES.open, y: 152 },
		{ key: 'share', file: FILES.share, y: 186 },
	];
	for (const row of rows) {
		k.say('code', 412, row.y, row.file);
		k.put('ink faint', k.line([[400, row.y + 12], [670, row.y + 12]], { w: 0.4, seed: 7410 + row.y, over: 0 }));
	}
	k.say('pencil-text', 412, 330, 'all three arrived at load');
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		thumbs,
		large,
		share: { ...share, hit: k.pathOf(rect(294, 296, 74, 38), true), label: [296, 290] as [number, number] },
		rows: rows.map((row) => ({ key: row.key, y: row.y, hit: k.pathOf(rect(402, row.y - 18, 266, 30), true), spot: k.spot(ellipse(600, row.y - 5, 46, 12, 24), 7500 + row.y) })),
		empty: { x: 120, y: 274 },
		note: k.note([462, 46], [292, 18], 7600),
	};
}
