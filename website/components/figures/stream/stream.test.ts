import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { angleOf, ARRIVED, clamp01, describeReload, flip, PATH, SAME, TITLE, waitOf } from './model.ts';
import { drawing } from './stream.ts';

const streamArt = drawing();

const page = readFileSync(new URL('../../../pages/router/data.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./stream-anatomy.tsrx', import.meta.url), 'utf8');

describe('one response, slow part last', () => {
	it('waits longer only for a slower database', () => {
		expect(waitOf(0)).toBe(700);
		expect(waitOf(1)).toBe(4000);
		expect(waitOf(2)).toBe(4000);
		expect(angleOf(0)).toBe(-135);
		expect(angleOf(1)).toBe(135);
		expect(clamp01(-1)).toBe(0);
		expect(describeReload(1500)).toContain('Reviews waited 1.5 seconds, in the same response');
		expect(ARRIVED).toContain('one request');
		expect(SAME).toContain('nothing new is fetched');
		expect(TITLE).toBe('Lemon cake');
		expect(PATH).toBe('/recipes/lemon');
		expect(flip('odd')).toBe('even');
	});

	it('draws one request row and a pending skeleton, with few words', () => {
		expect(piece.match(/class="bar"/g)).toHaveLength(1);
		expect(piece).toContain('class="skeleton"');
		expect(piece).toContain('@pending');
		const words = [...piece.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
		expect(words).toEqual(['{PATH}', '{TITLE}', '{REVIEWS}', '@pending: still on its way', '@try: arrived', 'Network', 'lemon']);
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile|@for |@if /i);
	});

	it('plays: reload, the dial by drag and keys, and Reviews that fetches nothing new', () => {
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'ArrowUp'");
		expect(piece).toContain('said = SAME;');
		expect(piece.match(/tabindex="0"/g)).toHaveLength(3);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(streamArt.browser.ink.length).toBeGreaterThan(300);
		expect(streamArt.db.ink.length).toBeGreaterThan(300);
		expect(streamArt.reviews.skeletonHatch.length).toBeGreaterThan(100);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(streamArt));
	});

	it('is on the Page data page under its own heading', () => {
		expect(page).toContain("import StreamAnatomy from '../../components/figures/stream/stream-anatomy.tsrx';");
		expect(page.indexOf('## The slow part arrives in the same response')).toBeLessThan(page.indexOf('<StreamAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by stream.test.ts from stream.ts. Refresh with the figure test's -u flag.
import type { drawing } from './stream.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(streamArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./stream.art.ts');
	});
});
