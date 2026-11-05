import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANSWER, describeVending, FILE, flip, VENDING_TOUR } from './model.ts';
import { drawing } from './vending.ts';

const vendArt = drawing();

const page = readFileSync(new URL('../../../pages/router/api-routes.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./vending-anatomy.tsrx', import.meta.url), 'utf8');

describe('the vending machine', () => {
	it('drops the answer for GET and nothing for POST', () => {
		expect(FILE).toBe('users/[id].get.ts');
		expect(describeVending('GET')).toContain(ANSWER);
		expect(describeVending('POST')).toContain('nothing dropped, and the coin came back');
		expect(describeVending('none')).toBe('');
		expect(VENDING_TOUR[0]).toBe('GET');
		expect(flip('odd')).toBe('even');
	});

	it('draws two buttons, one tray and one answer, and the reader can press either button', () => {
		expect(piece.match(/class="press (get|post)"/g)).toHaveLength(2);
		expect(piece.match(/aria-label="Press (GET|POST)"/g)).toHaveLength(2);
		expect(piece.match(/class="answer"/g)).toHaveLength(1);
		expect(piece.match(/class="wash yellow"/g)).toHaveLength(2);
	});

	it('keeps the text inside the drawing to the file name, two methods and the answer', () => {
		const texts = [...piece.matchAll(/<(?:text|tspan)[^>]*>([^<]+)<\/(?:text|tspan)>/g)].map((m) => m[1]);
		expect(texts).toEqual(['{FILE_PARTS[0]}', '{FILE_PARTS[1]}', '{FILE_PARTS[2]}', 'GET', 'POST', '{ANSWER}']);
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile/i);
	});

	it('is a toy: hover lifts each button, G and P press them, arrows move between them, POST rattles the coin back', () => {
		expect(piece).toContain('.frame:has(.get-hit:hover) .get');
		expect(piece).toContain("key === 'g' || key === 'p'");
		expect(piece).toContain("key === 'arrowleft'");
		expect(piece).toContain("animation: var(--rattle)");
	});

	it('stops its tour on touch, resets on Escape, snaps under reduced motion and speaks each press', () => {
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("key === 'escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).not.toMatch(/@for|@if/);
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(vendArt.machine.ink.length).toBeGreaterThan(300);
		expect(vendArt.get.place).toMatch(/^left:[\d.]+%;top:[\d.]+%$/);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(vendArt));
	});

	it('is on the API routes page under its own heading', () => {
		expect(page).toContain("import VendingAnatomy from '../../components/figures/vending/vending-anatomy.tsrx';");
		expect(page.indexOf('## The path is the address, the name is the method')).toBeLessThan(page.indexOf('<VendingAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by vending.test.ts from vending.ts. Refresh with the figure test's -u flag.
import type { drawing } from './vending.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(vendArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./vending.art.ts');
	});
});
