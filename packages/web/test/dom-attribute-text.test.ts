import { expect, test } from 'vitest';
import { marklessAttributeValue as attributeText } from '../src/dom-attribute.ts';

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
	expect(attributeText('aria-pressed', false)).toBeNull();
	expect(attributeText('title', 0)).toBe('0');
});
