import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describePanel } from './model.ts';

const page = readFileSync(new URL('../../../pages/concepts/conditionals.mdx', import.meta.url), 'utf8');
const demo = readFileSync(new URL('./panel-demo.tsrx', import.meta.url), 'utf8');

describe('the note panel demo', () => {
	it('says the field left and the note stayed', () => {
		expect(describePanel(false, 'Oat milk', 1)).toBe('The field is gone from the page. The note still holds "Oat milk".');
		expect(describePanel(true, '', 2)).toBe('The field is on the page, built 2 times. The note still holds nothing.');
	});

	it('declares the note above the @if, as the code on the page does', () => {
		for (const source of [demo, page]) {
			expect(source.indexOf("let note = state(")).toBeGreaterThan(-1);
			expect(source.indexOf("let note = state(")).toBeLessThan(source.indexOf('@if (open)'));
		}
		expect(page).toContain('<PanelDemo />');
	});
});
