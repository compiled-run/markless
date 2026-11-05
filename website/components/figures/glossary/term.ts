// Two pages of this site, from two sections, each using the word "resumes" with the site's term underline; the tooltip on either one carries the glossary's single meaning.
import { roundRect } from '../ink/desk.ts';
import { outline, pathOf, wash } from '../ink/ink.ts';
import type { SheetSpec } from '../ink/sheets.ts';
import { figure, type Kit } from '../reference/kit.ts';

/** The glossary's one meaning for the term, as its table states it. */
export const TERM = 'resume';
export const MEANING = 'The browser carries on from server HTML and its payload. It does not run the component body again.';

/** A real line from each of two sections of the site, split around the word. */
export const PAGES = [
	{
		key: 'a',
		url: 'markless.dev/how-it-works',
		source: 'pages/how-it-works/index.mdx',
		lines: [{ before: 'It ', term: 'resumes', after: '. When a server renders the page,' }],
	},
	{
		key: 'b',
		url: 'markless.dev/contributing',
		source: 'pages/contributing/index.mdx',
		lines: [{ before: '@markless/web renders and ', term: 'resumes', after: ' for the web:' }],
	},
];

/** The tooltip's meaning, wrapped as the card prints it. */
const WRAP = ['The browser carries on from server', 'HTML and its payload. It does not', 'run the component body again.'];

const W = 17.6;
/** Shantell's average advance at the page's prose size, in sheet units per character. */
const ADV = 0.29;
const FIRST = 3.1;
const PITCH = 1.05;
/** Where the second page starts: below the first page and the room its tooltip hangs into. */
const GAP = FIRST + PITCH + 0.2 + 6;
const sheetOf = (i: number): SheetSpec => {
	const h = FIRST + PAGES[i]!.lines.length * PITCH + 0.2;
	return { key: PAGES[i]!.key, x: i * 0.4, y: i === 0 ? 0 : GAP, w: W, h, bar: 'browser', title: PAGES[i]!.url, curl: false, turn: i ? 0.012 : -0.012 };
};
const SHEETS = [sheetOf(0), sheetOf(1)];

export function drawing() {
	const fig = figure(SHEETS, [[W + 1, GAP + SHEETS[1]!.h + 5.6, 0]]);
	const base = fig.base(() => undefined);
	const pages = PAGES.map((page, p) => {
		const lines = page.lines.map((line, i) => ({ key: i, ...line, matrix: fig.geo.raw.matrixAt(page.key, 1, FIRST + i * PITCH) }));
		const at = page.lines.findIndex((line) => line.term);
		const line = page.lines[at]!;
		const u0 = 1 + line.before.length * ADV;
		const u1 = u0 + line.term.length * ADV;
		const v = FIRST + at * PITCH;
		const tip = fig.part((k: Kit) => {
			const top = SHEETS[p]!.h + 0.15;
			const stem = k.raw.on(page.key, [[u0 + 0.9, v + 0.45], [u0 + 0.9, top + 0.05]], 0.3);
			k.raw.path(pathOf(stem), 'tip-stem');
			const card = k.raw.on(page.key, [...roundRect(u0 - 1.2, top + 0.35, u0 + 10.6, top + 4.6, 0.4, 4)], 0.3);
			const point = k.raw.on(page.key, [[u0 + 0.5, top + 0.38], [u0 + 0.9, top + 0.02], [u0 + 1.3, top + 0.38]], 0.3);
			k.raw.path(wash(k.raw.on(page.key, roundRect(u0 - 1, top + 0.6, u0 + 10.9, top + 4.95, 0.4, 4)), 3500 + p, 0.4, 1.2), 'shadow-wash light');
			k.raw.path(pathOf(card, true) + pathOf(point, true), 'sheet-paper');
			k.raw.path(outline(card, { w: 1.1, heavy: 1, seed: 3510 + p }) + outline(point, { w: 0.9, seed: 3520 + p }, false), 'sheet-ink');
			k.row(page.key, u0 - 0.6, top + 1.45, TERM, 'bold');
			WRAP.forEach((text, i) => k.row(page.key, u0 - 0.6, top + 2.45 + i * 0.75, text, 'ui'));
		});
		return {
			key: p,
			url: page.url,
			lines,
			underline: fig.part((k: Kit) => k.raw.path(pathOf(k.raw.on(page.key, [[u0, v + 0.22], [u1, v + 0.22]])), 'term-line')),
			wash: fig.part((k: Kit) => k.raw.path(wash(k.raw.on(page.key, roundRect(u0 - 0.1, v - 0.55, u1 + 0.1, v + 0.25, 0.2, 3)), 3600 + p, 0.3, 1), 'hover-wash')),
			hit: fig.area(page.key, [[u0 - 0.2, v - 0.7], [u1 + 0.2, v - 0.7], [u1 + 0.2, v + 0.4], [u0 - 0.2, v + 0.4]]),
			tip,
		};
	});
	return { view: base.view, base: base.part, pages };
}
