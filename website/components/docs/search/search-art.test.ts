import { describe, expect, it } from 'vitest';
import { art, nothingSprite } from './search-art.ts';
import { NOTHING_FOUND } from './search-load.ts';

const drawn = art();

describe('search empty-state art', () => {
	it('inks every layer of the slip and the magnifier', () => {
		for (const d of [drawn.slip.paper, drawn.slip.ink, drawn.slip.shadow, drawn.slip.rules, drawn.pencil]) expect(d.length).toBeGreaterThan(20);
		for (const d of Object.values(drawn.lens)) expect(d.length).toBeGreaterThan(20);
	});

	it('draws the same every time', () => {
		expect(art()).toEqual(drawn);
	});
});

describe('frozen art', () => {
	it('matches the generator (run with -u after changing search-art.ts)', async () => {
		await expect(nothingSprite(drawn)).toMatchFileSnapshot(`../../../public/${NOTHING_FOUND}`);
	});
});
