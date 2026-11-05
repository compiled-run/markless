import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing } from './bench.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/compiler.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./bench-anatomy.tsrx', import.meta.url), 'utf8');

describe('the compiler figure', () => {
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
		expect(piece).not.toMatch(/\b(cord|crocodile|wire)s?\b/i);
	});

	it('is on the compiler page', () => {
		expect(page).toContain("from '../../components/figures/compiler/bench-anatomy.tsrx';");
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by bench.test.ts from bench.ts. Run the figure test with -u to refresh.
import type { drawing } from './bench.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./bench.art.ts');
	});
});
