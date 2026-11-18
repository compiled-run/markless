import { expect, test } from 'vitest';
import { marklessAttributeName } from '../src/fns/attribute-name.ts';

test('a camelCase spelling of a real attribute name reads as that name', () => {
	expect(marklessAttributeName('strokeWidth')).toBe('stroke-width');
	expect(marklessAttributeName('fillOpacity')).toBe('fill-opacity');
	expect(marklessAttributeName('tabIndex')).toBe('tabindex');
	expect(marklessAttributeName('readOnly')).toBe('readonly');
	expect(marklessAttributeName('acceptCharset')).toBe('accept-charset');
	expect(marklessAttributeName('httpEquiv')).toBe('http-equiv');
	expect(marklessAttributeName('xlinkHref')).toBe('xlink:href');
	expect(marklessAttributeName('xmlnsXlink')).toBe('xmlns:xlink');
	expect(marklessAttributeName('panose1')).toBe('panose-1');
});

test('real names, camelCase real names and renamed words are left as written', () => {
	for (const name of [
		'stroke-width',
		'tabindex',
		'viewBox',
		'preserveAspectRatio',
		'className',
		'htmlFor',
		'data-fooBar',
		'strokeWidht',
	])
		expect(marklessAttributeName(name)).toBe(name);
});
