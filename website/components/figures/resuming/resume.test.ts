import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { add, describeResume, flip, RESUME_TOUR, START } from './model.ts';
import { drawing } from './wired.ts';

const resumeArt = drawing();

const page = readFileSync(new URL('../../../pages/how-it-works/resuming.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./resume-anatomy.tsrx', import.meta.url), 'utf8');

describe('the page that arrives wired', () => {
	it('counts a bag per press and says what moved', () => {
		expect(add(START)).toBe(START + 1);
		expect(add(99)).toBe(0);
		expect(flip('odd')).toBe('even');
		expect(RESUME_TOUR[0]).toBe('add');
		expect(describeResume(3, true)).toContain('Nothing else on the page was rebuilt.');
		expect(describeResume(2, false)).toBe('The page arrived already wired. The cart line shows 2.');
	});

	it('wires only the cart line; the shop name, product and price never move', () => {
		expect(piece.match(/class="pulse to-page"/g)).toHaveLength(1);
		expect(piece.match(/class="pulse to-envelope"/g)).toHaveLength(1);
		const start = piece.indexOf('class="once"');
		const once = piece.slice(start, piece.indexOf('</g>', start));
		expect(once).toContain('{SHOP}');
		expect(once).not.toMatch(/cart\}|newest|beat/);
	});

	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain('WIRED BEFORE THE PAGE RAN');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(resumeArt.envelope.ink.length).toBeGreaterThan(300);
		expect(resumeArt.wires.main.length).toBeGreaterThan(50);
		expect(resumeArt.wires.thin.length).toBeGreaterThan(50);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(resumeArt));
	});

	it('opens the Resuming page, before its first section', () => {
		expect(page).toContain("import ResumeAnatomy from '../../components/figures/resuming/resume-anatomy.tsrx';");
		expect(page.indexOf('<Subtitle')).toBeLessThan(page.indexOf('<ResumeAnatomy />'));
		expect(page.indexOf('<ResumeAnatomy />')).toBeLessThan(page.indexOf('## '));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by resume.test.ts from wired.ts. Run the figure test with -u to refresh.
import type { drawing } from './wired.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(resumeArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./wired.art.ts');
	});
});
