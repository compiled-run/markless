import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeBasket, totalOf } from './model.ts';

const page = readFileSync(new URL('../../../pages/concepts/computed.mdx', import.meta.url), 'utf8');
const demo = readFileSync(new URL('./basket-demo.tsrx', import.meta.url), 'utf8');

describe('the basket demo', () => {
	it('works the total out from both counts and says so', () => {
		expect(totalOf(2, 1)).toBe(27);
		expect(describeBasket(2, 1, 2)).toBe('2 mugs and 1 coaster. The total is now $27. The recipe has run 2 times.');
	});

	it('uses the same recipe and prices as the code on the page, and no handler writes total', () => {
		expect(page).toContain('() => mugs * 12 + coasters * 3');
		expect(demo).toContain('computed(() => mugs * MUG + coasters * COASTER)');
		expect(demo.match(/\btotal\s*=[^=]/g)).toEqual(['total = ']);
		expect(page).toContain('<BasketDemo />');
	});
});
