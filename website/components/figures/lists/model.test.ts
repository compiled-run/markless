import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeOrder, movedBy, reverse, sortByName, START } from './model.ts';

const page = readFileSync(new URL('../../../pages/concepts/lists.mdx', import.meta.url), 'utf8');
const demo = readFileSync(new URL('./list-demo.tsrx', import.meta.url), 'utf8');

describe('the shopping list demo', () => {
	it('counts the rows a reorder moves and names the new order', () => {
		const sorted = sortByName(START);
		expect(sorted.map((item) => item.name)).toEqual(['Coffee', 'Milk', 'Pears']);
		expect(movedBy(START, sorted)).toBe(3);
		expect(movedBy(START, reverse(START))).toBe(2);
		expect(describeOrder([{ ...START[0]!, done: true }])).toBe('The list now reads Pears, ticked. No row was built again.');
	});

	it('keys its rows by id, as the code on the page does', () => {
		expect(demo).toContain('@for (const item of items; key item.id)');
		expect(page).toContain('@for (const item of items; key item.id)');
		expect(page).toContain('<ListDemo />');
	});
});
