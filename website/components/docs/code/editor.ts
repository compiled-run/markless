// One CodeMirror 6 editor per file of a <Code> block. Colours come from CSS custom
// properties the component sets, so the editor follows the site's light and dark themes.
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { tsxLanguage, typescriptLanguage } from '@codemirror/lang-javascript';
import {
	bracketMatching,
	HighlightStyle,
	indentService,
	indentUnit,
	LanguageSupport,
	syntaxHighlighting,
} from '@codemirror/language';
import { EditorState, StateEffect, StateField, type Range } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	drawSelection,
	EditorView,
	keymap,
	lineNumbers,
	WidgetType,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { CodeDiagnostic } from './protocol.ts';

export type CodeEditor = {
	readonly view: EditorView;
	text(): string;
	replace(code: string): void;
	showProblems(problems: readonly CodeDiagnostic[]): void;
	reveal(line: number, column: number): void;
};

const colours = HighlightStyle.define([
	{
		tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword],
		color: 'var(--code-keyword)',
	},
	{ tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--code-string)' },
	{
		tag: [
			tags.function(tags.variableName),
			tags.function(tags.propertyName),
			tags.className,
			tags.typeName,
		],
		color: 'var(--code-function)',
	},
	{
		tag: [tags.number, tags.bool, tags.null, tags.atom, tags.propertyName, tags.attributeName],
		color: 'var(--code-constant)',
	},
	{ tag: [tags.tagName, tags.angleBracket], color: 'var(--code-tag)' },
	{
		tag: [tags.comment, tags.lineComment, tags.blockComment],
		color: 'var(--code-comment)',
		fontStyle: 'italic',
	},
	{ tag: tags.invalid, color: 'inherit' },
]);

const look = EditorView.theme({
	'&': {
		color: 'var(--ink)',
		backgroundColor: 'transparent',
		fontSize: 'var(--step--2)',
		maxHeight: '26rem',
	},
	'&.cm-focused': { outline: 'none' },
	'.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
	'.cm-content': { padding: '0.75rem 0', caretColor: 'var(--ink)' },
	'.cm-line': { padding: '0 0.75rem' },
	'.cm-gutters': { backgroundColor: 'transparent', color: 'var(--code-comment)', border: 'none' },
	'.cm-lineNumbers .cm-gutterElement': { padding: '0', minWidth: '2.25rem', textAlign: 'right' },
	'.cm-cursor': { borderLeftColor: 'var(--ink)', borderLeftWidth: '2px' },
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
		backgroundColor: 'var(--code-selection) !important',
	},
	'.cm-matchingBracket': { backgroundColor: 'var(--code-selection)', outline: 'none' },
	'.cm-code-problem': {
		textDecoration: 'underline wavy var(--code-problem)',
		textDecorationSkipInk: 'none',
		textUnderlineOffset: '3px',
	},
	'.cm-code-problem-note': {
		margin: '0.15rem 0.75rem 0.35rem 0.75rem',
		padding: '0.35rem 0.6rem',
		borderLeft: '3px solid var(--code-problem)',
		background: 'var(--code-problem-wash)',
		fontFamily: 'var(--font-mono)',
		fontSize: '0.92em',
		whiteSpace: 'pre-line',
		overflowWrap: 'anywhere',
		lineHeight: '1.45',
	},
});

class ProblemNote extends WidgetType {
	constructor(readonly message: string) {
		super();
	}

	override eq(other: ProblemNote): boolean {
		return other.message === this.message;
	}

	toDOM(): HTMLElement {
		const note = document.createElement('div');
		note.className = 'cm-code-problem-note';
		note.setAttribute('role', 'note');
		note.textContent = this.message;
		return note;
	}
}

// The TSX grammar reads a `@{` body as an error, so its own indentation guesses go astray:
// a new line keeps the previous line's indent, one deeper after an opening bracket or tag.
const keepIndent = indentService.of((context, pos) => {
	const previous = context.state.doc.lineAt(pos).number - 1;
	if (previous < 1) return 0;
	const text = context.state.doc.line(previous).text;
	const indent = context.lineIndent(context.state.doc.line(previous).from);
	const opens =
		/[{([]\s*$/.test(text) || (/<[A-Za-z][^>]*[^/]>\s*$/.test(text) && !/<\//.test(text));
	return opens ? indent + context.unit : indent;
});

/** `CODE: First sentence.` of a diagnostic message. */
export function firstSentence(message: string): string {
	const end = message.search(/\.(\s|$)/);
	return end < 0 ? message : message.slice(0, end + 1);
}

const setProblems = StateEffect.define<readonly CodeDiagnostic[]>();

/** The underline and the note under the line of each problem in this file. */
function problemDecorations(
	state: EditorState,
	problems: readonly CodeDiagnostic[],
): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	const byLine = new Map<number, CodeDiagnostic[]>();
	for (const problem of problems) {
		if (problem.line < 1) continue;
		const at = Math.min(problem.line, state.doc.lines);
		byLine.set(at, [...(byLine.get(at) ?? []), problem]);
	}
	for (const [at, onLine] of byLine) {
		const line = state.doc.line(at);
		const from = Math.min(line.from + Math.max(onLine[0]!.column - 1, 0), line.to);
		if (from < line.to)
			ranges.push(Decoration.mark({ class: 'cm-code-problem' }).range(from, line.to));
		const notes = [...new Set(onLine.map((problem) => firstSentence(problem.message)))];
		ranges.push(
			Decoration.widget({
				widget: new ProblemNote(notes.join('\n')),
				block: true,
				side: 1,
			}).range(line.to),
		);
	}
	return Decoration.set(ranges, true);
}

const problemsField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(decorations, transaction) {
		let next = decorations.map(transaction.changes);
		for (const effect of transaction.effects)
			if (effect.is(setProblems)) next = problemDecorations(transaction.state, effect.value);
		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});

export function createEditor(
	host: HTMLElement,
	options: { readonly file: string; readonly code: string; onChange(): void },
): CodeEditor {
	const language = options.file.endsWith('.css')
		? []
		: new LanguageSupport(options.file.endsWith('.tsrx') ? tsxLanguage : typescriptLanguage);
	const view = new EditorView({
		parent: host,
		state: EditorState.create({
			doc: options.code,
			extensions: [
				lineNumbers(),
				EditorView.lineWrapping,
				history(),
				drawSelection(),
				keepIndent,
				bracketMatching(),
				indentUnit.of('\t'),
				EditorState.tabSize.of(2),
				language,
				syntaxHighlighting(colours),
				look,
				problemsField,
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
				EditorView.contentAttributes.of({
					'aria-label': `${options.file}, editable. Press Escape then Tab to leave the editor.`,
					spellcheck: 'false',
					autocapitalize: 'off',
					autocorrect: 'off',
				}),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) options.onChange();
				}),
			],
		}),
	});
	return {
		view,
		text: () => view.state.doc.toString(),
		replace(code) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
		},
		showProblems(problems) {
			view.dispatch({ effects: setProblems.of(problems) });
		},
		reveal(line, column) {
			const target = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
			const at = Math.min(target.from + Math.max(column - 1, 0), target.to);
			view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
			view.focus();
		},
	};
}
