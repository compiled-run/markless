import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clamp, describeMix, dial, mixOf, START } from './mixer-model.ts';
import { drawing } from './mixer.ts';

const mixerArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/computed.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./mixer-anatomy.tsrx', import.meta.url), 'utf8');

describe('red and blue mix to a swatch', () => {
	it('dials the paints and mixes the swatch from both', () => {
		expect(START).toEqual({ red: 6, blue: 4 });
		expect(clamp(14)).toBe(10);
		expect(dial(4, 100, 72)).toBe(6);
		expect(mixOf(5, 5)).toContain(' 50%,');
		expect(mixOf(0, 0)).toBe('white');
		expect(describeMix(3, 7)).toBe('red is 3, blue is 7, so mix is a blue-leaning purple.');
	});

	it('mixes only through computed; pressing the swatch never sets it', () => {
		expect(piece).toContain('const mix = computed(() => mixOf(red, blue));');
		const swatch = piece.slice(piece.indexOf('class="swatch"'), piece.indexOf('</g>', piece.indexOf('class="swatch"')));
		expect(swatch).not.toMatch(/\bmix\s*=|red\s*=|blue\s*=/);
		expect(swatch).toContain('skid = flip(skid)');
		expect(piece.match(/role="slider"/g)).toHaveLength(2);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same palette every time', () => {
		expect(mixerArt.dabs).toHaveLength(2);
		expect(mixerArt.palette.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(mixerArt));
	});

	it('is on the Computed page under its own heading', () => {
		expect(page).toContain("import MixerAnatomy from '../../components/figures/computed/mixer-anatomy.tsrx';");
		expect(page.indexOf('## Mix the paint')).toBeLessThan(page.indexOf('<MixerAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by mixer.test.ts from mixer.ts. Run the figure tests with -u to refresh.
import type { drawing } from './mixer.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(mixerArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./mixer.art.ts');
	});
});
