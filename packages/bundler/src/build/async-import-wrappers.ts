import { parseChunkCode, spansAnyOffset, textOffsets } from './chunk-ast.ts';

type Syntax = { type?: string; start: number; end: number; [key: string]: unknown };
type Edit = { readonly start: number; readonly end: number; readonly text: string };

/**
 * Vite rewrites `(await import(x)).a` and `const {a} = await import(x)` into
 * `(async()=>{let{a:e}=await import(x);return{a:e}})()` so it can preload
 * around it. Once the preload call is stripped, that wrapper is only a detour:
 * a reader that takes named keys off the awaited wrapper reads them off
 * `await import(x)` instead, and any other reader gets
 * `import(x).then(m=>({a:m.a}))`, which resolves to the same snapshot object.
 */
export function unwrapAsyncImportWrappers(bundle: Record<string, unknown>): void {
	for (const output of Object.values(bundle)) {
		if (!isChunk(output) || !output.code.includes('async()=>{')) continue;
		output.code = unwrapAsyncImportWrappersInCode(output.code);
	}
}

export function unwrapAsyncImportWrappersInCode(code: string): string {
	let program: Syntax;
	try {
		const parsed = parseChunkCode('chunk.js', code);
		if (parsed.errors.length) return code;
		program = parsed.program as unknown as Syntax;
	} catch {
		return code;
	}
	const edits: Edit[] = [];
	walk(program, [], textOffsets(code, 'async'), (node, parents) => {
		const wrapper = asyncImportWrapper(node);
		if (!wrapper) return true;
		const source = code.slice(wrapper.awaited.start, wrapper.awaited.end);
		const readerEdits = keyReaderEdits(node, parents, wrapper.keys);
		if (readerEdits)
			edits.push({ start: node.start, end: node.end, text: source }, ...readerEdits);
		else {
			const entries = [...wrapper.keys].map(
				([key, imported]) => `${propertyKey(key)}:${member(imported)}`,
			);
			edits.push({
				start: node.start,
				end: node.end,
				text: `${source}.then(m=>({${entries.join(',')}}))`,
			});
		}
		return false;
	});
	let next = code;
	for (const edit of edits.sort((a, b) => b.start - a.start))
		next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
	return next;
}

type Wrapper = { readonly awaited: Syntax; readonly keys: ReadonlyMap<string, string> };

// `(async()=>{let{k:v,..}=await E;return{r:v,..}})()`, and nothing else: returned key -> key read off E.
function asyncImportWrapper(call: Syntax): Wrapper | undefined {
	if (call.type !== 'CallExpression' || (call.arguments as unknown[]).length > 0 || call.optional)
		return undefined;
	let callee = call.callee as Syntax;
	while (callee.type === 'ParenthesizedExpression') callee = callee.expression as Syntax;
	if (
		callee.type !== 'ArrowFunctionExpression' ||
		callee.async !== true ||
		(callee.params as unknown[]).length > 0
	)
		return undefined;
	const body = callee.body as Syntax;
	const statements = body.type === 'BlockStatement' ? (body.body as Syntax[]) : [];
	const [declaration, returned] = statements;
	if (
		statements.length !== 2 ||
		declaration?.type !== 'VariableDeclaration' ||
		declaration.kind === 'var' ||
		(declaration.declarations as unknown[]).length !== 1 ||
		returned?.type !== 'ReturnStatement'
	)
		return undefined;
	const declarator = (declaration.declarations as Syntax[])[0]!;
	const pattern = declarator.id as Syntax;
	const awaited = declarator.init as Syntax | null;
	const object = returned.argument as Syntax | null;
	if (
		pattern.type !== 'ObjectPattern' ||
		awaited?.type !== 'AwaitExpression' ||
		object?.type !== 'ObjectExpression'
	)
		return undefined;
	const bound = new Map<string, string>();
	for (const property of pattern.properties as Syntax[]) {
		const key = plainKey(property);
		const value = property.value as Syntax;
		if (key === undefined || value.type !== 'Identifier') return undefined;
		bound.set(value.name as string, key);
	}
	const keys = new Map<string, string>();
	for (const property of object.properties as Syntax[]) {
		const key = plainKey(property);
		const value = property.value as Syntax;
		if (key === undefined || property.method || value.type !== 'Identifier' || keys.has(key))
			return undefined;
		const imported = bound.get(value.name as string);
		if (imported === undefined) return undefined;
		keys.set(key, imported);
	}
	return { awaited: awaited.argument as Syntax, keys };
}

// `(await W).r` or `let{r:x}=await W`: the only reads are named keys, taken at once.
function keyReaderEdits(
	call: Syntax,
	parents: readonly Syntax[],
	keys: ReadonlyMap<string, string>,
): Edit[] | undefined {
	let index = parents.length - 1;
	while (parents[index]?.type === 'ParenthesizedExpression') index--;
	const awaited = parents[index];
	if (awaited?.type !== 'AwaitExpression') return undefined;
	index--;
	while (parents[index]?.type === 'ParenthesizedExpression') index--;
	const reader = parents[index];
	// A method call would see the snapshot object as `this`.
	const called =
		parents[index - 1]?.type === 'CallExpression' && parents[index - 1]!.callee === reader;
	if (reader?.type === 'MemberExpression' && !reader.computed && !reader.optional && !called) {
		const property = reader.property as Syntax;
		const imported = keys.get(property.name as string);
		return imported !== undefined && IDENTIFIER.test(imported)
			? [{ start: property.start, end: property.end, text: imported }]
			: undefined;
	}
	const pattern = reader?.type === 'VariableDeclarator' ? (reader.id as Syntax) : undefined;
	if (pattern?.type !== 'ObjectPattern') return undefined;
	const edits: Edit[] = [];
	for (const property of pattern.properties as Syntax[]) {
		const key = plainKey(property);
		const imported = key === undefined ? undefined : keys.get(key);
		if (imported === undefined) return undefined;
		const node = property.key as Syntax;
		edits.push(
			property.shorthand
				? { start: node.start, end: node.start, text: `${propertyKey(imported)}:` }
				: { start: node.start, end: node.end, text: propertyKey(imported) },
		);
	}
	return edits;
}

const IDENTIFIER = /^[$A-Z_a-z][$\w]*$/;

function member(name: string): string {
	return IDENTIFIER.test(name) ? `m.${name}` : `m[${JSON.stringify(name)}]`;
}

function propertyKey(name: string): string {
	return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

function plainKey(property: Syntax): string | undefined {
	if (property.type !== 'Property' || property.computed || property.kind !== 'init')
		return undefined;
	const key = property.key as Syntax;
	if (key.type === 'Identifier') return key.name as string;
	if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
	return undefined;
}

function walk(
	node: Syntax,
	parents: Syntax[],
	offsets: readonly number[],
	visit: (node: Syntax, parents: readonly Syntax[]) => boolean,
): void {
	if (!visit(node, parents)) return;
	parents.push(node);
	const descend = (child: unknown) => {
		if (isSyntax(child) && spansAnyOffset(offsets, child)) walk(child, parents, offsets, visit);
	};
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parent') continue;
		if (Array.isArray(value)) {
			for (const item of value) descend(item);
		} else descend(value);
	}
	parents.pop();
}

function isSyntax(value: unknown): value is Syntax {
	return (
		typeof value === 'object' && value !== null && typeof (value as Syntax).type === 'string'
	);
}

function isChunk(value: unknown): value is { type: 'chunk'; code: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { type?: unknown }).type === 'chunk' &&
		typeof (value as { code?: unknown }).code === 'string'
	);
}
