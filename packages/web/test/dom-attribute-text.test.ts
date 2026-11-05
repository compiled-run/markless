import { expect, test } from 'vitest';
import { marklessAttributeValue as attributeText } from '../src/dom-attribute.ts';
import { marklessCsrSpreadAttributes, marklessSsrSpreadAttributes } from '../src/fns/html.ts';

test('draggable, contenteditable and spellcheck spell a boolean as the word', () => {
	for (const name of ['draggable', 'contenteditable', 'spellcheck']) {
		expect(attributeText(name, true)).toBe('true');
		expect(attributeText(name, false)).toBe('false');
		expect(attributeText(name, null)).toBeNull();
		expect(attributeText(name, 'plaintext-only')).toBe('plaintext-only');
	}
});

test('a boolean attribute is bare when true and absent when false; aria- and data- names spell true', () => {
	expect(attributeText('disabled', true)).toBe('');
	expect(attributeText('disabled', false)).toBeNull();
	expect(attributeText('aria-pressed', true)).toBe('true');
	expect(attributeText('data-on', true)).toBe('true');
	expect(attributeText('title', 0)).toBe('0');
});

test('ARIA states whose value set has "false" write it; aria-hidden and other aria- names stay absent', () => {
	for (const name of [
		'aria-pressed',
		'aria-expanded',
		'aria-checked',
		'aria-selected',
		'aria-busy',
		'aria-current',
		'aria-disabled',
		'aria-invalid',
		'aria-haspopup',
	])
		expect(attributeText(name, false)).toBe('false');
	expect(attributeText('aria-hidden', false)).toBeNull();
	expect(attributeText('aria-label', false)).toBeNull();
	expect(attributeText('data-on', false)).toBeNull();
	expect(attributeText('aria-pressed', undefined)).toBeNull();
});

test('spread attributes follow the same rule as a single attribute', () => {
	const values = {
		'aria-pressed': false,
		'aria-expanded': true,
		draggable: false,
		hidden: true,
		title: false,
	};
	const expected = ' aria-pressed="false" aria-expanded="true" draggable="false" hidden=""';
	expect(marklessSsrSpreadAttributes(values)).toBe(expected);
	expect(marklessCsrSpreadAttributes(values)).toBe(expected);
	expect(marklessSsrSpreadAttributes({ class: true }, 'mk-1')).toBe(' class=" mk-1"');
});
