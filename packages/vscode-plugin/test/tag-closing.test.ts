import { describe, expect, test } from 'vitest';
import { getTagClosingInsertion } from '../src/tag-closing.ts';

function afterTyping(before: string, changeText: string, after = '') {
	const changeOffset = before.length;
	return {
		documentText: `${before}${changeText}${after}`,
		changeOffset,
		changeText,
	};
}

describe('closing insertion after an opening tag', () => {
	test.each([
		['an HTML tag', '<div', '>', '</div>'],
		['a component', '<Card', '>', '</Card>'],
		['a dotted component', '<Layout.Header', '>', '</Layout.Header>'],
		['a namespaced tag', '<svg:path', '>', '</svg:path>'],
		['a dollar-prefixed component', '<$Dynamic', '>', '</$Dynamic>'],
		['a tag with attributes', '<section class="hero"', '>', '</section>'],
		['a fragment', '<', '>', '</>'],
	])('closes %s', (_label, before, changeText, insert) => {
		const input = afterTyping(before, changeText);
		expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toEqual({
			insert,
			at: input.changeOffset + input.changeText.length,
		});
	});

	test('closes a tag nested in an @if block', () => {
		const input = afterTyping('export function View() @{\n@if (ready) {\n  <div', '>');
		expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toEqual({
			insert: '</div>',
			at: input.changeOffset + 1,
		});
	});

	test('closes a child tag inside another element', () => {
		const input = afterTyping('<main>\n  <Widget', '>', '\n</main>');
		expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toEqual({
			insert: '</Widget>',
			at: input.changeOffset + 1,
		});
	});

	test.each([
		['an explicit self-closing tag', '<Widget /', '>'],
		['a compact self-closing tag', '<Widget/', '>'],
		['an HTML void element', '<input', '>'],
		['a closing tag', '</div', '>'],
		['an @for head', '<ul>\n@for (const x of items) ', '>'],
		['an arrow function', '<section>\nconst render = () =', '>'],
		['a quoted string', 'const text = "<div', '>";'],
		['a template literal', 'const text = `<div', '>`;'],
		['a line comment', '// <div', '>\n'],
		['a block comment', '/* <div', '> */'],
	])('does not close %s', (_label, before, changeText) => {
		const input = afterTyping(before, changeText);
		expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toBeUndefined();
	});

	test('does not duplicate the correct closing tag already following the cursor', () => {
		const input = afterTyping('<div', '>', '</div>');
		expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toBeUndefined();
	});
});

describe('matching completion after typing </', () => {
	test('completes the nearest unclosed open tag', () => {
		const input = afterTyping('<main><section><span></span>', '</');
		expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toEqual({
			insert: 'section>',
			at: input.changeOffset + 2,
		});
	});

	test('handles the slash arriving after an existing less-than character', () => {
		const input = afterTyping('<main><Card.Item><', '/');
		expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toEqual({
			insert: 'Card.Item>',
			at: input.changeOffset + 1,
		});
	});

	test('completes a fragment', () => {
		const input = afterTyping('<><div></div>', '</');
		expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toEqual({
			insert: '>',
			at: input.changeOffset + 2,
		});
	});

	test('ignores balanced markup and non-markup contexts', () => {
		for (const before of ['<div></div>', 'const text = "<div>";', '// <div>']) {
			const input = afterTyping(before, '</');
			expect(getTagClosingInsertion(input.documentText, input.changeOffset, input.changeText)).toBeUndefined();
		}
	});
});
