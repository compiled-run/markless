import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeVend, flip, GET_FILE, GET_FN, getAnswer, keyed, MISS_STATUS, pathOf, POST_FILE, resolve } from './model.ts';
import { drawing } from './vending.ts';

const vendArt = drawing();

const page = readFileSync(new URL('../../../pages/router/api-routes.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./vending-anatomy.tsrx', import.meta.url), 'utf8');

describe('the vending machine', () => {
	it('lets only the file that matches the method and path answer', () => {
		expect(resolve('GET', '42')).toBe('get');
		expect(resolve('POST', '')).toBe('post');
		expect(resolve('POST', '42')).toBe('miss');
		expect(resolve('GET', '')).toBe('miss');
		expect(pathOf('42')).toBe('/api/users/42');
		expect(pathOf('')).toBe('/api/users');
		expect(getAnswer('42')).toBe('{"id":"42"}');
	});

	it('answers a POST with no matching file the way the router does: 404, not 405', () => {
		expect(MISS_STATUS).toBe('404');
		expect(describeVend('POST', '42', 'miss')).toContain('no file answers that');
		expect(describeVend('GET', '42', 'get')).toContain(GET_FILE);
		expect(describeVend('POST', '', 'post')).toContain(POST_FILE);
	});

	it('types the id on a real keypad', () => {
		expect(keyed('4', '2')).toBe('42');
		expect(keyed('42', 'Backspace')).toBe('4');
		expect(keyed('42', 'C')).toBe('');
		expect(keyed('1234', '5')).toBe('1234');
		expect(keyed('42', 'x')).toBe('42');
		expect(flip('odd')).toBe('even');
	});

	it('labels each button with its file and shows the default export on hover', () => {
		expect(piece).toContain('{GET_ROUTE}');
		expect(piece).toContain('{GET_FILE}');
		expect(piece).toContain('{POST_FILE}');
		expect(GET_FN).toMatch(/^export default function /);
		expect(piece).toContain('.scene:has(.file.get:hover, .file.get:focus-visible) .cap-get');
		expect(piece).not.toContain('slip');
		expect(piece.match(/class="key"/g)).toHaveLength(12);
	});

	it('moves only in answer to an action: no tour, no @if or @for, keys cancel only what they handle', () => {
		expect(piece).not.toContain('setInterval');
		expect(piece).not.toMatch(/@for|@if|cord|wire|parcel|pulse|crocodile/i);
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(vendArt.cabinet.ink.length).toBeGreaterThan(300);
		expect(vendArt.panel.keys).toHaveLength(12);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(vendArt));
	});

	it('is on the API routes page under its own heading', () => {
		expect(page).toContain("import VendingAnatomy from '../../components/figures/vending/vending-anatomy.tsrx';");
		expect(page.indexOf('## The file name picks the method')).toBeLessThan(page.indexOf('<VendingAnatomy />'));
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
