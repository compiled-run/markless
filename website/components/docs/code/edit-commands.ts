// Key commands for the Code editor as pure functions over a textarea's text and selection.
// Ported from shikicode (MIT, magic-akari, https://github.com/magic-akari/shikicode).

export type EditState = {
	readonly value: string;
	readonly selectionStart: number;
	readonly selectionEnd: number;
	readonly selectionDirection?: 'forward' | 'backward' | 'none';
};

/** Replace `start..end` with `value`, then place the caret per `mode`. */
export type EditPatch = {
	readonly value: string;
	readonly start: number;
	readonly end: number;
	readonly mode: 'start' | 'end' | 'select';
};

export type EditSelect = {
	readonly start: number;
	readonly end: number;
	readonly direction?: 'forward' | 'backward' | 'none';
};

/** What a key does; an empty action leaves the key to the browser. */
export type EditAction = { readonly patch?: EditPatch; readonly select?: EditSelect };

export type IndentConfig = { readonly tabSize: number; readonly insertSpaces: boolean };

export const SITE_INDENT: IndentConfig = { tabSize: 2, insertSpaces: false };

const NONE: EditAction = {};

function floorTab(width: number, tabSize: number): number {
	return Math.floor(width / tabSize) * tabSize;
}

function ceilTab(width: number, tabSize: number): number {
	return Math.ceil(width / tabSize) * tabSize;
}

/** Columns from the line start (or `left`) to `offset`, tabs rounded to the next stop. */
function widthFromLeft(content: string, offset: number, tabSize: number, left?: number): number {
	let from = left;
	if (from === undefined) {
		from = offset;
		while (from > 0 && content[from - 1] !== '\n') from--;
	}
	let width = 0;
	for (let at = from; at < offset; at++) {
		width++;
		if (content[at] === '\t') width = ceilTab(width, tabSize);
	}
	return width;
}

/** The leading whitespace of `line`: its width in columns and its length in characters. */
function leadingSpace(line: string, tabSize: number): [width: number, span: number] {
	let width = 0;
	let at = 0;
	for (; at < line.length; at++) {
		if (line[at] === ' ') width++;
		else if (line[at] === '\t') width = ceilTab(width + 1, tabSize);
		else break;
	}
	return [width, at];
}

function indentOf(width: number, config: IndentConfig): string {
	return config.insertSpaces ? ' '.repeat(width) : '\t'.repeat(width / config.tabSize);
}

function lineStart(text: string, index: number): number {
	let at = index;
	while (at > 0 && text[at - 1] !== '\n') at--;
	return at;
}

function lineEnd(text: string, index: number): number {
	let at = index;
	while (at < text.length && text[at] !== '\n' && text[at] !== '\r') at++;
	return at;
}

/** The end of the last line a selection ending at `index` covers, its trailing newlines excluded. */
function blockLineEnd(text: string, index: number): number {
	let at = index;
	if (text[at - 1] === '\n') at--;
	while (at > 0 && (at === text.length || text[at] === '\n' || text[at] === '\r')) at--;
	return lineEnd(text, at);
}

function wholeLinesSelected(text: string, start: number, end: number): boolean {
	const atStart = start === 0 || text[start - 1] === '\n';
	const atEnd = end === text.length || text[end] === '\n' || text[end] === '\r';
	return start !== end && atStart && atEnd;
}

