import { describe, expect, it } from 'vitest';
import { relative } from './ink-logos.ts';
import { PAGER_DOODLES } from './ink-marks.ts';
import { type Doodle, doodles } from './pager-doodles.ts';

const art = doodles();

const wash = (tint: string) => `style="fill:var(--${tint});opacity:var(--doodle-wash-opacity);mix-blend-mode:var(--doodle-wash-blend)"`;

const fills = {
	yellow: wash('yellow'),
	pink: wash('pink'),
	paper: 'fill="var(--paper)"',
	hatch: 'fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".7"',
	ink: 'fill="currentColor"',
};

function symbol(name: string, { box, passes }: Doodle): string {
	const paths = passes.map((pass) => `<path ${fills[pass.kind]} d="${relative(pass.d)}"/>`).join('');
	return `<symbol id="${name}" viewBox="${box.join(' ')}" overflow="visible">${paths}</symbol>`;
}

const sprite = () => `<svg xmlns="http://www.w3.org/2000/svg">\n${Object.entries(art).map(([name, doodle]) => symbol(name, doodle)).join('\n')}\n</svg>\n`;

describe('pager doodles', () => {
	it('draws eight coffee-shop objects with ink and hatching, and at most one wash each', () => {
		expect(Object.keys(art)).toEqual(['receipt', 'mug', 'bean', 'sugar', 'spoon', 'croissant', 'cup', 'moka']);
		for (const doodle of Object.values(art)) {
			for (const kind of ['hatch', 'ink'] as const) expect(doodle.passes.some((pass) => pass.kind === kind && pass.d.length > 40)).toBe(true);
			const washes = doodle.passes.filter((pass) => pass.kind === 'yellow' || pass.kind === 'pink');
			expect(washes.length).toBeLessThanOrEqual(1);
			for (const loose of washes) expect(loose.d.match(/Z/g)).toHaveLength(1);
		}
	});

	it('draws the same art every time', () => {
		expect(JSON.stringify(doodles())).toBe(JSON.stringify(art));
	});

	it('keeps the sprite small', () => {
		expect(sprite().length).toBeLessThan(60_000);
	});

	it('freezes the doodles into one sprite the pager links into (run with -u after editing)', async () => {
		await expect(sprite()).toMatchFileSnapshot(`../../public/${PAGER_DOODLES}`);
	});
});
