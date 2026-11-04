// One component, planned while the app builds, and the four places the same plan renders: a browser, a server, a stream and a test.
import { desk, type SheetSpec } from '../ink/sheets.ts';

const FIRST = 2.6;
const PITCH = 0.8;
const v = (row: number) => FIRST + row * PITCH;

export const SOURCE = ['export default function Counter() @{', '  let count = state(0);', '  <button onClick={() => count++}>Count {count}</button>', '}'];

/** Each place the plan renders: the function that renders it, the rows printed under it, and the pen note. */
export const PLACES = [
	{ key: 'browser', call: 'render()', rows: [], note: 'THE BROWSER' },
	{ key: 'server', call: 'renderToString()', rows: ['<button …>Count 0</button>'], note: 'HTML ON A SERVER' },
	{ key: 'stream', call: 'renderToStream()', rows: ['<main> …', '… </main>'], note: 'HTML IN PIECES' },
	{ key: 'test', call: '@markless/vitest-browser', rows: ['render(Counter)', 'renderSSR(Counter)'], note: 'A BROWSER TEST' },
];

export function drawing() {
	const planH = v(SOURCE.length - 1) + 0.9;
	const top = planH + 2.6;
	const cells: SheetSpec[] = PLACES.map((place, i) => ({ key: place.key, x: (i % 2) * 11 - 0.2, y: top + Math.floor(i / 2) * 6.2, w: 10.2, h: 5, turn: [-0.02, 0.015, 0.01, -0.015][i]!, bar: 'none' }));
	const k = desk(680, [{ key: 'plan', x: 0, y: 0, w: 21, h: planH, bar: 'editor', title: 'Counter.tsrx' }, ...cells]);
	k.lay();
	const L = 1.2;
	SOURCE.forEach((text, i) => k.row('plan', L, v(i), text));
	k.hand('plan', 13.4, v(0), 'PLANNED AS IT BUILDS');
	PLACES.forEach((place, i) => {
		const at = 400 + i * 700;
		const routes: [[string, number, number], [string, number, number], [string, number, number][]][] = [
			[['plan', 5, planH + 0.1], ['browser', 5, 0.3], []],
			[['plan', 15, planH + 0.1], ['server', 4.5, 0.3], []],
			[['plan', 1, planH + 0.1], ['stream', -0.1, 1.6], [['browser', -1.1, 2.6]]],
			[['plan', 20, planH + 0.1], ['test', 10.3, 1.6], [['server', 11.3, 2.6]]],
		];
		const [from, to, via] = routes[i]!;
		k.arrow(from, to, 'draw', at, 0, true, via);
		k.row(place.key, 0.7, 1.3, place.call, 'bold', 'show', at + 400);
		k.hand(place.key, 0.7, 4.3, place.note, 'show', at + 500);
		place.rows.forEach((text, r) => k.row(place.key, 0.7, 2.3 + r * 0.8, text, 'mono', 'show', at + 550 + r * 120));
		if (place.key === 'browser') k.button('browser', 0.7, 2, 4.6, 3.3, 'Count 0', at + 600);
		if (place.key === 'test') place.rows.forEach((_, r) => k.tick('test', 7.2, 2.3 + r * 0.8, 'draw', at + 800 + r * 200));
	});
	return k.build();
}
