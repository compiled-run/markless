import { expect, test } from 'vitest';
import { marklessAttributeHtml } from '../src/fns/attribute-html.ts';

test('a rebuilt arm writes an attribute by the shared presence rule, escaped for quotes', () => {
	expect(marklessAttributeHtml('title', 'say "hi" & <go>')).toBe(
		' title="say &quot;hi&quot; &amp; &lt;go&gt;"',
	);
	expect(marklessAttributeHtml('value', '')).toBe(' value=""');
	expect(marklessAttributeHtml('disabled', true)).toBe(' disabled=""');
	expect(marklessAttributeHtml('aria-busy', true)).toBe(' aria-busy="true"');
	for (const absent of [null, undefined, false])
		expect(marklessAttributeHtml('hidden', absent)).toBe('');
});

test('an attribute whose name and quotes are already written gets its value alone', () => {
	expect(marklessAttributeHtml('href', '/a"b', true)).toBe('/a&quot;b');
	expect(marklessAttributeHtml('href', null, true)).toBe('');
});
