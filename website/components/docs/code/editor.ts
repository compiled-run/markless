// One file of a <Code> block: its textarea over the highlighted <pre>; edits use execCommand so undo keeps them.
import {
	backspaceText,
	closingPairText,
	enterText,
	indentText,
	outdentText,
	type EditAction,
	type EditState,
} from './edit-commands.ts';
import type { Highlighter } from './highlight.ts';
import type { CodeDiagnostic } from './protocol.ts';

export type CodeEditor = {
	text(): string;
	replace(code: string): void;
	/** Sets the text without focus or an undo step, for code restored from storage. */
	load(code: string): void;
	showProblems(problems: readonly CodeDiagnostic[]): void;
	reveal(line: number, column: number): void;
	dispose(): void;
};

/** The text a pane's textarea holds: the file without its final newline, so the two layers have equal lines. */
export function editorText(code: string): string {
	return code.replace(/\n$/, '');
}

/** The offset of 1-based `line` and `column` in `text`, clamped to the text. */
export function offsetOf(text: string, line: number, column: number): number {
	let at = 0;
	for (let row = 1; row < line; row++) {
		const next = text.indexOf('\n', at);
		if (next < 0) return text.length;
		at = next + 1;
	}
	const end = text.indexOf('\n', at);
	return Math.min(at + Math.max(column - 1, 0), end < 0 ? text.length : end);
}

/** The first sentence of a diagnostic, as the end of its problem line shows it. */
export function firstSentence(message: string): string {
	const end = message.search(/\.(\s|$)/);
	return end < 0 ? message : message.slice(0, end + 1);
}

function apply(input: HTMLTextAreaElement, action: EditAction): void {
	if (action.patch) {
		const { value, start, end, mode } = action.patch;
		input.setSelectionRange(start, end);
		// execCommand edits whatever has focus, and a hidden pane's textarea cannot take it.
		const native =
			input.ownerDocument.activeElement === input &&
			input.ownerDocument.execCommand('insertText', false, value);
		if (!native) {
			input.setRangeText(value, start, end, 'end');
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
		const caret = mode === 'start' ? start : start + value.length;
		input.setSelectionRange(mode === 'select' ? start : caret, caret);
	}
	if (action.select)
		input.setSelectionRange(action.select.start, action.select.end, action.select.direction);
}

export function createEditor(
	host: HTMLElement,
	options: { readonly file: string; readonly highlighter: Highlighter; onChange(): void },
): CodeEditor {
	const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
	const output = host.querySelector<HTMLElement>('pre')!;
	let problems: readonly CodeDiagnostic[] = [];
	let lastHtml: string[] = [];
	let leaving = false;
	// Server-rendered lines carry the component's scope class; a line added here needs it too.
	const lineClass = output.firstElementChild?.className ?? 'line';

	function paint(): void {
		const html = options.highlighter.lines(input.value, options.file);
		const marks = new Map<number, string[]>();
		for (const problem of problems)
			if (problem.line > 0)
				marks.set(problem.line, [
					...(marks.get(problem.line) ?? []),
					firstSentence(problem.message),
				]);
		const lines = [...output.children] as HTMLElement[];
		for (const [index, markup] of html.entries()) {
			let line = lines[index];
			if (!line) {
				line = document.createElement('span');
				line.className = lineClass;
				output.append(line);
			}
			if (lastHtml[index] !== markup || !line.isConnected) line.innerHTML = markup;
			const mark = marks.get(index + 1);
			line.classList.toggle('problem', mark !== undefined);
			if (mark) line.dataset.problem = [...new Set(mark)].join(' ');
			else delete line.dataset.problem;
		}
		for (const extra of lines.slice(html.length)) extra.remove();
		lastHtml = html;
		pin();
	}

	// The textarea never scrolls itself: the pane around both layers does.
	const pin = () => {
		input.scrollTop = 0;
		input.scrollLeft = 0;
	};

	const onInput = () => {
		paint();
		options.onChange();
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === 'Escape') {
			leaving = true;
			return;
		}
		if (event.key === 'Tab' && leaving) return;
		leaving = false;
		const state: EditState = input;
		let action: EditAction = {};
		if (event.key === 'Tab') action = event.shiftKey ? outdentText(state) : indentText(state);
		else if (event.key === 'Enter' && !event.shiftKey) action = enterText(state);
		else if (event.key === 'Backspace') {
			action = closingPairText(state, 'Backspace');
			if (!action.select) action = backspaceText(state);
		} else if (event.key.length === 1) action = closingPairText(state, event.key);
		// Backspace only widens the selection; the browser's own delete removes it.
		if (event.key === 'Tab' || (event.key !== 'Backspace' && (action.patch || action.select)))
			event.preventDefault();
		apply(input, action);
	};

	// Keep the caret's line in view inside the pane, which scrolls instead of the textarea.
	const onSelect = () => {
		if (document.activeElement !== input) return;
		const row = input.value.slice(0, input.selectionEnd).split('\n').length - 1;
		const line = output.children[row] as HTMLElement | undefined;
		line?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	};

	input.addEventListener('input', onInput);
	input.addEventListener('keydown', onKeydown);
	input.addEventListener('keyup', onSelect);
	input.addEventListener('scroll', pin);
	input.readOnly = false;
	lastHtml = [...output.children].map((line) => line.innerHTML);

	return {
		text: () => `${input.value}\n`,
		replace(code) {
			input.focus({ preventScroll: true });
			apply(input, {
				patch: {
					value: editorText(code),
					start: 0,
					end: input.value.length,
					mode: 'start',
				},
			});
		},
		load(code) {
			input.value = editorText(code);
			paint();
		},
		showProblems(next) {
			problems = next;
			paint();
		},
		reveal(line, column) {
			const at = offsetOf(input.value, line, column);
			input.focus({ preventScroll: true });
			input.setSelectionRange(at, at);
			(output.children[Math.max(line - 1, 0)] as HTMLElement | undefined)?.scrollIntoView({
				block: 'nearest',
			});
		},
		dispose() {
			input.removeEventListener('input', onInput);
			input.removeEventListener('keydown', onKeydown);
			input.removeEventListener('keyup', onSelect);
			input.removeEventListener('scroll', pin);
			input.readOnly = true;
		},
	};
}
