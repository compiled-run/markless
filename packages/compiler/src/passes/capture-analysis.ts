import type {
	CaptureAnalysisArtifact,
	CaptureAnalysisDiagnostic,
	CaptureAnalysisInput,
	PlannedSymbol,
	SemanticLocalBinding,
} from '../artifacts.ts';

export function analyzeCaptures(input: CaptureAnalysisInput): CaptureAnalysisArtifact {
	const extractedSymbols = input.symbolResolver.symbols.map((symbol) => ({
		symbolId: symbol.id,
		kind: symbol.kind,
		source: symbolSource(symbol),
	}));
	const diagnostics = extractedSymbols.flatMap((symbol) =>
		input.semanticGraph.localBindings.flatMap((binding) =>
			isCaptured(symbol.source, binding.name)
				? [unsupportedCaptureDiagnostic(symbol, binding)]
				: [],
		),
	);

	return {
		passId: 'capture-analysis',
		extractedSymbols,
		diagnostics,
	};
}

function unsupportedCaptureDiagnostic(
	symbol: {
		readonly symbolId: string;
		readonly kind: PlannedSymbol['kind'];
		readonly source: string;
	},
	binding: SemanticLocalBinding,
): CaptureAnalysisDiagnostic {
	if (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop') {
		return {
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			title: 'This event handler cannot run in the browser yet',
			message: `Cannot emit lazy ${symbol.kind} symbol "${symbol.symbolId}" because it reads component-local "${binding.name}", a local ${bindingKindLabel(binding.kind)} value that cannot cross a resume boundary.`,
			why: 'Lazy handler symbols run after browser resume. Handler bodies may use graph references, element handles, props/shared values, module imports, or serializable capture-plane inputs; unsupported body locals would otherwise become silent no-op code.',
			primarySpan: binding.sourceSpan,
			passId: 'capture-analysis',
			artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
			symbolId: symbol.symbolId,
			source: symbol.source,
			suggestions: [
				{
					message: suggestionForBinding(binding.kind),
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
		};
	}

	if (symbol.kind === 'behavior') {
		return {
			code: 'MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			title: 'This element behavior cannot run in the browser yet',
			message: `Cannot emit lazy behavior symbol "${symbol.symbolId}" because it reads component-local "${binding.name}", a local ${bindingKindLabel(binding.kind)} value that cannot cross a resume boundary.`,
			why: 'Element behavior symbols run after browser resume. Behavior factories may use module functions, graph inputs, element handles, props/shared values, or serializable capture-plane inputs; unsupported body locals would otherwise become missing behavior code.',
			primarySpan: binding.sourceSpan,
			passId: 'capture-analysis',
			artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
			symbolId: symbol.symbolId,
			source: symbol.source,
			suggestions: [
				{
					message: suggestionForBinding(binding.kind),
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED',
		};
	}

	return {
		code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
		severity: 'error',
		phase: 'capture-analysis',
		title: `Cannot capture local ${bindingKindLabel(binding.kind)} in lazy symbol`,
		message: `Cannot capture "${binding.name}" in lazy ${symbol.kind} symbol "${symbol.symbolId}" because local ${bindingKindLabel(binding.kind)} values cannot cross a resume boundary.`,
		why: 'Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.',
		primarySpan: binding.sourceSpan,
		passId: 'capture-analysis',
		artifactKeys: ['semanticGraph', 'symbolResolver', 'captureAnalysis'],
		symbolId: symbol.symbolId,
		source: symbol.source,
		suggestions: [
			{
				message: suggestionForBinding(binding.kind),
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
	};
}

function bindingKindLabel(kind: SemanticLocalBinding['kind']): string {
	if (kind === 'class-instance') return 'class instance';
	if (kind === 'dom-node') return 'DOM node';
	if (kind === 'non-serializable-constant') return 'non-serializable constant';

	return 'function';
}

function suggestionForBinding(kind: SemanticLocalBinding['kind']): string {
	if (kind === 'class-instance') {
		return 'Represent durable data with state()/computed(), hoist serializable helpers to module scope, or move DOM-backed setup into a host element behavior with attach.';
	}

	if (kind === 'dom-node') {
		return 'Use element() with el={...} for DOM locators, or move DOM-backed setup into a host element behavior with attach.';
	}

	if (kind === 'non-serializable-constant') {
		return 'Keep captured constants serializable, move functions to module scope, or represent durable data with state()/computed().';
	}

	return 'Move the helper to module scope, inline the derivation, or represent durable data with state()/computed().';
}

function isCaptured(source: string, name: string): boolean {
	const searchableSource = sourceWithoutStringOrCommentText(source);
	if (symbolLocalBindingNames(searchableSource).has(name)) return false;

	for (
		let index = searchableSource.indexOf(name);
		index !== -1;
		index = searchableSource.indexOf(name, index + name.length)
	) {
		const before = searchableSource[index - 1] ?? '';
		const after = searchableSource[index + name.length] ?? '';
		if (isIdentifierChar(before) || before === '.') continue;
		if (isIdentifierChar(after)) continue;
		if (nextNonWhitespace(searchableSource, index + name.length) === ':') continue;
		if (isObjectMethodKey(searchableSource, index, name.length)) continue;

		return true;
	}

	return false;
}

function symbolLocalBindingNames(source: string): ReadonlySet<string> {
	const names = new Set(leadingArrowFunctionParameterNames(source));
	const body = leadingArrowFunctionBlockBody(source);
	if (body === null) return names;

	for (const name of topLevelDeclarationNames(body)) {
		names.add(name);
	}

	return names;
}

function leadingArrowFunctionParameterNames(source: string): ReadonlySet<string> {
	const start = nextNonWhitespaceIndex(source, 0);
	if (start === -1) return new Set();

	return leadingArrowFunctionParameterNamesFrom(source, start);
}

function leadingArrowFunctionParameterNamesFrom(
	source: string,
	start: number,
): ReadonlySet<string> {
	if (startsWithKeyword(source, start, 'async')) {
		const afterAsync = nextNonWhitespaceIndex(source, start + 'async'.length);
		if (afterAsync === -1) return new Set();

		return leadingArrowFunctionParameterNamesFrom(source, afterAsync);
	}

	if (source[start] === '(') {
		const paramsEnd = matchingCloseParenIndex(source, start);
		if (paramsEnd === -1) return new Set();

		const afterParams = nextNonWhitespaceIndex(source, paramsEnd + 1);
		if (!startsWithArrow(source, afterParams)) return new Set();

		return simpleParameterNames(source.slice(start + 1, paramsEnd));
	}

	const identifierEnd = identifierEndIndex(source, start);
	if (identifierEnd === start) return new Set();

	const afterIdentifier = nextNonWhitespaceIndex(source, identifierEnd);
	if (!startsWithArrow(source, afterIdentifier)) return new Set();

	return new Set([source.slice(start, identifierEnd)]);
}

function leadingArrowFunctionBlockBody(source: string): string | null {
	const bodyStart = leadingArrowFunctionBodyStart(source);
	if (bodyStart === -1 || source[bodyStart] !== '{') return null;

	const bodyEnd = matchingCloseBraceIndex(source, bodyStart);
	if (bodyEnd === -1) return null;

	return source.slice(bodyStart + 1, bodyEnd);
}

function leadingArrowFunctionBodyStart(source: string): number {
	const start = nextNonWhitespaceIndex(source, 0);
	if (start === -1) return -1;

	return leadingArrowFunctionBodyStartFrom(source, start);
}

function leadingArrowFunctionBodyStartFrom(source: string, start: number): number {
	if (startsWithKeyword(source, start, 'async')) {
		const afterAsync = nextNonWhitespaceIndex(source, start + 'async'.length);
		if (afterAsync === -1) return -1;

		return leadingArrowFunctionBodyStartFrom(source, afterAsync);
	}

	if (source[start] === '(') {
		const paramsEnd = matchingCloseParenIndex(source, start);
		if (paramsEnd === -1) return -1;

		const afterParams = nextNonWhitespaceIndex(source, paramsEnd + 1);
		if (!startsWithArrow(source, afterParams)) return -1;

		return nextNonWhitespaceIndex(source, afterParams + 2);
	}

	const identifierEnd = identifierEndIndex(source, start);
	if (identifierEnd === start) return -1;

	const afterIdentifier = nextNonWhitespaceIndex(source, identifierEnd);
	if (!startsWithArrow(source, afterIdentifier)) return -1;

	return nextNonWhitespaceIndex(source, afterIdentifier + 2);
}

function simpleParameterNames(source: string): ReadonlySet<string> {
	const names = new Set<string>();

	for (const rawParam of source.split(',')) {
		const param = rawParam
			.trim()
			.replace(/^\.\.\./, '')
			.trim();
		const nameEnd = identifierEndIndex(param, 0);
		if (nameEnd > 0) names.add(param.slice(0, nameEnd));
	}

	return names;
}

function topLevelDeclarationNames(source: string): ReadonlySet<string> {
	const names = new Set<string>();
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		const isTopLevel = parenDepth === 0 && bracketDepth === 0 && braceDepth === 0;

		if (isTopLevel) {
			const variableKeyword = variableDeclarationKeywordAt(source, index);
			if (variableKeyword !== null) {
				index = collectVariableDeclarationNames(
					source,
					index + variableKeyword.length,
					names,
				);
				continue;
			}

			const namedDeclarationKeyword = namedDeclarationKeywordAt(source, index);
			if (namedDeclarationKeyword !== null) {
				index = collectNamedDeclarationName(
					source,
					index + namedDeclarationKeyword.length,
					names,
				);
				continue;
			}
		}

		if (char === '(') parenDepth++;
		if (char === ')' && parenDepth > 0) parenDepth--;
		if (char === '[') bracketDepth++;
		if (char === ']' && bracketDepth > 0) bracketDepth--;
		if (char === '{') braceDepth++;
		if (char === '}' && braceDepth > 0) braceDepth--;
	}

	return names;
}

function variableDeclarationKeywordAt(source: string, index: number): string | null {
	if (startsWithKeyword(source, index, 'const')) return 'const';
	if (startsWithKeyword(source, index, 'let')) return 'let';
	if (startsWithKeyword(source, index, 'var')) return 'var';

	return null;
}

function namedDeclarationKeywordAt(source: string, index: number): string | null {
	if (startsWithKeyword(source, index, 'function')) return 'function';
	if (startsWithKeyword(source, index, 'class')) return 'class';

	return null;
}

function collectVariableDeclarationNames(
	source: string,
	start: number,
	names: Set<string>,
): number {
	let index = nextNonWhitespaceIndex(source, start);
	if (index === -1) return source.length;

	while (index < source.length) {
		const nameEnd = identifierEndIndex(source, index);
		if (nameEnd > index) {
			names.add(source.slice(index, nameEnd));
			index = nameEnd;
		}

		index = skipVariableDeclarator(source, index);
		const next = nextNonWhitespaceIndex(source, index);
		if (next === -1) return source.length;
		if (source[next] === ',') {
			index = nextNonWhitespaceIndex(source, next + 1);
			if (index === -1) return source.length;
			continue;
		}

		return next;
	}

	return source.length;
}

function skipVariableDeclarator(source: string, start: number): number {
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;

	for (let index = start; index < source.length; index++) {
		const char = source[index] ?? '';

		if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
			if (char === ',' || char === ';') return index;
		}

		if (char === '(') parenDepth++;
		if (char === ')' && parenDepth > 0) parenDepth--;
		if (char === '[') bracketDepth++;
		if (char === ']' && bracketDepth > 0) bracketDepth--;
		if (char === '{') braceDepth++;
		if (char === '}' && braceDepth > 0) braceDepth--;
	}

	return source.length;
}

function collectNamedDeclarationName(source: string, start: number, names: Set<string>): number {
	let nameStart = nextNonWhitespaceIndex(source, start);
	if (source[nameStart] === '*') {
		nameStart = nextNonWhitespaceIndex(source, nameStart + 1);
	}

	if (nameStart === -1) return source.length;

	const nameEnd = identifierEndIndex(source, nameStart);
	if (nameEnd > nameStart) names.add(source.slice(nameStart, nameEnd));

	return nameEnd;
}

function startsWithKeyword(source: string, start: number, keyword: string): boolean {
	const end = start + keyword.length;
	return (
		source.slice(start, end) === keyword &&
		!isIdentifierChar(source[start - 1] ?? '') &&
		!isIdentifierChar(source[end] ?? '')
	);
}

function startsWithArrow(source: string, start: number): boolean {
	return start !== -1 && source[start] === '=' && source[start + 1] === '>';
}

function identifierEndIndex(source: string, start: number): number {
	if (!isIdentifierStart(source[start] ?? '')) return start;

	let index = start + 1;
	while (isIdentifierChar(source[index] ?? '')) {
		index++;
	}

	return index;
}

function isIdentifierStart(char: string): boolean {
	return /[A-Za-z_$]/.test(char);
}

function isIdentifierChar(char: string): boolean {
	return /[\w$]/.test(char);
}

function nextNonWhitespace(source: string, startIndex: number): string {
	for (let index = startIndex; index < source.length; index++) {
		const char = source[index] ?? '';
		if (!/\s/.test(char)) return char;
	}

	return '';
}

function previousNonWhitespace(source: string, startIndex: number): string {
	for (let index = startIndex; index >= 0; index--) {
		const char = source[index] ?? '';
		if (!/\s/.test(char)) return char;
	}

	return '';
}

function isObjectMethodKey(source: string, nameStart: number, nameLength: number): boolean {
	const previous = previousNonWhitespace(source, nameStart - 1);
	if (previous !== '{' && previous !== ',') return false;

	const paramsStart = nextNonWhitespaceIndex(source, nameStart + nameLength);
	if (source[paramsStart] !== '(') return false;

	const paramsEnd = matchingCloseParenIndex(source, paramsStart);
	if (paramsEnd === -1) return false;

	const afterParams = nextNonWhitespace(source, paramsEnd + 1);
	return afterParams === '{';
}

function nextNonWhitespaceIndex(source: string, startIndex: number): number {
	for (let index = startIndex; index < source.length; index++) {
		const char = source[index] ?? '';
		if (!/\s/.test(char)) return index;
	}

	return -1;
}

function matchingCloseParenIndex(source: string, openParenIndex: number): number {
	let depth = 0;

	for (let index = openParenIndex; index < source.length; index++) {
		const char = source[index] ?? '';
		if (char === '(') depth++;
		if (char === ')') {
			depth--;
			if (depth === 0) return index;
		}
	}

	return -1;
}

function matchingCloseBraceIndex(source: string, openBraceIndex: number): number {
	let depth = 0;

	for (let index = openBraceIndex; index < source.length; index++) {
		const char = source[index] ?? '';
		if (char === '{') depth++;
		if (char === '}') {
			depth--;
			if (depth === 0) return index;
		}
	}

	return -1;
}

function sourceWithoutStringOrCommentText(source: string): string {
	let output = '';
	const stack: Array<'template' | { readonly mode: 'template-expression'; depth: number }> = [];

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';
		const mode = stack[stack.length - 1];

		if (mode === 'template') {
			if (char === '\\') {
				output += '  ';
				index++;
				continue;
			}

			if (char === '`') {
				output += ' ';
				stack.pop();
				continue;
			}

			if (char === '$' && next === '{') {
				output += '  ';
				index++;
				stack.push({ mode: 'template-expression', depth: 1 });
				continue;
			}

			output += char === '\n' ? '\n' : ' ';
			continue;
		}

		if (char === "'" || char === '"') {
			const result = consumeQuotedText(source, index, char);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}

		if (char === '`') {
			output += ' ';
			stack.push('template');
			continue;
		}

		if (char === '/' && next === '/') {
			const result = consumeLineComment(source, index);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}

		if (char === '/' && next === '*') {
			const result = consumeBlockComment(source, index);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}

		if (typeof mode === 'object') {
			if (char === '{') {
				mode.depth++;
			}

			if (char === '}') {
				mode.depth--;
				if (mode.depth === 0) {
					output += ' ';
					stack.pop();
					continue;
				}
			}
		}

		output += char;
	}

	return output;
}

function consumeQuotedText(
	source: string,
	startIndex: number,
	quote: "'" | '"',
): { readonly replacement: string; readonly endIndex: number } {
	let replacement = ' ';

	for (let index = startIndex + 1; index < source.length; index++) {
		const char = source[index] ?? '';

		if (char === '\\') {
			replacement += '  ';
			index++;
			continue;
		}

		replacement += char === '\n' ? '\n' : ' ';

		if (char === quote) {
			return { replacement, endIndex: index };
		}
	}

	return { replacement, endIndex: source.length - 1 };
}

function consumeLineComment(
	source: string,
	startIndex: number,
): { readonly replacement: string; readonly endIndex: number } {
	let replacement = '  ';

	for (let index = startIndex + 2; index < source.length; index++) {
		const char = source[index] ?? '';

		if (char === '\n') {
			replacement += '\n';
			return { replacement, endIndex: index };
		}

		replacement += ' ';
	}

	return { replacement, endIndex: source.length - 1 };
}

function consumeBlockComment(
	source: string,
	startIndex: number,
): { readonly replacement: string; readonly endIndex: number } {
	let replacement = '  ';

	for (let index = startIndex + 2; index < source.length; index++) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';

		if (char === '*' && next === '/') {
			replacement += '  ';
			return { replacement, endIndex: index + 1 };
		}

		replacement += char === '\n' ? '\n' : ' ';
	}

	return { replacement, endIndex: source.length - 1 };
}

function symbolSource(symbol: PlannedSymbol): string {
	if (symbol.kind === 'event-handler') return symbol.source;
	if (symbol.kind === 'callback-prop') return symbol.source;
	if (symbol.kind === 'dom-update') return symbol.source;
	if (symbol.kind === 'behavior') return symbol.source;
	if (symbol.kind === 'async-computed-runner') return symbol.source;

	return '';
}
