// Every docs page set in the same composing stick: six lines of type, title to limits, taken from the type case in the same order every time.
import { desk } from '../ink/sheets.ts';
import { slug, tray } from './type.ts';

/** The lines every page is set from, in order, as the Reading a .tsrx file page sets them. */
export const LINES: { text: string; w: number }[] = [
	{ text: '# Reading a .tsrx file', w: 9.2 },
	{ text: '<PageMeta time="5 min" … />', w: 10.6 },
	{ text: '<Subtitle text="…" />', w: 8.6 },
	{ text: '```tsrx  one real example', w: 10.2 },
	{ text: '## 3 to 6 sections, one idea each', w: 12.6 },
	{ text: '- limits go last', w: 7 },
];

const STICK = { x: 0, y: 4.8, w: 15.2, d: 7.4 };
const PITCH = 1.12;

export function drawing() {
	const k = desk(680, [{ key: 'base', x: 0, y: 0, w: 0.01, h: 0.01, curl: false }], [
		[-0.5, -0.5, 0],
		[21, 13.4, 0],
		[21, -0.5, 0],
	]);
	k.next();
	const sort = tray(k, 0.2, 0, 9.6, 3.6, 8, 3, 3500);
	const sorts: [number, number, string][] = [
		[0, 0, '#'],
		[1, 0, '<'],
		[3, 1, '@'],
		[5, 0, '{'],
		[6, 2, '-'],
		[2, 2, '`'],
	];
	sorts.forEach(([col, row, ch], i) => {
		const [x, y] = sort(col, row);
		slug(k, x - 0.35, y - 0.3, 0.7, 0.6, 0.55, 3510 + i * 7, ch, '', undefined, false, 'bold');
	});
	slug(k, STICK.x, STICK.y, STICK.w, STICK.d, 0.3, 3560, '', '', undefined, true);
	slug(k, STICK.x + STICK.w - 0.5, STICK.y - 0.1, 0.6, STICK.d + 0.2, 1.1, 3570, '', '', undefined, true);
	slug(k, STICK.x - 0.1, STICK.y + STICK.d - 0.4, STICK.w - 0.4, 0.5, 0.9, 3575, '', '', undefined, true);
	k.next();
	LINES.forEach((line, i) => {
		const y = STICK.y + 0.35 + i * PITCH;
		slug(k, STICK.x + STICK.w - 0.55 - line.w, y, line.w, 0.98, 0.7, 3600 + i * 11, line.text, 'show', 300 + i * 450);
	});
	k.next();
	const hand = (x: number, y: number, text: string, at: number) => {
		const p = k.raw.proj([x, y, 0]);
		k.raw.textWith(`matrix(1 0 0 1 ${Math.round(p[0])} ${Math.round(p[1])})`, text, 'margin-note', 'show', at);
	};
	hand(STICK.w + 0.8, STICK.y + 1.2, 'THE SAME ORDER', 3000);
	hand(STICK.w + 0.8, STICK.y + 2.1, 'ON EVERY PAGE', 3100);
	hand(10.6, 1.4, 'THE TYPE CASE', 200);
	return k.build();
}
