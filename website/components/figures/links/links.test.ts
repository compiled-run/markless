import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ABOUT_URL, describeLink, flip, HOME_URL, LINK_TOUR, other } from './model.ts';
import { drawing } from './links.ts';

const linkArt = drawing();

const page = readFileSync(new URL('../../../pages/router/links.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./link-anatomy.tsrx', import.meta.url), 'utf8');

describe('the click and the swap', () => {
	it('swaps the page area and the address together, and keeps the page', () => {
		expect(other('home')).toBe('about');
		expect(other('about')).toBe('home');
		expect(describeLink('about', true)).toContain('only the middle of the page and the address changed, together');
		expect(describeLink('home', false)).toBe('');
		expect(HOME_URL).toBe('beanshop.dev');
		expect(ABOUT_URL).toBe('beanshop.dev/about');
		expect(LINK_TOUR[0]).toBe('go');
		expect(flip('odd')).toBe('even');
	});

	it('wires only the page area; the shop name and the nav never move', () => {
		expect(piece.match(/class="pulse to-page"/g)).toHaveLength(1);
		expect(piece.match(/class="pulse to-parcel"/g)).toHaveLength(1);
		const start = piece.indexOf('class="once"');
		const once = piece.slice(start, piece.indexOf('</g>', start));
		expect(once).toContain('{SHOP}');
		expect(once).not.toMatch(/at ===|beat|ABOUT_URL/);
	});

	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).not.toMatch(/@for|@if/);
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(linkArt.parcel.ink.length).toBeGreaterThan(300);
		expect(linkArt.wires.main.length).toBeGreaterThan(50);
		expect(linkArt.wires.thin.length).toBeGreaterThan(30);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(linkArt));
	});

	it('is on the Links page under its own heading', () => {
		expect(page).toContain("import LinkAnatomy from '../../components/figures/links/link-anatomy.tsrx';");
		expect(page.indexOf('## A click swaps in only the page')).toBeLessThan(page.indexOf('<LinkAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by links.test.ts from links.ts. Refresh with the figure test's -u flag.
import type { drawing } from './links.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(linkArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./links.art.ts');
	});
});
