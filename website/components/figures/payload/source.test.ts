import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOURCE } from './model.ts';
import { drawing } from './source.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/payload.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./source-anatomy.tsrx', import.meta.url), 'utf8');
const response = page.slice(page.indexOf('```html title="response"'));
const text = (i: number) => SOURCE[i]!.tokens.map((token) => token.t).join('');

describe('the payload figure', () => {
	it('shows about ten lines of View Source, none wider than the column', () => {
		expect(SOURCE.length).toBeLessThanOrEqual(12);
		for (const [i] of SOURCE.entries()) expect(text(i).length).toBeLessThanOrEqual(58);
	});

	it('abridges the real response on the page, keeping its fields', () => {
		for (const fragment of ['<p>Booked: March 13</p>', '<button m:on="click:0">13</button>', '"graphNodeId": "state:day"', '"root": 13', '"hostNodeId": "h3"', '"symbolIds": ["symbol:0"]', '"hostNodeId": "h2"']) {
			expect(response).toContain(fragment);
		}
	});

	it('washes the Booked line, its value and its view entry in one colour, and each day button with its event in another', () => {
		const washOf = (w: string) => SOURCE.flatMap((line) => line.tokens.filter((token) => token.w === w).map(() => line.key));
		expect([...new Set(washOf('booked'))]).toEqual(['s2', 's6', 's10']);
		expect([...new Set(washOf('day'))]).toEqual(['s3', 's9']);
		expect(SOURCE[1]!.tokens.some((token) => token.w)).toBe(false);
	});

	it('has no JavaScript switch, labels the two blocks in the margin, and answers pointer, keys and Escape', () => {
		expect(piece).not.toMatch(/JavaScript: o(n|ff)/);
		expect(piece).toContain('the values');
		expect(piece).toContain('who does what');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('onPointerover');
		expect(piece).toContain("event.key === 'Escape'");
	});

	it('is on the payload page', () => {
		expect(page).toContain("from '../../components/figures/payload/source-anatomy.tsrx';");
	});
});

describe('frozen art', () => {
	it('freezes the source lines into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by source.test.ts from source.ts. Run the figure test with -u to refresh.
import type { drawing } from './source.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./source.art.ts');
	});
});