/** Keeps a selection anchored to the same text after its lines were re-indented. */
function reanchor(
	input: EditState,
	config: IndentConfig,
	blockStart: number,
	blockEnd: number,
	replacement: string,
): EditSelect {
	const { value, selectionStart, selectionEnd, selectionDirection } = input;
	let start = selectionStart;
	let end = selectionEnd + replacement.length - (blockEnd - blockStart);
	if (selectionStart !== blockStart) {
		const offset = selectionStart - blockStart;
		const [, oldLeading] = leadingSpace(
			value.slice(blockStart, selectionStart),
			config.tabSize,
		);
		const [, newLeading] = leadingSpace(replacement, config.tabSize);
		if (offset > oldLeading) start += newLeading - oldLeading;
		else if (offset > newLeading) start = blockStart + newLeading;
	}
	if (selectionEnd < blockEnd) {
		const endLine = lineStart(value, selectionEnd);
		const offset = selectionEnd - endLine;
		const [, oldLeading] = leadingSpace(value.slice(endLine, selectionEnd), config.tabSize);
		const lastLine = lineStart(replacement, replacement.length);
		const [, newLeading] = leadingSpace(replacement.slice(lastLine), config.tabSize);
		if (offset <= oldLeading) {
			end = blockStart + lastLine + offset;
			if (offset > newLeading) end += newLeading - oldLeading;
		}
	}
	return selectionDirection ? { start, end, direction: selectionDirection } : { start, end };
}

/** Tab: one indent at the caret, or one more indent on every selected line. */
export function indentText(input: EditState, config: IndentConfig = SITE_INDENT): EditAction {
	const { value, selectionStart, selectionEnd } = input;
	const block =
		selectionStart !== selectionEnd &&
		(wholeLinesSelected(value, selectionStart, selectionEnd) ||
			value.slice(selectionStart, selectionEnd).includes('\n'));
	if (!block) {
		const width = widthFromLeft(value, selectionStart, config.tabSize);
		const indent = config.insertSpaces
			? ' '.repeat(ceilTab(width + 1, config.tabSize) - width)
			: '\t';
		return { patch: { value: indent, start: selectionStart, end: selectionEnd, mode: 'end' } };
	}
	const start = lineStart(value, selectionStart);
	const end = blockLineEnd(value, selectionEnd);
	const replacement = value
		.slice(start, end)
		.replaceAll(/^[ \t]*/gm, (leading, offset: number, text: string) => {
			if (text[offset] === '\n' || text[offset] === '\r' || offset === text.length)
				return leading;
			const width = widthFromLeft(leading, leading.length, config.tabSize, 0);
			return indentOf(ceilTab(width + 1, config.tabSize), config);
		});
	return {
		patch: { value: replacement, start, end, mode: 'end' },
		select: reanchor(input, config, start, end, replacement),
	};
}

/** Shift+Tab: one indent less on every line the selection touches. */
export function outdentText(input: EditState, config: IndentConfig = SITE_INDENT): EditAction {
	const { value, selectionStart, selectionEnd } = input;
	const start = lineStart(value, selectionStart);
	const end = blockLineEnd(
		value,
		Math.min(Math.max(selectionEnd, selectionStart + 1), value.length),
	);
	const block = value.slice(start, end);
	const replacement = block.replaceAll(/^[ \t]*/gm, (leading) => {
		const width = floorTab(
			widthFromLeft(leading, leading.length, config.tabSize, 0) - 1,
			config.tabSize,
		);
		return width <= 0 ? '' : indentOf(width, config);
	});
	if (replacement === block) return NONE;
	return {
		patch: { value: replacement, start, end, mode: 'end' },
		select: reanchor(input, config, start, end, replacement),
	};
}

/** Enter: keep the line's indent, one deeper after an opening bracket, and split an empty pair. */
export function enterText(input: EditState, config: IndentConfig = SITE_INDENT): EditAction {
	const { value, selectionStart, selectionEnd } = input;
	if (selectionStart !== selectionEnd) return NONE;
	const start = lineStart(value, selectionStart);
	if (start === selectionStart) return NONE;
	const leading = floorTab(
		leadingSpace(value.slice(start, selectionStart), config.tabSize)[0],
		config.tabSize,
	);
	const opens = '([{'.includes(value[selectionStart - 1] ?? '') ? config.tabSize : 0;
	let replacement = `\n${indentOf(leading + opens, config)}`;
	let select: EditSelect | undefined;
	if (['{}', '[]', '()'].includes(value.slice(selectionStart - 1, selectionStart + 1))) {
		const caret = selectionStart + replacement.length;
		select = { start: caret, end: caret, direction: 'none' };
		replacement += `\n${indentOf(leading, config)}`;
	}
	const patch: EditPatch = {
		value: replacement,
		start: selectionStart,
		end: selectionStart,
		mode: 'end',
	};
	return select ? { patch, select } : { patch };
}

