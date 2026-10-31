import {
	callsImportedOrFreeName,
	importedOrFreeNameCalls,
	moduleCallFacts,
	type AnalyzedNode,
	type ModuleCallFacts,
	parseJavaScriptModule,
	type ImportedOrFreeNameCall,
	type JavaScriptAstNode,
} from '@markless/compiler';
import { calleeOffsets, parseChunkCode, spansAnyOffset } from './chunk-ast.ts';
import { applyCodeEdits, type CodeEdit } from './code-edits.ts';

/** Where a bundle defines Vite's preload helper, and the names that chunk exports it under. */
export type PreloadHelperExports = {
	readonly fileName: string;
	/** The module-scope names the helper has in that chunk. */
	readonly locals: readonly string[];
	/** The names that chunk exports it under. */
	readonly exports: readonly string[];
};

export type PreloadWrapperContext = {
	readonly fileName: string;
	readonly helpers: readonly PreloadHelperExports[];
};

export function stripEmptyVitePreloadWrappers(
	code: string,
	context?: PreloadWrapperContext,
): string {
	return stripImportedVitePreloadHelper(stripEmptyVitePreloadWrapperCalls(code, context));
}

export function stripEmptyVitePreloadWrapperCalls(
	code: string,
	context?: PreloadWrapperContext,
): string {
	return stripUnusedVitePreloadHelper(unwrapEmptyPreloadCalls(code, context));
}

/**
 * The module-scope functions a chunk defines as Vite's preload helper: one taking the import thunk and its
 * deps whose body raises `vite:preloadError`, itself or through the handler it reads.
 */
export function definedPreloadHelpers(
	code: string,
	facts = moduleCallFacts(code),
): readonly string[] {
	if (!facts || !code.includes('vite:preloadError')) return [];
	const functionOf = (name: string) =>
		facts
			.writesOf(name)
			.find(
				(value) =>
					value.type === 'FunctionExpression' ||
					value.type === 'ArrowFunctionExpression' ||
					value.type === 'FunctionDeclaration',
			);
	const raising = facts.moduleNames().filter((name) => {
		const value = functionOf(name);
		return (
			value !== undefined && code.slice(value.start, value.end).includes('vite:preloadError')
		);
	});
	return facts.moduleNames().filter((name) => {
		const value = functionOf(name);
		if (!value || (value.params as readonly unknown[]).length < 2) return false;
		if (raising.includes(name)) return true;
		return raising.some((handler) =>
			facts
				.readsOf(handler)
				.some((read) => read.start >= value.start && read.end <= value.end),
		);
	});
}

// A chunk's relative import specifier as the bundle file it names.
function relativeFile(importer: string, specifier: string): string {
	const parts = importer.split('/').slice(0, -1);
	for (const part of specifier.split('/')) {
		if (part === '..') parts.pop();
		else if (part !== '.') parts.push(part);
	}
	return parts.join('/');
}

function importedPreloadHelpers(
	facts: ModuleCallFacts,
	context: PreloadWrapperContext | undefined,
): readonly string[] {
	return facts.imports().flatMap((entry) => {
		if (entry.imported === '__vitePreload') return [entry.local];
		if (!context || !entry.specifier.startsWith('.')) return [];
		const source = relativeFile(context.fileName, entry.specifier);
		return context.helpers.some(
			(helper) => helper.fileName === source && helper.exports.includes(entry.imported),
		)
			? [entry.local]
			: [];
	});
}

type ImportedVitePreloadHelper = {
	readonly importStart: number;
	readonly importEnd: number;
	readonly keptImport: string;
	readonly preloadFunction: string;
	readonly initFunction: string;
	readonly keptSpecifiers: ReadonlySet<number>;
};

const IMPORT_DECLARATION_CANDIDATE_RE = /\bimport\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g;

