// Three places a .tsrx file could be type-checked: the editor checks it; npm run build and npm run check do not.
import { desk } from '../ink/sheets.ts';

export const PLACES = [
	{ key: 'ed', says: 'CHECKED AS YOU TYPE', ok: true },
	{ key: 'build', command: 'npm run build', says: 'A WRONG PROP STILL BUILDS', ok: false },
	{ key: 'check', command: 'npm run check', says: 'NO .TSRX TYPES', ok: false },
];

export function drawing() {
	const k = desk(680, [
		{ key: 'ed', x: 0, y: 0, w: 20, h: 3.6, bar: 'editor', title: 'app.tsrx' },
		{ key: 'build', x: 0.8, y: 5.4, w: 20, h: 3.3, turn: -0.012, bar: 'terminal' },
		{ key: 'check', x: 0.2, y: 10.4, w: 20, h: 3.3, turn: 0.01, bar: 'terminal' },
	]);
	k.lay();
	k.row('ed', 0.9, 2.7, '4', 'num');
	k.print('ed', 2.2, 2.7, [{ t: '<' }, { t: 'Nav', tint: 'tag' }, { t: ' ' }, { t: 'label', tint: 'fn' }, { t: '={' }, { t: '42', tint: 'num' }, { t: '} />' }]);
	k.wavy('ed', k.col(2.2, 5), k.col(2.2, 10), 2.7, 'draw', 400);
	k.row('build', 1, 2.5, '$', 'dim');
	k.row('build', 1.7, 2.5, PLACES[1]!.command!);
	k.row('check', 1, 2.5, '$', 'dim');
	k.row('check', 1.7, 2.5, PLACES[2]!.command!);
	PLACES.forEach((place, i) => {
		const at = 700 + i * 800;
		const v = place.key === 'ed' ? 2.75 : 2.55;
		k.tick(place.key, 9.6, v, 'draw', at, !place.ok);
		k.hand(place.key, 10.6, v, place.says, 'show', at + 250);
	});
	return k.build();
}
