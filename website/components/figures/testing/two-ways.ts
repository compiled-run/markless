// render() and renderSSR(): two ways a component reaches the test page, which then meet at one shared check that ticks for both.
import { desk } from '../ink/sheets.ts';

export const WAYS = [
	{ key: 'a', page: 'pa', call: 'render(Counter)', says: ['MOUNTED IN', 'THE BROWSER'], test: 'mounted in the browser' },
	{ key: 'b', page: 'pb', call: 'renderSSR(Counter)', says: ['HTML FROM THE', 'TEST SERVER'], test: 'rendered on a server' },
];

export function drawing() {
	const k = desk(680, [
		{ key: 'a', x: 0, y: 0, w: 9.8, h: 3.6, curl: false },
		{ key: 'b', x: 11, y: 0.2, w: 9.8, h: 3.6, turn: -0.015, curl: false },
		{ key: 'pa', x: 0.4, y: 5.4, w: 9, h: 4.4, bar: 'browser' },
		{ key: 'pb', x: 11.4, y: 5.5, w: 9, h: 4.4, turn: 0.012, bar: 'browser' },
		{ key: 'check', x: 1.2, y: 11.8, w: 18.6, h: 4.6, turn: -0.008, curl: false },
	]);
	k.lay();
	WAYS.forEach((way, i) => {
		const at = 300 + i * 500;
		k.print(way.key, 0.8, 1.4, [{ t: 'await ', tint: 'kw' }, { t: way.call.split('(')[0]!, tint: 'fn' }, { t: '(Counter);' }]);
		k.hand(way.key, 0.8, 2.3, way.says[0]!, 'show', at + 200);
		k.hand(way.key, 0.8, 3.0, way.says[1]!, 'show', at + 250);
		k.arrow([way.key, 4.9, 3.4], [way.page, 4.5, 1.9], 'draw', at, 0, true);
		k.button(way.page, 2.2, 2.4, 6.9, 3.9, 'Count 0', at + 700);
		k.arrow([way.page, 4.5, 4.3], ['check', 4.6 + i * 9.4, 0.5], 'draw', 1900 + i * 200, 0, true);
	});
	k.print('check', 0.8, 1.5, [{ t: 'async function', tint: 'kw' }, { t: ' ' }, { t: 'clickCounts', tint: 'fn' }, { t: '() { … }' }]);
	WAYS.forEach((way, i) => {
		const v = 2.6 + i * 0.95;
		k.print('check', 0.8, v, [{ t: 'test', tint: 'fn' }, { t: '(' }, { t: "'" + way.test + "'", tint: 'str' }, { t: ', …)' }]);
		k.tick('check', 12.6, v, 'draw', 2700 + i * 400);
	});
	k.hand('check', 13.8, 2.7, 'ONE CHECK,', 'show', 3500);
	k.hand('check', 13.8, 3.45, 'BOTH WAYS', 'show', 3550);
	return k.build();
}