// Vite wraps each dynamic import as `__vitePreload(() => import(...), deps)`; with no deps the wrapper only defers.
// A call goes only when its callee resolves to the helper, imported by name or defined in this chunk.
function unwrapEmptyPreloadCalls(code: string, context?: PreloadWrapperContext): string {
	const helperFiles =
		context?.helpers.map((helper) =>
			helper.fileName.slice(helper.fileName.lastIndexOf('/') + 1),
		) ?? [];
	if (
		!code.includes('__vitePreload') &&
		!code.includes('vite:preloadError') &&
		!helperFiles.some((file) => code.includes(file))
	)
		return code;
	const facts = moduleCallFacts(code);
	if (!facts) return code;
	const own = context?.helpers.find((helper) => helper.fileName === context.fileName);
	const helpers = new Set([...importedPreloadHelpers(facts, context), ...(own?.locals ?? [])]);
	const edits: CodeEdit[] = [];
	for (const helper of helpers)
		for (const { call } of facts.callsTo(helper)) {
			const edit = emptyPreloadUnwrap(code, call);
			if (edit) edits.push(edit);
		}
	return applyCodeEdits(code, edits) ?? code;
}

function emptyPreloadUnwrap(code: string, call: AnalyzedNode): CodeEdit | undefined {
	const [loader, deps, base, ...rest] = call.arguments as readonly AnalyzedNode[];
	if (!loader || !deps || rest.length > 0) return undefined;
	const noDeps =
		(deps.type === 'UnaryExpression' &&
			deps.operator === 'void' &&
			(deps.argument as AnalyzedNode).type === 'Literal') ||
		(deps.type === 'ArrayExpression' && (deps.elements as readonly unknown[]).length === 0);
	if (!noDeps || (base && code.slice(base.start, base.end) !== 'import.meta.url'))
		return undefined;
	if (
		loader.type !== 'ArrowFunctionExpression' ||
		(loader.params as readonly unknown[]).length > 0
	)
		return undefined;
	const body = loader.body as AnalyzedNode;
	if (loader.async)
		return {
			start: call.start,
			end: call.end,
			text: `(${code.slice(loader.start, loader.end)})()`,
		};
	if (body.type === 'BlockStatement') return undefined;
	const text = code.slice(body.start, body.end);
	const tight =
		body.type === 'CallExpression' ||
		body.type === 'ImportExpression' ||
		body.type === 'ParenthesizedExpression';
	return { start: call.start, end: call.end, text: tight ? text : `(${text})` };
}

export function stripImportedVitePreloadHelper(code: string): string {
	const helper = findImportedVitePreloadHelper(code);
	if (!helper) return code;

	const withoutImport =
		code.slice(0, helper.importStart) + helper.keptImport + code.slice(helper.importEnd);
	if (preloadStillCalled(code, withoutImport, helper)) {
		return code;
	}

	return removeInitCalls(withoutImport, helper.initFunction) ?? code;
}

