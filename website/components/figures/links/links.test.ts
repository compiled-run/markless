import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ABOUT, addressOf, clamp, CLIP_SAID, describeSwap, flip, HOME, other } from './model.ts';
import { drawing } from './clipboard.ts';

const boardArt = drawing();

const page = readFileSync(new URL('../../../pages/router/links.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./link-anatomy.tsrx', import.meta.url), 'utf8');

describe('the clipboard', () => {
	it('swaps the sheet and re-inks the address, and the clip snaps back', () => {
		expect(other('home')).toBe('about');
		expect(addressOf('about')).toBe(ABOUT);
		expect(addressOf('home')).toBe(HOME);
		expect(describeSwap('about', true)).toBe('New sheet. The board and clip stayed, and the address label now reads /about.');
		expect(describeSwap('home', false)).toBe('');
		expect(CLIP_SAID).toContain('snapped back');
		expect(clamp(40, 0, 16)).toBe(16);
		expect(flip('odd')).toBe('even');
	});

	it('has three objects and only code values for words', () => {
		expect(piece.match(/class="sheet (home|about)"/g)).toHaveLength(2);
		expect(piece).toContain('class="board"');
		expect(piece).toContain('class="clip"');
		const words = [...piece.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
		expect(words).toEqual(['Shop', 'About', '{HOME}', '{ABOUT}']);
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile|@for|@if/i);
	});

	it('plays: hover, drag, keys, and the clip that will not come off', () => {
		expect(piece).toContain('.sheet-grip:hover .lift');
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'ArrowLeft'");
		expect(piece).toContain('snapBack()');
		expect(piece.match(/tabindex="0"/g)).toHaveLength(2);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(boardArt.board.ink.length).toBeGreaterThan(300);
		expect(boardArt.clip.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(boardArt));
	});

	it('is on the Links page under its own heading', () => {
		expect(page).toContain("import LinkAnatomy from '../../components/figures/links/link-anatomy.tsrx';");
		expect(page.indexOf('## A click swaps in only the page')).toBeLessThan(page.indexOf('<LinkAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by links.test.ts from clipboard.ts. Refresh with the figure test's -u flag.
import type { drawing } from './clipboard.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(boardArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./clipboard.art.ts');
	});
});
