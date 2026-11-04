import { expect, test } from 'vitest';
import { describe as say, presses, START_BAGS, totalFor } from './model.ts';

test('the total follows the bags at the page price', () => {
	expect(totalFor(START_BAGS)).toBe(28);
	expect(totalFor(3)).toBe(42);
});

test('the spoken line names both changed lines and the still one', () => {
	expect(say(3)).toBe('Added a bag. In your cart now shows 3 bags and the total shows $42. The product line did not change.');
	expect(presses(1)).toBe('once');
	expect(presses(4)).toBe('4 times');
});