// Removes argument-free calls to `name` where the compiler's scope tables resolve it to the removed import, so a
// local the minifier gave the same short name keeps its calls. Undefined when a call is left in a shape the
// removal cannot take out without changing what runs; the caller then keeps the helper.
function removeInitCalls(code: string, name: string): string | undefined {
	const calls = importedOrFreeNameCalls(code, name);
	if (!calls) return undefined;
	const sequences = new Map<object, ImportedOrFreeNameCall[]>();
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const site of calls) {
		if (site.call.argumentCount > 0) return undefined;
		if (site.parent?.type === 'SequenceExpression') {
			const list = sequences.get(site.parent) ?? [];
			list.push(site);
			sequences.set(site.parent, list);
		} else if (site.parent?.type === 'ExpressionStatement') {
			const before = code.slice(0, site.parent.start).trimEnd();
			const own = before === '' || /[;{]$/.test(before);
			edits.push({ start: site.parent.start, end: site.parent.end, text: own ? '' : ';' });
		} else return undefined;
	}
	for (const sites of sequences.values()) {
		const sequence = sites[0]!.parent!;
		const items = sequence.expressions ?? [];
		const removed = new Set(sites.map((site) => site.call.start));
		const removable = items.map(
			(item) => removed.has(item.start) && item.type === 'CallExpression',
		);
		const kept = removable.filter((value) => !value).length;
		if (kept === 0) return undefined;
		// `(init(), obj.method)()` calls the method without `obj` as `this`; a leading 0 keeps that.
		const keepsReceiver = kept === 1 && sites[0]!.parentIsInvoked;
		const valueUsed = !sites[0]!.parentValueDiscarded;
		for (let first = 0; first < items.length; first++) {
			if (!removable[first]) continue;
			let last = first;
			while (removable[last + 1]) last++;
			// The init returns undefined; a sequence whose value is read keeps that value when the init ends it.
			if (last + 1 === items.length && valueUsed)
				edits.push({ start: items[first]!.start, end: items[last]!.end, text: 'void 0' });
			else if (keepsReceiver)
				edits.push({ start: items[first]!.start, end: items[last]!.end, text: '0' });
			else if (last + 1 < items.length)
				edits.push({ start: items[first]!.start, end: items[last + 1]!.start, text: '' });
			else edits.push({ start: items[first - 1]!.end, end: items[last]!.end, text: '' });
			first = last;
		}
	}
	let next = code;
	for (const { start, end, text } of edits.sort((left, right) => right.start - left.start))
		next = next.slice(0, start) + text + next.slice(end);
	return callsImportedOrFreeName(next, name) === false ? next : undefined;
}

function findImportedVitePreloadHelper(code: string): ImportedVitePreloadHelper | undefined {
	if (!code.includes('__vitePreload') || !code.includes('init_preload_helper')) return undefined;
	for (const match of code.matchAll(IMPORT_DECLARATION_CANDIDATE_RE)) {
		const importStart = match.index ?? -1;
		if (importStart < 0) continue;

		const statement = match[0]!;
		const ast = tryParseJavaScriptModule(statement);
		const declaration = asNodes(ast?.body).find((node) => node.type === 'ImportDeclaration');
		if (!declaration) continue;

		let preloadFunction: string | undefined;
		let initFunction: string | undefined;
		const kept: string[] = [];
		const keptSpecifiers = new Set<number>();
		for (const [index, specifier] of asNodes(declaration.specifiers).entries()) {
			if (specifier.type !== 'ImportSpecifier') return undefined;

			const imported = identifierName(specifier.imported as JavaScriptAstNode | undefined);
			const local = identifierName(specifier.local as JavaScriptAstNode | undefined);
			if (!imported || !local) continue;

			if (imported === '__vitePreload') preloadFunction = local;
			else if (imported === 'init_preload_helper') initFunction = local;
			else {
				kept.push(sourceText(statement, specifier));
				keptSpecifiers.add(index);
			}
		}
		const source = declaration.source as JavaScriptAstNode | undefined;

		if (preloadFunction && initFunction) {
			return {
				importStart,
				importEnd: importStart + statement.length,
				keptImport:
					kept.length && source
						? `import{${kept.join(',')}}from${sourceText(statement, source)};`
						: '',
				preloadFunction,
				initFunction,
				keptSpecifiers,
			};
		}
	}

	return undefined;
}

function stripUnusedVitePreloadHelper(code: string): string {
	const marker = code.indexOf('vite:preloadError');
	if (marker < 0) return code;

	const helper = findVitePreloadHelperModule(code, marker);
	if (!helper) return code;

	const statementEnd =
		code[helper.removeStart] === ',' && code[helper.removeEnd - 1] === ';' ? ';' : '';
	const outsideHelper =
		code.slice(0, helper.removeStart) + statementEnd + code.slice(helper.removeEnd);
	if (hasCallableReference(outsideHelper, helper.preloadFunction)) {
		return code;
	}

	let withoutHelper: string | undefined = outsideHelper;
	const chain = findVitePreloadHelperInitChain(withoutHelper, helper.moduleVariable);
	if (chain) {
		withoutHelper = removeInitCalls(
			withoutHelper.slice(0, chain.removeStart) + withoutHelper.slice(chain.removeEnd),
			chain.entryVariable,
		);
	}

	return (withoutHelper && removeInitCalls(withoutHelper, helper.moduleVariable)) ?? code;
}

