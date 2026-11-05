import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUTTON, CALL, describePress, describeToggle, GONE, HANDLE } from './model.ts';
import { drawing } from './search-form.ts';

const formArt = drawing();

const page = readFileSync(new URL('../../../pages/build/elements.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./search-form-anatomy.tsrx', import.meta.url), 'utf8');

describe('the search form and its handle', () => {
	it('reaches the real input, or nothing once it is gone', () => {
		expect(HANDLE).toBe('field');
		expect(CALL).toBe('field.focus()');
		expect(GONE).toBe('undefined');
		expect(describePress(true)).toContain('cursor is blinking');
		expect(describePress(false)).toContain('nothing got the focus');
		expect(describeToggle(false)).toContain('undefined');
	});

	it('uses a real input bound by element(), and the button calls focus on the handle', () => {
		expect(piece).toContain('const searchInput = element<HTMLInputElement>();');
		expect(piece).toContain('el={searchInput}');
		expect(piece).toContain('if (present) searchInput?.focus();');
	});

	it('has three objects and about five words', () => {
		expect(piece).toContain('class="field-box"');
		expect(piece).toContain('class="real-button"');
		expect(piece).toContain('class="handle whole"');
		const words = [...piece.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
		expect(new Set(words)).toEqual(new Set(['{HANDLE}', '{GONE}']));
		expect(piece).toContain('<span class="cap cap-button">{CALL}</span>');
		expect(BUTTON.split(' ')).toHaveLength(2);
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile|@for|@if/i);
	});

	it('has a live region, Escape, and no motion under reduced motion', () => {
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(formArt.card.ink.length).toBeGreaterThan(300);
		expect(formArt.line.whole.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(formArt));
	});

	it('is on the Elements page under its own heading', () => {
		expect(page).toContain("import SearchFormAnatomy from '../../components/figures/search-form/search-form-anatomy.tsrx';");
		expect(page.indexOf('## Reach the real element')).toBeLessThan(page.indexOf('<SearchFormAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by search-form.test.ts from search-form.ts. Refresh with the figure test's -u flag.
import type { drawing } from './search-form.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(formArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./search-form.art.ts');
	});
});
