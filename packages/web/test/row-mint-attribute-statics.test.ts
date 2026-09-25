import { expect, test } from 'vitest';
import { mintRowNodes } from '../src/fns/row-mint.ts';
import type { ResumeDomElement, ResumeKeyedRepeatRecord } from '../src/resume-types.ts';

// The row html already carries an always-present attribute's name and any scope
// class beside its slot; the mint writes the value into that, as the server did.
function mintAttribute(served: string | null, value: unknown): string | null {
	const attributes = new Map<string, string>();
	const row = {
		nodeType: 1,
		childNodes: [],
		getAttribute: (name: string) => attributes.get(name) ?? null,
		setAttribute: (name: string, text: string) => void attributes.set(name, text),
		removeAttribute: (name: string) => void attributes.delete(name),
	};
	const document = {
		createElement: () => ({
			set innerHTML(_html: string) {
				attributes.clear();
				if (served !== null) attributes.set('class', served);
			},
			get content() {
				return { childNodes: [row] };
			},
		}),
		createTextNode: (data: string) => ({ nodeType: 3, data }),
	};
	const repeat = {
		id: 'repeat:0',
		rowTemplate: {
			html: '<li></li>',
			attributeSlots: [{ path: [0], name: 'class', itemPath: ['tone'] }],
		},
	} as unknown as ResumeKeyedRepeatRecord;
	mintRowNodes({ ownerDocument: document } as unknown as ResumeDomElement, repeat, {
		tone: value,
	});
	return attributes.get('class') ?? null;
}

test('an attribute the html does not carry follows the presence rule', () => {
	expect(mintAttribute(null, 'on')).toBe('on');
	expect(mintAttribute(null, null)).toBe(null);
});

test('an always-present attribute keeps its name when the value is absent', () => {
	expect(mintAttribute('', 'on')).toBe('on');
	expect(mintAttribute('', null)).toBe('');
});

test('a scoped class keeps its scope class after the value', () => {
	expect(mintAttribute(' mk-a1', 'on')).toBe('on mk-a1');
	expect(mintAttribute(' mk-a1', undefined)).toBe(' mk-a1');
});

test('a spread class keeps its scope class before the value', () => {
	expect(mintAttribute('mk-a1 ', 'on')).toBe('mk-a1 on');
	expect(mintAttribute('mk-a1 ', false)).toBe('mk-a1 ');
});