function findVitePreloadHelperModule(
	code: string,
	marker: number,
):
	| {
			readonly moduleVariable: string;
			readonly preloadFunction: string;
			readonly removeStart: number;
			readonly removeEnd: number;
	  }
	| undefined {
	const initStart = code.lastIndexOf('=e((()=>{', marker);
	if (initStart < 0) return undefined;

	const moduleVariable = readIdentifierBefore(code, initStart);
	if (!moduleVariable) return undefined;

	const bodyStart = initStart + '=e((()=>{'.length;
	const bodyEnd = findModuleInitEnd(code, initStart);
	if (bodyEnd < 0) return undefined;

	const helperBody = code.slice(bodyStart, bodyEnd);
	const preloadFunction = helperBody.match(
		/,([$A-Z_a-z][$\w]*)=function\([^)]*\)\{let\s+[$A-Z_a-z][$\w]*=Promise\.resolve\(\)/,
	)?.[1];
	if (!preloadFunction) return undefined;

	const firstHelperVariable = helperBody.match(/^([$A-Z_a-z][$\w]*)=/)?.[1];
	if (!firstHelperVariable) return undefined;

	const removeStart = findHelperDeclarationStart(code, initStart, firstHelperVariable);
	if (removeStart < 0) return undefined;

	return {
		moduleVariable,
		preloadFunction,
		removeStart,
		removeEnd: bodyEnd + '}));'.length,
	};
}

function findVitePreloadHelperInitChain(
	code: string,
	moduleVariable: string,
):
	| {
			readonly entryVariable: string;
			readonly removeStart: number;
			readonly removeEnd: number;
	  }
	| undefined {
	const chainRE = new RegExp(
		`var\\s+([$A-Z_a-z][$\\w]*)=e\\(\\(\\(\\)=>\\{${escapeRegExp(
			moduleVariable,
		)}\\(\\)\\}\\)\\),([$A-Z_a-z][$\\w]*)=e\\(\\(\\(\\)=>\\{\\1\\(\\)\\}\\)\\);`,
	);
	const match = chainRE.exec(code);
	if (!match) return undefined;

	return {
		entryVariable: match[2]!,
		removeStart: match.index,
		removeEnd: match.index + match[0].length,
	};
}

function readIdentifierBefore(code: string, index: number): string | undefined {
	let end = index;
	while (/\s/.test(code[end - 1] ?? '')) end--;
	let start = end;
	while (/[$\w]/.test(code[start - 1] ?? '')) start--;
	const value = code.slice(start, end);
	return /^[$A-Z_a-z][$\w]*$/.test(value) ? value : undefined;
}

function findModuleInitEnd(code: string, initStart: number): number {
	const end = code.indexOf('}));', initStart);
	return end;
}