/** Backspace in leading spaces: select back to the previous tab stop, for the browser's own delete. */
export function backspaceText(input: EditState, config: IndentConfig = SITE_INDENT): EditAction {
	const { value, selectionStart, selectionEnd } = input;
	if (selectionStart !== selectionEnd || value[selectionStart - 1] !== ' ') return NONE;
	const start = lineStart(value, selectionStart);
	let width = 0;
	let stop = start;
	for (let at = start; at < selectionStart - 1; at++) {
		if (value[at] === ' ') {
			width++;
			if (width % config.tabSize === 0) stop = at + 1;
		} else if (value[at] === '\t') {
			stop = at + 1;
			width = ceilTab(width + 1, config.tabSize);
		} else return NONE;
	}
	return { select: { start: stop, end: selectionStart, direction: 'none' } };
}

export type ClosingPair = readonly [open: string, close: string];

export const CODE_PAIRS: readonly ClosingPair[] = [
	['(', ')'],
	['[', ']'],
	['{', '}'],
	['"', '"'],
	["'", "'"],
	['`', '`'],
];

// A pair opens only before one of these, so typing in front of a word does not add a stray close.
const CLOSES_BEFORE = ' \t\n.,;:)]}>=';

/**
 * A typed bracket or quote: wrap a selection, open a pair, or step over a close.
 * Backspace inside an empty pair selects both, for the browser's own delete to remove.
 */
export function closingPairText(
	input: EditState,
	key: string,
	pairs: readonly ClosingPair[] = CODE_PAIRS,
): EditAction {
	const { value, selectionStart, selectionEnd } = input;
	if (key === 'Backspace') {
		if (selectionStart !== selectionEnd || selectionStart === 0) return NONE;
		const around = value.slice(selectionStart - 1, selectionStart + 1);
		return pairs.some(([open, close]) => open + close === around)
			? { select: { start: selectionStart - 1, end: selectionStart + 1 } }
			: NONE;
	}
	const pair = pairs.find(([open]) => open === key);
	const closes = pairs.some(([, close]) => close === key);
	if (!pair && !closes) return NONE;
	if (selectionStart === selectionEnd && closes && value[selectionStart] === key)
		return { select: { start: selectionStart + 1, end: selectionStart + 1 } };
	if (!pair) return NONE;
	const [open, close] = pair;
	if (selectionStart !== selectionEnd) {
		const inner = value.slice(selectionStart, selectionEnd);
		return {
			patch: {
				value: open + inner + close,
				start: selectionStart,
				end: selectionEnd,
				mode: 'end',
			},
			select: { start: selectionStart + 1, end: selectionEnd + 1 },
		};
	}
	const quote = open === close;
	if (quote && /[\w$]/.test(value[selectionStart - 1] ?? '')) return NONE;
	if (!CLOSES_BEFORE.includes(value[selectionStart] ?? '\n')) return NONE;
	return {
		patch: { value: open + close, start: selectionStart, end: selectionEnd, mode: 'start' },
		select: { start: selectionStart + 1, end: selectionStart + 1 },
	};
}

/** The text and selection after `action`, as the editor applies it. */
export function applyEdit(state: EditState, action: EditAction): EditState {
	let next: EditState = state;
	if (action.patch) {
		const { value, start, end, mode } = action.patch;
		const text = next.value.slice(0, start) + value + next.value.slice(end);
		const caret = mode === 'start' ? start : start + value.length;
		next = {
			value: text,
			selectionStart: mode === 'select' ? start : caret,
			selectionEnd: caret,
		};
	}
	if (action.select)
		next = {
			value: next.value,
			selectionStart: action.select.start,
			selectionEnd: action.select.end,
		};
	return next;
}
