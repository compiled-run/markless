import { parseSync } from 'rolldown/experimental';

type ParseResult = ReturnType<typeof parseSync>;

// Keyed by exact code: a rewritten chunk is a new string, so a later pass never reads a stale tree.
const parsedByExtension = new Map<string, Map<string, ParseResult>>();

export function parseChunkCode(fileName: string, code: string): ParseResult {
	const extension = fileName.slice(fileName.lastIndexOf('.'));
	let parsed = parsedByExtension.get(extension);
	if (!parsed) parsedByExtension.set(extension, (parsed = new Map()));
	let result = parsed.get(code);
	if (!result) parsed.set(code, (result = parseSync(fileName, code)));
	return result;
}

export function clearParsedChunkCode(): void {
	parsedByExtension.clear();
}

// Over-approximates: an `import` keyword followed, past whitespace and comments, by `(`.
export function mayContainDynamicImport(code: string): boolean {
	for (
		let index = code.indexOf('import');
		index >= 0;
		index = code.indexOf('import', index + 1)
	) {
		const next = nextTokenStart(code, index + 'import'.length);
		if (next < 0 || code[next] === '(') return true;
	}
	return false;
}

// Every place `name` may stand as a callee (`name(`, `name?.(`), past whitespace and comments.
export function calleeOffsets(code: string, name: string): number[] {
	const offsets: number[] = [];
	for (let index = code.indexOf(name); index >= 0; index = code.indexOf(name, index + 1)) {
		const end = index + name.length;
		if (
			isAsciiIdentifierPart(code.charCodeAt(index - 1)) ||
			isAsciiIdentifierPart(code.charCodeAt(end))
		)
			continue;
		let next = nextTokenStart(code, end);
		if (next >= 0 && code.startsWith('?.', next)) next = nextTokenStart(code, next + 2);
		if (next < 0 || code[next] === '(') offsets.push(index);
	}
	return offsets;
}

// -1 when an unterminated block comment hides what follows.
function nextTokenStart(code: string, from: number): number {
	let cursor = from;
	for (;;) {
		const char = code.charCodeAt(cursor);
		if (char === 47 && code[cursor + 1] === '*') {
			const end = code.indexOf('*/', cursor + 2);
			if (end < 0) return -1;
			cursor = end + 2;
		} else if (char === 47 && code[cursor + 1] === '/') {
			cursor = nextLineBreak(code, cursor + 2);
		} else if (isWhitespace(char)) cursor++;
		else return cursor;
	}
}

function nextLineBreak(code: string, from: number): number {
	for (let index = from; index < code.length; index++)
		if (isLineTerminator(code.charCodeAt(index))) return index;
	return code.length;
}

function isAsciiIdentifierPart(char: number): boolean {
	return (
		(char >= 48 && char <= 57) ||
		(char >= 65 && char <= 90) ||
		(char >= 97 && char <= 122) ||
		char === 36 ||
		char === 95
	);
}

function isLineTerminator(char: number): boolean {
	return char === 10 || char === 13 || char === 0x2028 || char === 0x2029;
}

function isWhitespace(char: number): boolean {
	return (
		char === 9 ||
		char === 11 ||
		char === 12 ||
		char === 32 ||
		char === 0xa0 ||
		char === 0xfeff ||
		isLineTerminator(char) ||
		(char >= 0x1680 && /\s/.test(String.fromCharCode(char)))
	);
}

export function textOffsets(code: string, text: string): number[] {
	const offsets: number[] = [];
	for (let index = code.indexOf(text); index >= 0; index = code.indexOf(text, index + 1))
		offsets.push(index);
	return offsets;
}

// A node's source range holds every descendant, so a subtree whose range holds no offset holds no match.
export function spansAnyOffset(offsets: readonly number[], node: object): boolean {
	const { start, end } = node as { start?: unknown; end?: unknown };
	if (typeof start !== 'number' || typeof end !== 'number') return true;
	let low = 0;
	let high = offsets.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (offsets[middle]! < start) low = middle + 1;
		else high = middle;
	}
	return low < offsets.length && offsets[low]! < end;
}

export type ChunkDynamicImport = {
	readonly start: number;
	readonly end: number;
	// The literal specifier; undefined when the argument is not a plain string.
	readonly specifier: string | undefined;
	// No import attributes argument and no `import.source`/`import.defer` phase.
	readonly plain: boolean;
};

// Reads dynamic imports from the parser's module record, which skips materializing the chunk's tree.
// Undefined when the chunk has parse errors or a specifier this scanner cannot read without the tree.
export function chunkDynamicImports(
	fileName: string,
	code: string,
): readonly ChunkDynamicImport[] | undefined {
	const parsed = parseChunkCode(fileName, code);
	if (parsed.errors.length) return undefined;
	const found: ChunkDynamicImport[] = [];
	for (const entry of parsed.module.dynamicImports) {
		const request = entry.moduleRequest;
		const text = code.slice(request.start, request.end);
		const quote = text[0];
		let specifier: string | undefined;
		if (quote === '"' || quote === "'" || quote === '`') {
			if (text.length < 2 || text[text.length - 1] !== quote) return undefined;
			const body = text.slice(1, -1);
			if (body.includes('\\') || body.includes(quote)) return undefined;
			specifier = quote === '`' && body.includes('${') ? undefined : body;
		}
		const afterKeyword = nextTokenStart(code, entry.start + 'import'.length);
		let cursor = nextTokenStart(code, request.end);
		if (cursor >= 0 && code[cursor] === ',') cursor = nextTokenStart(code, cursor + 1);
		found.push({
			start: entry.start,
			end: entry.end,
			specifier,
			plain: code[afterKeyword] === '(' && code[cursor] === ')',
		});
	}
	return found;
}

// `export { local as exported }` bindings without a source, read from the module record.
// Undefined when the chunk has parse errors or an export this reader cannot classify without the tree.
export function chunkLocalExportSpecifiers(
	fileName: string,
	code: string,
): Map<string, string> | undefined {
	const parsed = parseChunkCode(fileName, code);
	if (parsed.errors.length) return undefined;
	const bindings = new Map<string, string>();
	for (const statement of parsed.module.staticExports) {
		const braced = code[nextTokenStart(code, statement.start + 'export'.length)] === '{';
		for (const entry of statement.entries) {
			if (!braced || entry.moduleRequest) continue;
			if (entry.exportName.kind !== 'Name' || entry.localName.kind !== 'Name') return undefined;
			bindings.set(entry.exportName.name!, entry.localName.name!);
		}
	}
	return bindings;
}