function findHelperDeclarationStart(
	code: string,
	initStart: number,
	firstHelperVariable: string,
): number {
	const commaStart = code.lastIndexOf(`,${firstHelperVariable},`, initStart);
	if (commaStart >= 0) return commaStart;

	const varStart = code.lastIndexOf(`var ${firstHelperVariable},`, initStart);
	if (varStart >= 0) return varStart;

	return -1;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// hasCallableReference(withoutImport), read off the chunk's own tree when the import is a whole top-level statement.
function preloadStillCalled(
	code: string,
	withoutImport: string,
	helper: ImportedVitePreloadHelper,
): boolean {
	// No call-shaped mention before or after the removal answers without materializing either tree.
	if (
		calleeOffsets(code, helper.preloadFunction).length === 0 &&
		calleeOffsets(withoutImport, helper.preloadFunction).length === 0 &&
		parsesCleanly(code) &&
		parsesCleanly(withoutImport)
	)
		return false;
	if (parsesCleanly(code) && importIsWholeStatement(code, helper)) {
		const called = callsImportedOrFreeName(code, helper.preloadFunction);
		if (called !== undefined) return called;
	}
	const program = tryParseChunk(code);
	const body = asNodes(program?.body);
	const index = body.findIndex(
		(node) =>
			(node as { start?: unknown }).start === helper.importStart &&
			(node as { end?: unknown }).end === helper.importEnd,
	);
	const declaration = body[index];
	const previous = body[index - 1] as { end?: number } | undefined;
	if (
		!program ||
		declaration?.type !== 'ImportDeclaration' ||
		(previous !== undefined && code[(previous.end ?? 0) - 1] !== ';')
	)
		return hasCallableReference(withoutImport, helper.preloadFunction);
	const specifiers = asNodes(declaration.specifiers);
	const removed = new Set(
		specifiers.filter(
			(_, index) => helper.keptImport === '' || !helper.keptSpecifiers.has(index),
		),
	);
	return callsFreeName(code, program, helper.preloadFunction, removed);
}

// The import is a top-level statement, first or after one ending in `;`, so removing it joins nothing.
function importIsWholeStatement(code: string, helper: ImportedVitePreloadHelper): boolean {
	if (
		!parseChunkCode('chunk.js', code).module.staticImports.some(
			(entry) => entry.start === helper.importStart && entry.end === helper.importEnd,
		)
	)
		return false;
	const lines = code.slice(0, helper.importStart).split('\n');
	let last = '';
	// Whole-line comments between statements are not statements.
	while (lines.length && (last === '' || last.startsWith('//'))) last = lines.pop()!.trim();
	if (last === '' || last.startsWith('//')) return true;
	return last.endsWith(';') && !last.includes('//') && !last.includes('/*');
}

function parsesCleanly(code: string): boolean {
	try {
		return parseChunkCode('chunk.js', code).errors.length === 0;
	} catch {
		return false;
	}
}

function tryParseChunk(code: string): JavaScriptAstNode | undefined {
	try {
		const parsed = parseChunkCode('chunk.js', code);
		return parsed.errors.length ? undefined : (parsed.program as unknown as JavaScriptAstNode);
	} catch {
		return undefined;
	}
}

function hasCallableReference(code: string, name: string): boolean {
	const ast = tryParseJavaScriptModule(code);
	return ast ? callsFreeName(code, ast, name, new Set()) : true;
}

function callsFreeName(
	code: string,
	ast: JavaScriptAstNode,
	name: string,
	removedImports: ReadonlySet<JavaScriptAstNode>,
): boolean {
	let found = false;
	const offsets = calleeOffsets(code, name);
	walkReferenceScopes(ast, [], { removedImports, offsets }, (node, scopes) => {
		if (node.type !== 'CallExpression') return;
		const callee = node.callee as JavaScriptAstNode | undefined;
		if (identifierName(callee) !== name) return;
		if (isDeclaredInScope(name, scopes)) return;
		found = true;
	});
	return found;
}

// Only subtrees whose source holds a call of the name can hold a free call to it.
type ReferenceScan = {
	readonly removedImports: ReadonlySet<JavaScriptAstNode>;
	readonly offsets: readonly number[];
};

function walkReferenceScopes(
	node: JavaScriptAstNode | null | undefined,
	scopes: ReadonlyArray<ReadonlySet<string>>,
	scan: ReferenceScan,
	visit: (node: JavaScriptAstNode, scopes: ReadonlyArray<ReadonlySet<string>>) => void,
): void {
	if (!node || typeof node !== 'object') return;

	if (node.type === 'Program') {
		const scope = collectScopeDeclarations(asNodes(node.body), scan.removedImports);
		visit(node, [scope]);
		for (const child of asNodes(node.body)) {
			if (spansAnyOffset(scan.offsets, child))
				walkReferenceScopes(child, [scope], scan, visit);
		}
		return;
	}

	if (isFunctionNode(node)) {
		const scope = new Set<string>();
		collectBindingNames(node.id as JavaScriptAstNode | undefined, scope);
		for (const parameter of asNodes(node.params)) {
			collectBindingNames(parameter, scope);
		}
		const nextScopes = [...scopes, scope];
		visit(node, nextScopes);
		walkReferenceScopes(node.body as JavaScriptAstNode | undefined, nextScopes, scan, visit);
		return;
	}

	if (node.type === 'BlockStatement') {
		const scope = collectScopeDeclarations(asNodes(node.body));
		const nextScopes = [...scopes, scope];
		visit(node, nextScopes);
		for (const child of asNodes(node.body)) {
			if (spansAnyOffset(scan.offsets, child))
				walkReferenceScopes(child, nextScopes, scan, visit);
		}
		return;
	}

	visit(node, scopes);
	for (const child of childNodes(node)) {
		if (spansAnyOffset(scan.offsets, child)) walkReferenceScopes(child, scopes, scan, visit);
	}
}

function collectScopeDeclarations(
	nodes: readonly JavaScriptAstNode[],
	removedImports: ReadonlySet<JavaScriptAstNode> = new Set(),
): Set<string> {
	const declarations = new Set<string>();
	for (const node of nodes) {
		if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
			collectBindingNames(node.id as JavaScriptAstNode | undefined, declarations);
			continue;
		}
		if (node.type === 'ImportDeclaration') {
			for (const specifier of asNodes(node.specifiers)) {
				if (removedImports.has(specifier)) continue;
				collectBindingNames(specifier.local as JavaScriptAstNode | undefined, declarations);
			}
			continue;
		}
		if (node.type === 'VariableDeclaration') {
			for (const declaration of asNodes(node.declarations)) {
				collectBindingNames(declaration.id as JavaScriptAstNode | undefined, declarations);
			}
		}
	}
	return declarations;
}

