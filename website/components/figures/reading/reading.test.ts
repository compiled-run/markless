import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODY, describeMarks, figureOf, flip, LINES, SAID, SOURCE, VALUES } from './model.ts';
import { drawing } from './marks.ts';
import { tokensOf } from './tokens.ts';

const page = readFileSync(new URL('../../../pages/start/reading-tsrx.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./printout-anatomy.tsrx', import.meta.url), 'utf8');
const tokens = await tokensOf();
const art = drawing(tokens);

describe('the marked-up printout', () => {
	it('prints a short file with every kind of { } plus @for and @if', () => {
		expect(LINES.length).toBeLessThanOrEqual(15);
		expect(SOURCE).toContain('@for (');
		expect(SOURCE).toContain('@if (');
		expect(VALUES.map((value) => value.text)).toEqual(["{name === 'Ada' ? 'host' : ''}", '{name}', '{clear}']);
		for (const value of VALUES) expect(LINES[value.line]!.text).toContain(value.text);
		expect(LINES[BODY.from - 1]!.text.endsWith('@{')).toBe(true);
		expect(LINES[BODY.to + 1]!.text).toBe('}');
	});

	it('colours the printed text the way the site colours code', () => {
		expect(tokens.flat().map((token) => token.content).join('')).toBe(SOURCE.replaceAll('\n', ''));
		const pieces = art.lines.flatMap((line) => line.pieces);
		expect(pieces.find((p) => p.text === '@for')?.tint).toMatch(/^--c:#/);
		expect(pieces.map((p) => p.text).join('').replaceAll(' ', '')).toBe(LINES.map((line) => line.text).join('').replaceAll(' ', ''));
	});

	it('marks every value and labels each one, with one bracket of instructions', () => {
		const { swipes, notes } = art.marks.overview;
		expect(swipes.filter((swipe) => !swipe.desk)).toHaveLength(VALUES.length);
		expect(notes.filter((note) => note.text === 'value')).toHaveLength(VALUES.length);
		expect(notes.map((note) => note.text)).toContain('instructions');
		expect(flip('odd')).toBe('even');
	});

	it('notes what each value produces', () => {
		expect(art.marks.values.swipes).toHaveLength(VALUES.length);
		expect(art.marks.values.notes.map((note) => note.text)).toEqual(['Ada, then Grace', "'host' for Ada,", 'empty for Grace', 'a function, run on click']);
	});

	it('numbers the instructions in run order and brackets the last one as what shows up', () => {
		const texts = art.marks.steps.notes.map((note) => note.text);
		expect(texts.filter((text) => /^\d$/.test(text))).toEqual(['1', '2', '3']);
		expect(texts).toContain('runs in this order');
		expect(texts).toContain('this is what shows up');
		expect(LINES[3]!.text).toBe('<section>');
		expect(art.marks.steps.swipes).toHaveLength(0);
	});

	it('boxes @for and @if with what each does, beside what the page shows', () => {
		const texts = art.marks.blocks.notes.map((note) => note.text);
		expect(texts).toEqual(expect.arrayContaining(['once per guest', 'only when', "no one's going", 'Ada', 'Grace', 'Clear']));
		expect(art.marks.blocks.slips).toHaveLength(1);
	});

	it('says what each mark-up shows, and says so again on a replay', () => {
		for (const figure of ['overview', 'values', 'steps', 'blocks'] as const) {
			expect(figureOf(figure)).toBe(figure);
			expect(describeMarks(figure, true)).toBe('Marked up again. ' + SAID[figure]);
		}
		expect(figureOf('nonsense')).toBe('overview');
	});

	it('respects reduced motion, stops its tour on touch, resets on Escape and speaks each change', () => {
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('<figcaption class="sr">');
	});

	it.each([
		['overview', '## Mark up a whole file'],
		['values', '## `{ }` holds a value'],
		['steps', '## `@{ }` holds instructions, run top to bottom'],
		['blocks', '## Blocks that start with @'],
	])('puts the %s mark-up under its heading on a page that never says slot', (figure, heading) => {
		expect(page).toContain("import PrintoutAnatomy from '../../components/figures/reading/printout-anatomy.tsrx';");
		const at = page.indexOf(`<PrintoutAnatomy figure="${figure}" />`);
		expect(at).toBeGreaterThan(page.indexOf(heading));
		expect(page.match(new RegExp(`figure="${figure}"`, 'g'))).toHaveLength(1);
		expect(page).not.toMatch(/\bslots?\b/i);
	});

	it('draws the same scene every time', () => {
		expect(JSON.stringify(drawing(tokens))).toBe(JSON.stringify(art));
	});

	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by reading.test.ts from marks.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './marks.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./printout.art.ts');
	});
});
