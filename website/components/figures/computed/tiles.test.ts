import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bump, clamp, describeTiles, dial, START } from './tiles-model.ts';
import { drawing } from './tiles.ts';

const tilesArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/computed.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./tiles-anatomy.tsrx', import.meta.url), 'utf8');

describe('mugs + coasters = total', () => {
	it('dials the inputs and works the total out', () => {
		expect(START).toEqual({ mugs: 2, coasters: 3 });
		expect(bump(9)).toBe(0);
		expect(clamp(12)).toBe(9);
		expect(dial(2, 100, 64)).toBe(4);
		expect(dial(2, 100, 160)).toBe(0);
		expect(describeTiles(4, 3)).toBe('mugs is 4, coasters is 3, so total is 7.');
	});

	it('has three tiles; the two inputs take tap, drag and keys, and total only refuses', () => {
		expect(piece.match(/role="spinbutton"/g)).toHaveLength(2);
		const result = piece.slice(piece.indexOf('class="tile result"'), piece.indexOf('</g>', piece.indexOf('class="tile result"')));
		expect(result).not.toMatch(/total\s*=|mugs\s*=|coasters\s*=/);
		expect(result).toContain('shake = flip(shake)');
		expect(piece).toContain('const total = computed(() => mugs + coasters);');
		expect(piece).not.toMatch(/class="cord"|art\.wires|class="hand/);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same tiles every time', () => {
		expect(tilesArt.tiles).toHaveLength(3);
		expect(tilesArt.tiles[2]!.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(tilesArt));
	});

	it('is on the Computed page under its own heading', () => {
		expect(page).toContain("import TilesAnatomy from '../../components/figures/computed/tiles-anatomy.tsrx';");
		expect(page.indexOf('## Turn the dials')).toBeLessThan(page.indexOf('<TilesAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by tiles.test.ts from tiles.ts. Run the figure tests with -u to refresh.
import type { drawing } from './tiles.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(tilesArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./tiles.art.ts');
	});
});
