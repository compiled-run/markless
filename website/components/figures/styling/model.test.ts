import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeClasses } from './model.ts';

const page = readFileSync(new URL('../../../pages/concepts/styling.mdx', import.meta.url), 'utf8');
const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('the two cards demo', () => {
	it('says nothing until the classes show, then names both', () => {
		expect(describeClasses([])).toBe('');
		expect(describeClasses(['card mk-a', 'card mk-b'])).toBe('The paper card has class card mk-a. The chalk card has class card mk-b.');
	});

	it('styles .card in two files, as the code on the page does', () => {
		for (const file of ['./paper-card.tsrx', './chalk-card.tsrx']) {
			expect(read(file)).toContain('<article class="card">');
			expect(read(file)).toContain('.card {');
		}
		expect(page).toContain('<CardsDemo />');
	});
});
