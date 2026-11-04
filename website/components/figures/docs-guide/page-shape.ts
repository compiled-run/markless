// A docs page's .mdx file printed on a sheet, with each part of its opening and its sections labelled in pen.
import { desk } from '../ink/sheets.ts';

const PITCH = 0.78;
const v = (row: number) => 2.6 + row * PITCH;

/** The opening every page follows, then its sections and its limits, as the Reading a .tsrx file page has them. */
export const LINES: { text: string; note?: string }[] = [
	{ text: '# Reading a .tsrx file', note: 'CLAIM OR TASK' },
	{ text: '<PageMeta time="5 min" assumes="nothing" />', note: 'TIME: THE FORMULA' },
	{ text: '<Subtitle text="Every .tsrx file …" />', note: 'ONE SENTENCE' },
	{ text: '```tsrx title="guest-list.tsrx"', note: 'ONE REAL EXAMPLE' },
	{ text: '…' },
	{ text: '```' },
	{ text: '## Mark up a whole file', note: '3 TO 6, ONE IDEA' },
	{ text: '## `{ }` holds a value' },
	{ text: '…' },
	{ text: '## Blocks that start with @' },
	{ text: "- An `@if` or `@switch` can't sit …", note: 'LIMITS GO LAST' },
];

export function drawing() {
	const k = desk(680, [{ key: 'mdx', x: 0, y: 0, w: 22, h: v(LINES.length) + 0.1, bar: 'editor', title: 'reading-tsrx.mdx' }]);
	k.lay();
	const u = 1.5;
	LINES.forEach((line, i) => k.row('mdx', u, v(i), line.text, line.text.startsWith('#') ? 'bold' : 'mono'));
	k.next();
	let at = 300;
	LINES.forEach((line, i) => {
		if (!line.note) return;
		k.hand('mdx', 16.2, v(i), line.note, 'show', at + 150);
		if (i === 3) k.bracket('mdx', 0.7, v(3), v(5), 'draw', at);
		else if (i === 6) k.bracket('mdx', 0.7, v(6), v(9), 'draw', at);
		else k.number('mdx', 0.55, v(i), String([0, 1, 2, 10].indexOf(i) + 1), 'draw', at);
		at += 550;
	});
	return k.build();
}
