import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeCookie, describeReload, flip, PLAIN, PLAIN_CAPTION, reloaded, SAVED, SAVED_CAPTION, SITE, START } from './model.ts';
import { drawing } from './browser.ts';

const browserArt = drawing();

const page = readFileSync(new URL('../../../pages/build/storage.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./reload-anatomy.tsrx', import.meta.url), 'utf8');

describe('the reload', () => {
	it('keeps the storage() switch, closes the state() sidebar, and forgets the switch once the cookie is gone', () => {
		expect(reloaded({ dark: true, open: true, cookie: true })).toEqual({ dark: true, open: false, cookie: true });
		expect(reloaded({ dark: true, open: true, cookie: false })).toEqual({ dark: false, open: false, cookie: false });
		expect(reloaded(START)).toEqual(START);
		expect(describeReload({ dark: true, open: true, cookie: true }, { dark: true, open: false, cookie: true })).toBe(
			'Reloaded. Dark mode stayed on: storage() kept it in a cookie. The sidebar closed again: it was state().',
		);
		expect(describeReload({ dark: true, open: false, cookie: false }, { dark: false, open: false, cookie: false })).toContain('site data cleared');
		expect(describeCookie(false)).toContain('Site data cleared');
		expect(flip('odd')).toBe('even');
	});

	it('names only the site, and captions each control below the window, never on it', () => {
		expect([SITE, SAVED, PLAIN]).toEqual(['notes.app', 'storage()', 'state()']);
		expect([SAVED_CAPTION, PLAIN_CAPTION]).toEqual(['switch: storage()', 'sidebar: state()']);
		const words = [...piece.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
		expect(words).toEqual(['{SITE}', '{SAVED_CAPTION}', '{PLAIN_CAPTION}']);
		expect(browserArt.caption.y).toBeGreaterThan(380);
	});

	it('is a toy: four focusable controls, a drag, keys, a live region and no counter', () => {
		expect(piece.match(/tabindex="0"/g)).toHaveLength(4);
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'Delete'");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('.scene:has(.switch:hover, .switch:focus-visible) .caption.saved');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).not.toMatch(/count|cord|wire|parcel|@for|@if/i);
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(browserArt.window.ink.length).toBeGreaterThan(300);
		expect(browserArt.switch.trackInk.length).toBeGreaterThan(100);
		expect(browserArt.cookie.ink.length).toBeGreaterThan(100);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(browserArt));
	});

	it('is on the Storage page under its own heading', () => {
		expect(page).toContain("import ReloadAnatomy from '../../components/figures/reload/reload-anatomy.tsrx';");
		expect(page.indexOf('## A reload keeps storage(), not state()')).toBeLessThan(page.indexOf('<ReloadAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by reload.test.ts from browser.ts. Refresh with the figure test's -u flag.
import type { drawing } from './browser.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(browserArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./browser.art.ts');
	});
});
