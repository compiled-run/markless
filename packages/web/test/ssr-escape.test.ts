import { expect, test } from 'vitest';
import { marklessSsrEscape as escapeHtml } from '../src/fns/html.ts';

const fourPasses = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

test('text with nothing to escape comes back as the same string', () => {
	const value = 'plain words, numbers 123 and unicode é';
	expect(escapeHtml(value)).toBe(value);
	expect(escapeHtml('')).toBe('');
});

test('escapes the four markup characters wherever they sit', () => {
	for (const value of [
		'&',
		'<a href="x">Tom & Jerry</a>',
		'ends with <',
		'"quoted" start',
		'&amp; is escaped again',
		"a'b stays",
		'<<>>&&""',
		'</style><script data-markless-probe>&',
	])
		expect(escapeHtml(value)).toBe(fourPasses(value));
});

test('matches the four-pass escape on generated strings', () => {
	const alphabet = ['a', ' ', '&', '<', '>', '"', "'", 'é', '\n'];
	let seed = 7;
	for (let run = 0; run < 500; run++) {
		let value = '';
		for (let at = 0; at < run % 40; at++) {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			value += alphabet[seed % alphabet.length];
		}
		expect(escapeHtml(value)).toBe(fourPasses(value));
	}
});
