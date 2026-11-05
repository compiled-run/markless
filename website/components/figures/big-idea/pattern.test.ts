import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing } from './pattern.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/the-big-idea.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./pattern-anatomy.tsrx', import.meta.url), 'utf8');

describe('the the-big-idea figure', () => {
	it('draws the same scene every time, with enough ink to read', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(sceneArt));
		expect(sceneArt.layers.length).toBeGreaterThan(8);
		expect(sceneArt.layers.map((layer) => layer.d).join('').length).toBeGreaterThan(8000);
	});

	it('has one margin note, a live region, a tour that stops on touch, and no wires', () => {
		expect(piece.match(/class="note"/g)).toHaveLength(1);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).not.toMatch(/cord|crocodile|wire/i);
	});

	it('is on The big idea page', () => {
		expect(page).toContain("from '../../components/figures/big-idea/pattern-anatomy.tsrx';");
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by pattern.test.ts from pattern.ts. Run the figure test with -u to refresh.
import type { drawing } from './pattern.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./pattern.art.ts');
	});
});