function collectBindingNames(node: JavaScriptAstNode | null | undefined, names: Set<string>): void {
	if (!node) return;
	const name = identifierName(node);
	if (name) {
		names.add(name);
		return;
	}
	for (const child of childNodes(node)) {
		collectBindingNames(child, names);
	}
}

function isDeclaredInScope(name: string, scopes: ReadonlyArray<ReadonlySet<string>>): boolean {
	return scopes.some((scope) => scope.has(name));
}

function isFunctionNode(node: JavaScriptAstNode): boolean {
	return (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	);
}

function sourceText(code: string, node: JavaScriptAstNode): string {
	const { start, end } = node as unknown as { start: number; end: number };
	return code.slice(start, end);
}

// The compiler's parser builds the same tree as Rolldown's without its JSON round trip, and throws where Rolldown reports errors.
function tryParseJavaScriptModule(code: string): JavaScriptAstNode | undefined {
	try {
		return parseJavaScriptModule(code, 'chunk.js');
	} catch {
		return undefined;
	}
}

function childNodes(node: JavaScriptAstNode): JavaScriptAstNode[] {
	const children: JavaScriptAstNode[] = [];
	for (const key in node) {
		const value = (node as Record<string, unknown>)[key];
		if (ignoredAstKeys.has(key)) continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (isAstNode(item)) children.push(item);
			}
			continue;
		}
		if (isAstNode(value)) children.push(value);
	}
	return children;
}

function asNodes(value: unknown): JavaScriptAstNode[] {
	return Array.isArray(value) ? value.filter(isAstNode) : [];
}

function isAstNode(value: unknown): value is JavaScriptAstNode {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as JavaScriptAstNode).type === 'string'
	);
}

function identifierName(node: JavaScriptAstNode | null | undefined): string | undefined {
	return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : undefined;
}

const ignoredAstKeys = new Set([
	'closingElement',
	'id',
	'leadingComments',
	'loc',
	'metadata',
	'openingElement',
	'parent',
	'range',
	'trailingComments',
]);
