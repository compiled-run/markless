import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BYLINE, describe as say, flip, JOURNAL, like, pressed, START, TARGET, TITLE, TOUR } from './model.ts';
import { drawing } from './wired.ts';

const scene = drawing();

const page = readFileSync(new URL('../../../pages/start/existing-site.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./existing-site-anatomy.tsrx', import.meta.url), 'utf8');
const between = (from: string, to: string) => {
	const at = piece.indexOf(from);
	return piece.slice(at, piece.indexOf(to, at));
};

describe('the spot cut out for render()', () => {
	it('drops the piece into the hole on the first press, then counts likes on every press after', () => {
		expect(pressed('out')).toBe('drop');
		expect(pressed('drop')).toBe('live');
		expect(pressed('live')).toBe('live');
		expect(START).toBe(12);
		expect(like(12)).toBe(13);
		expect(like(99)).toBe(0);
	});

	it('flips the beat on every press so the press animations replay', () => {
		expect(flip('rest')).toBe('odd');
		expect(flip('odd')).toBe('even');
		expect(flip('even')).toBe('odd');
	});

	it('speaks one plain sentence per change', () => {
		expect(say('drop', 12)).toBe('render() put the like button into the #app spot. The rest of the page did not move.');
		expect(say('live', 13)).toBe('Liked. The button now shows 13.');
		expect(say('out', 12)).toBe('The like button lies beside the page, and the #app spot is empty.');
		expect(say('out', 12, true)).toBe('The like button is back on the desk, and the #app spot is empty again.');
	});

	it('tours a placement, two likes and a reset', () => {
		expect(TOUR.slice(0, 3)).toEqual(['press', 'press', 'press']);
		expect(TOUR.at(-1)).toBe('reset');
	});

	it('tags the hole with its id exactly as written in code', () => {
		expect(TARGET).toBe('#app');
		expect(between('class="tag-text"', '</text>')).toContain('{TARGET}');
		expect(page).toContain("document.querySelector('#app')");
	});

	it('draws no wires, jars or clips', () => {
		expect(piece).not.toMatch(/class="(pulse|cord|brass|boot)"/);
		expect(Object.keys(scene)).not.toContain('wire');
	});

	it('cuts the hole out of the paper and lands the piece flush in it', () => {
		expect(scene.sheet.paper.match(/M/g)).toHaveLength(2);
		expect(piece).toContain('fill-rule: evenodd');
		expect(scene.rest.travel).toMatch(/--dx:-?\d/);
		expect(scene.placed.thick).toBe('');
		expect(scene.rest.piece.thick.length).toBeGreaterThan(50);
	});

	it('shows the count once, with one crossed-out number, inline after its label', () => {
		expect(piece.match(/class="crossed/g)).toHaveLength(1);
		expect(piece.match(/class="digit now/g)).toHaveLength(1);
		const row = between('transform={art.placed.rowMatrix}', '</g>\n\t\t\t\t\t</g>');
		expect(row).toMatch(/\{LIKE\}\{' '\}<tspan class="digit now">\{count\}<\/tspan>/);
	});

	it('never moves the printed page: nothing there reads the figure state', () => {
		const once = between('class="once"', '</g>');
		expect(once.length).toBeGreaterThan(0);
		expect(once).not.toMatch(/(?<![.\w])(count|newest|beat|phase)\b/);
		expect(once).toContain('{JOURNAL}');
		expect(once).toContain('{TITLE}');
		expect(once).toContain('{BYLINE}');
		expect(JOURNAL).toBe('Beanshop Journal');
		expect(TITLE).toBe('How we roast on Tuesdays');
		expect(BYLINE.startsWith('by ')).toBe(true);
	});

	it('carries one margin note and no readout', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain('ONLY THE SPOT YOU CUT');
	});

	it('stops the tour on touch, skips it offscreen and under reduced motion', () => {
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('IntersectionObserver');
		expect(piece).toMatch(/if \(!seen \|\| touched\) return;/);
	});

	it('is on the existing-site page, under "Cut one spot"', () => {
		expect(page).toContain("import ExistingSiteAnatomy from '../../components/figures/existing-site/existing-site-anatomy.tsrx';");
		const section = page.slice(page.indexOf('## Cut one spot'), page.indexOf('## Three files'));
		expect(section).toContain('<ExistingSiteAnatomy />');
		expect(page).not.toContain('## Hand it one box');
	});

	it('inks every part fully enough not to look thin', () => {
		expect(scene.sheet.ink.length).toBeGreaterThan(500);
		expect(scene.page.text.length).toBeGreaterThan(2000);
		expect(scene.page.photo.tone.length).toBeGreaterThan(300);
		expect(scene.hole.ink.length).toBeGreaterThan(300);
		expect(scene.hole.desk.length).toBeGreaterThan(100);
		expect(scene.rest.piece.ink.length).toBeGreaterThan(300);
		expect(scene.rest.shadow.hatch.length).toBeGreaterThan(200);
		expect(scene.tag.ink.length).toBeGreaterThan(100);
		expect(scene.sheet.pencil.length).toBeGreaterThan(100);
	});

	it('draws the same scene every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(scene));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by wired.test.ts from wired.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './wired.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(scene, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./wired.art.ts');
	});
});
