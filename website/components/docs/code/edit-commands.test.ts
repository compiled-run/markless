import { describe, expect, it } from 'vitest';
import {
	applyEdit,
	backspaceText,
	closingPairText,
	enterText,
	indentText,
	outdentText,
	type EditAction,
	type EditState,
} from './edit-commands.ts';
import { editorText, offsetOf } from './editor.ts';

/** `|` marks the caret; `[` and `]` mark a selection. */
function at(marked: string): EditState {
	const caret = marked.indexOf('|');
	if (caret >= 0)
		return { value: marked.replace('|', ''), selectionStart: caret, selectionEnd: caret };
	const start = marked.indexOf('[');
	const end = marked.indexOf(']') - 1;
	return {
		value: marked.replace('[', '').replace(']', ''),
		selectionStart: start,
		selectionEnd: end,
	};
}

function show(state: EditState): string {
	const { value, selectionStart: start, selectionEnd: end } = state;
	if (start === end) return `${value.slice(0, start)}|${value.slice(start)}`;
	return `${value.slice(0, start)}[${value.slice(start, end)}]${value.slice(end)}`;
}

const run = (marked: string, command: (state: EditState) => EditAction) =>
	show(applyEdit(at(marked), command(at(marked))));

describe('Tab and Shift+Tab', () => {
	it('inserts one tab at the caret', () => {
		expect(run('let a|', indentText)).toBe('let a\t|');
	});

	it('indents every line a selection touches, a whole-line selection taking in the new indent', () => {
		expect(run('[one\ntwo]\nthree', indentText)).toBe('[\tone\n\ttwo]\nthree');
		expect(run('o[ne\ntw]o', indentText)).toBe('\to[ne\n\ttw]o');
	});

	it('leaves a blank line in the block unindented', () => {
		expect(run('[a\n\nb]', indentText)).toBe('[\ta\n\n\tb]');
	});

	it('outdents one level from the caret line or the selected lines', () => {
		expect(run('\t\tdeep|', outdentText)).toBe('\tdeep|');
		expect(run('\t[a\n\t\tb]', outdentText)).toBe('[a\n\tb]');
	});

	it('does nothing when there is no indent to remove', () => {
		expect(outdentText(at('flat|'))).toEqual({});
	});

	it('works in spaces when configured', () => {
		const spaces = { tabSize: 4, insertSpaces: true };
		expect(run('ab|', (state) => indentText(state, spaces))).toBe('ab  |');
		expect(run('      x|', (state) => outdentText(state, spaces))).toBe('    x|');
	});
});

describe('Enter', () => {
	it('keeps the indent of the line', () => {
		expect(run('\tlet a = 1;|', enterText)).toBe('\tlet a = 1;\n\t|');
	});

	it('goes one deeper after an opening bracket', () => {
		expect(run('\tif (a) {|\n', enterText)).toBe('\tif (a) {\n\t\t|\n');
	});

	it('splits an empty pair onto its own lines with the caret between', () => {
		expect(run('\tf() @{|}', enterText)).toBe('\tf() @{\n\t\t|\n\t}');
	});

	it('leaves Enter to the browser at a line start or over a selection', () => {
		expect(enterText(at('a\n|b'))).toEqual({});
		expect(enterText(at('[ab]'))).toEqual({});
	});
});

describe('Backspace', () => {
	it('selects back to the previous tab stop in leading spaces', () => {
		const spaces = { tabSize: 2, insertSpaces: true };
		expect(run('    |x', (state) => backspaceText(state, spaces))).toBe('  [  ]x');
	});

	it('leaves Backspace alone after text', () => {
		expect(backspaceText(at('a |'))).toEqual({});
	});
});

describe('closing pairs', () => {
	const key = (name: string) => (state: EditState) => closingPairText(state, name);

	it('opens a pair before whitespace or a closing character', () => {
		expect(run('f|', key('('))).toBe('f(|)');
		expect(run('a = |;', key('{'))).toBe('a = {|};');
	});

	it('does not open a pair in front of a word', () => {
		expect(closingPairText(at('|word'), '(')).toEqual({});
	});

	it('does not open a quote straight after a word character', () => {
		expect(closingPairText(at('don|'), "'")).toEqual({});
	});

	it('steps over the closing character the reader types', () => {
		expect(run('f(a|)', key(')'))).toBe('f(a)|');
		expect(run("'returns|'", key("'"))).toBe("'returns'|");
	});

	it('wraps a selection', () => {
		expect(run('[count]', key('{'))).toBe('{[count]}');
	});

	it('selects an empty pair for Backspace to delete', () => {
		expect(run('f(|)', key('Backspace'))).toBe('f[()]');
		expect(closingPairText(at('f(a|)'), 'Backspace')).toEqual({});
	});

	it('ignores other keys', () => {
		expect(closingPairText(at('a|'), 'x')).toEqual({});
	});
});

describe('editor text', () => {
	it('drops the final newline so the textarea and the highlighted lines match', () => {
		expect(editorText('a\nb\n')).toBe('a\nb');
		expect(editorText('a\nb')).toBe('a\nb');
	});

	it('finds a 1-based line and column, clamped to the line', () => {
		const text = 'one\ntwo\nthree';
		expect(offsetOf(text, 2, 2)).toBe(5);
		expect(offsetOf(text, 2, 99)).toBe(7);
		expect(offsetOf(text, 9, 1)).toBe(text.length);
	});
});
