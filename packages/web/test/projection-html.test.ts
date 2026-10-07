import { expect, test } from 'vitest';
import { marklessProjectionHtml } from '../src/fns/projection-html.ts';

const text = (value: unknown) => `text(${String(value)})`;

test('the served projection in the own props cell is written as markup', () => {
	const served = '<!--markless-projection:4--><svg data-mark=""></svg>';
	expect(marklessProjectionHtml(served, { children: served }, ['children'], text)).toBe(
		'<svg data-mark=""></svg>',
	);
});

test('a routed value is text, even one that spells the projection mark', () => {
	const forged = '<!--markless-projection:4--><img src=x onerror=alert(1)>';
	expect(marklessProjectionHtml(forged, { children: 'calm' }, ['children'], text)).toBe(
		`text(${forged})`,
	);
	expect(marklessProjectionHtml('mk-3', undefined, ['children'], text)).toBe('text(mk-3)');
});
