import { readFileSync } from 'node:fs';
import { describe as group, expect, it } from 'vitest';
import { ABOUT_URL, describe, postUrl, typeSlug, viewOf } from './model.ts';
import { drawing } from './routes.ts';

const routesArt = drawing();

const page = readFileSync(new URL('../../../pages/router/pages.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./routes-anatomy.tsrx', import.meta.url), 'utf8');

group('a file in pages/ is an address', () => {
	it('shows a page only while its file is in pages/', () => {
		expect(viewOf('/', 'out', 'out')).toBe('home');
		expect(viewOf(ABOUT_URL, 'in', 'out')).toBe('about');
		expect(viewOf(ABOUT_URL, 'out', 'out')).toBe('missing');
		expect(viewOf(postUrl('hello'), 'out', 'in')).toBe('post');
		expect(viewOf(postUrl('hello'), 'out', 'out')).toBe('missing');
		expect(viewOf('/blog/', 'out', 'in')).toBe('missing');
	});

	it('types a slug into the address, one URL segment at a time', () => {
		expect(typeSlug('hell', 'o')).toBe('hello');
		expect(typeSlug('hello', 'Backspace')).toBe('hell');
		expect(typeSlug('hello', '/')).toBe('hello');
		expect(postUrl('tea')).toBe('/blog/tea');
		expect(describe('/about', 'missing')).toContain('404');
	});

	it('draws three objects and only code names and page words', () => {
		const words = [...piece.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
		expect(words).toEqual(['pages/', 'index.tsrx', 'blog/', '{url}', 'Home', 'About', '{slug}', '404', 'about.tsrx', '[slug].tsrx', '{slug}']);
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile|@for|@if/i);
	});

	it('plays: drag, press, keys, hover, and typing in the address bar', () => {
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain('.about-file:hover');
		expect(piece).toContain('class="hint"');
		expect(piece).toContain("event.key === 'Backspace'");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece.match(/tabindex="0"/g)).toHaveLength(3);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(routesArt.editor.ink.length).toBeGreaterThan(300);
		expect(routesArt.browser.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(routesArt));
	});

	it('is on the Pages page under its own heading', () => {
		expect(page).toContain("import RoutesAnatomy from '../../components/figures/routes/routes-anatomy.tsrx';");
		expect(page.indexOf("## A file's path is its address")).toBeLessThan(page.indexOf('<RoutesAnatomy />'));
	});
});

group('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by routes.test.ts from routes.ts. Refresh with the figure test's -u flag.
import type { drawing } from './routes.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(routesArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./routes.art.ts');
	});
});
