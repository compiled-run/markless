import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing } from './survey.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/index.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./survey-anatomy.tsrx', import.meta.url), 'utf8');

describe('the index figure', () => {
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

	it('is on the How it works index', () => {
		expect(page).toContain("from '../../components/figures/how-index/survey-anatomy.tsrx';");
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by survey.test.ts from survey.ts. Run the figure test with -u to refresh.
import type { drawing } from './survey.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./survey.art.ts');
	});
});
