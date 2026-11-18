import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing } from './explorer.ts';
import { connector, LINE_SLOTS, slipRows } from './model.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/compiler.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./explorer-anatomy.tsrx', import.meta.url), 'utf8');

describe('the compiler figure', () => {
	it('draws the same arrow every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(sceneArt));
		expect(sceneArt.layers.length).toBeGreaterThan(0);
	});

	it('joins each source row to its slip, and keeps slips on the sheet without overlapping', () => {
		for (const count of [1, 3, 4]) {
			const spans = Array.from({ length: count }, (_, i) => slipRows(i, count));
			for (const [i, at] of spans.entries()) {
				expect(at.top + at.height).toBeLessThanOrEqual(LINE_SLOTS);
				if (i > 0) expect(at.top).toBeGreaterThan(spans[i - 1]!.top + spans[i - 1]!.height);
			}
		}
		expect(connector(3, 0, 3)).toMatch(/^M1 35\.0C/);
	});

	it('loads the compiler only when the reader starts editing, and answers hover, keys and Escape', () => {
		expect(piece).toContain("await import('./explore.ts')");
		expect(piece).not.toMatch(/from '\.\/explore\.ts'/);
		expect(piece).toContain('onPointerover');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).not.toMatch(/bags|counter/i);
		expect(piece).toContain('class="link"');
		expect(piece).toContain('class="wash"');
	});

	it('is on the compiler page', () => {
		expect(page).toContain("from '../../components/figures/compiler/explorer-anatomy.tsrx';");
	});
});

describe('frozen art', () => {
	it('freezes the frames (run with -u after editing)', async () => {
		await expect(`// Written by explorer.test.ts from explorer.ts. Run the figure test with -u to refresh.
import type { drawing } from './explorer.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`).toMatchFileSnapshot('./explorer.art.ts');
	});
});
