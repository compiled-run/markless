import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing } from './inspector.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/state-graph.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./graph-anatomy.tsrx', import.meta.url), 'utf8');

describe('the state-graph figure', () => {
	it('draws the same scene every time, with enough ink to read', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(sceneArt));
		const objects = (sceneArt as { objects?: Record<string, { layers: { d: string }[] }> }).objects ?? {};
		const all = [...sceneArt.layers, ...Object.values(objects).flatMap((o) => o.layers)];
		expect(all.length).toBeGreaterThan(8);
		expect(all.map((layer) => layer.d).join('').length).toBeGreaterThan(8000);
		expect(Object.keys(objects).length).toBeLessThanOrEqual(3);
	});

	it('has one margin note, a live region, a tour that stops on touch, and no wires', () => {
		expect(piece.match(/class="note"/g)).toHaveLength(1);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).not.toMatch(/bags|counter/i);
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).not.toMatch(/\b(cord|crocodile|wire)s?\b/i);
	});

	it('answers the pointer: every object lifts on hover', () => {
		expect(piece).toContain('onPointerover');
		expect(piece).toContain("data-hover=");
	});

	it('is on the State graph page', () => {
		expect(page).toContain("from '../../components/figures/state-graph/graph-anatomy.tsrx';");
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by inspector.test.ts from inspector.ts. Run the figure test with -u to refresh.
import type { drawing } from './inspector.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./inspector.art.ts');
	});
});
