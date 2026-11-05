import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeTry, flip, GOOD, TYPO } from './model.ts';
import { drawing } from './key.ts';

const keyArt = drawing();

const page = readFileSync(new URL('../../../pages/router/links.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./route-key.tsrx', import.meta.url), 'utf8');

describe('the door and its keys', () => {
	it('opens for the key of a route that exists, and refuses the typo', () => {
		expect(GOOD).toBe('/blog/[slug]');
		expect(TYPO).toBe('/blgo/[slug]');
		expect(describeTry('good')).toContain('the door opened');
		expect(describeTry('typo')).toContain('the build stops');
		expect(describeTry('none')).toBe('');
		expect(flip('odd')).toBe('even');
	});

	it('has three objects and only code values for words', () => {
		expect(piece.match(/class="key (good|typo)"/g)).toHaveLength(2);
		expect(piece).toContain('class="door"');
		const words = [...piece.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
		expect(words).toEqual(['{GOOD}', '{TYPO}']);
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile|@for|@if/i);
	});

	it('plays: hover, drag, keys, and a key that will not go in', () => {
		expect(piece).toContain('.key:hover .lift');
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'Enter'");
		expect(piece).toContain('@keyframes balk-a');
		expect(piece.match(/tabindex="0"/g)).toHaveLength(2);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(keyArt.door.closed.ink.length).toBeGreaterThan(300);
		expect(keyArt.good.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(keyArt));
	});

	it('is on the Links page under its own heading', () => {
		expect(page).toContain("import RouteKey from '../../components/figures/route-key/route-key.tsrx';");
		expect(page.indexOf('## The build checks every pattern')).toBeLessThan(page.indexOf('<RouteKey />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by route-key.test.ts from key.ts. Refresh with the figure test's -u flag.
import type { drawing } from './key.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(keyArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./key.art.ts');
	});
});
