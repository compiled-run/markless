import { parseJavaScriptModule, type JavaScriptAstNode } from '@arcade/compiler';

export function stripEmptyVitePreloadWrappers(code: string): string {
	const withoutDirectImports = stripDirectEmptyPreloadWrappers(code);
	const withoutAsyncLoaders = stripAsyncEmptyPreloadWrappers(withoutDirectImports);
	return stripImportedVitePreloadHelper(stripUnusedVitePreloadHelper(withoutAsyncLoaders));
}

type ImportedVitePreloadHelper = {
	readonly importStart: number;
	readonly importEnd: number;
	readonly preloadFunction: string;
	readonly initFunction: string;
};

const IMPORT_DECLARATION_CANDIDATE_RE = /\bimport\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g;

function stripDirectEmptyPreloadWrappers(code: string): string {
	let next = '';
	let cursor = 0;
	let changed = false;
	const wrapperRE = /\b[$A-Z_a-z][$\w]*\(\(\)\s*=>\s*/g;

	for (let match = wrapperRE.exec(code); match; match = wrapperRE.exec(code)) {
		const callStart = match.index;
		const bodyStart = match.index + match[0]!.length;
		if (!code.startsWith('import(', bodyStart)) continue;

		const wrapper = findEmptyPreloadWrapper(code, callStart, bodyStart);
		if (!wrapper) continue;

		next += code.slice(cursor, callStart);
		next += code.slice(bodyStart, wrapper.firstArgumentEnd);
		cursor = wrapper.callEnd + 1;
		wrapperRE.lastIndex = cursor;
		changed = true;
	}

	if (!changed) return code;
	return next + code.slice(cursor);
}

function stripAsyncEmptyPreloadWrappers(code: string): string {
	let next = '';
	let cursor = 0;
	let changed = false;
	const wrapperRE = /\b[$A-Z_a-z][$\w]*\(\s*async\s*\(\)\s*=>\s*\{/g;

	for (let match = wrapperRE.exec(code); match; match = wrapperRE.exec(code)) {
		const callStart = match.index;
		const callOpen = code.indexOf('(', callStart);
		if (callOpen < 0) continue;

		const firstArgumentEnd = findTopLevelComma(code, callOpen + 1);
		if (firstArgumentEnd < 0) continue;

		const wrapper = findEmptyPreloadWrapper(code, callStart, callOpen + 1);
		if (!wrapper) continue;

		const loader = code.slice(callOpen + 1, firstArgumentEnd);
		next += code.slice(cursor, callStart);
		next += `(${loader})()`;
		cursor = wrapper.callEnd + 1;
		wrapperRE.lastIndex = cursor;
		changed = true;
	}

	if (!changed) return code;
	return next + code.slice(cursor);
}

function findEmptyPreloadWrapper(
	code: string,
	callStart: number,
	bodyStart: number,
): { readonly firstArgumentEnd: number; readonly callEnd: number } | undefined {
	const callOpen = code.indexOf('(', callStart);
	if (callOpen < 0 || callOpen >= bodyStart) return undefined;

	const firstArgumentEnd = findTopLevelComma(code, callOpen + 1);
	if (firstArgumentEnd < 0) return undefined;

	let cursor = skipSpaces(code, firstArgumentEnd + 1);
	if (code[cursor] !== '[' || code[cursor + 1] !== ']') return undefined;
	cursor = skipSpaces(code, cursor + 2);

	if (code[cursor] === ')') {
		return { firstArgumentEnd, callEnd: cursor };
	}

	if (code[cursor] !== ',') return undefined;
	cursor = skipSpaces(code, cursor + 1);
	if (!code.startsWith('import.meta.url', cursor)) return undefined;
	cursor = skipSpaces(code, cursor + 'import.meta.url'.length);
	if (code[cursor] !== ')') return undefined;

	return { firstArgumentEnd, callEnd: cursor };
}

function findTopLevelComma(code: string, start: number): number {
	let depth = 1;
	let quote: string | null = null;
	let escaped = false;

	for (let index = start; index < code.length; index++) {
		const char = code[index]!;
		if (quote) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			depth++;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth--;
			if (depth === 0) return -1;
			continue;
		}
		if (char === ',' && depth === 1) return index;
	}

	return -1;
}

function skipSpaces(code: string, start: number): number {
	let cursor = start;
	while (/\s/.test(code[cursor] ?? '')) cursor++;
	return cursor;
}

function stripImportedVitePreloadHelper(code: string): string {
	const helper = findImportedVitePreloadHelper(code);
	if (!helper) return code;

	const withoutImport = code.slice(0, helper.importStart) + code.slice(helper.importEnd);
	if (hasCallableReference(withoutImport, helper.preloadFunction)) {
		return code;
	}

	const initCall = `${escapeRegExp(helper.initFunction)}\\(\\)`;
	return withoutImport
		.replace(new RegExp(String.raw`,${initCall},`, 'g'), ',')
		.replace(new RegExp(String.raw`\{${initCall},`, 'g'), '{')
		.replace(new RegExp(String.raw`,${initCall}\}`, 'g'), '}')
		.replace(new RegExp(String.raw`\{${initCall}\}`, 'g'), '{}');
}

function findImportedVitePreloadHelper(code: string): ImportedVitePreloadHelper | undefined {
	for (const match of code.matchAll(IMPORT_DECLARATION_CANDIDATE_RE)) {
		const importStart = match.index ?? -1;
		if (importStart < 0) continue;

		const statement = match[0]!;
		const ast = tryParseJavaScriptModule(statement);
		const declaration = asNodes(ast?.body).find((node) => node.type === 'ImportDeclaration');
		if (!declaration) continue;

		let preloadFunction: string | undefined;
		let initFunction: string | undefined;
		for (const specifier of asNodes(declaration.specifiers)) {
			if (specifier.type !== 'ImportSpecifier') continue;

			const imported = identifierName(specifier.imported as JavaScriptAstNode | undefined);
			const local = identifierName(specifier.local as JavaScriptAstNode | undefined);
			if (!imported || !local) continue;

			if (imported === '__vitePreload') preloadFunction = local;
			if (imported === 'init_preload_helper') initFunction = local;
		}

		if (preloadFunction && initFunction) {
			return {
				importStart,
				importEnd: importStart + statement.length,
				preloadFunction,
				initFunction,
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

	let withoutHelper = outsideHelper;
	const chain = findVitePreloadHelperInitChain(withoutHelper, helper.moduleVariable);
	if (chain) {
		withoutHelper = removeInitCall(
			withoutHelper.slice(0, chain.removeStart) + withoutHelper.slice(chain.removeEnd),
			chain.entryVariable,
		);
	}

	return removeInitCall(withoutHelper, helper.moduleVariable);
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

function removeInitCall(code: string, entryVariable: string): string {
	return code
		.replace(new RegExp(`,${escapeRegExp(entryVariable)}\\(\\)`), '')
		.replace(new RegExp(`${escapeRegExp(entryVariable)}\\(\\),`), '')
		.replace(new RegExp(`\\{${escapeRegExp(entryVariable)}\\(\\)\\}`), '{}');
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

function hasCallableReference(code: string, name: string): boolean {
	const ast = tryParseJavaScriptModule(code);
	if (!ast) return true;

	let found = false;
	walkReferenceScopes(ast, [], (node, scopes) => {
		if (node.type !== 'CallExpression') return;
		const callee = node.callee as JavaScriptAstNode | undefined;
		if (identifierName(callee) !== name) return;
		if (isDeclaredInScope(name, scopes)) return;
		found = true;
	});
	return found;
}

function walkReferenceScopes(
	node: JavaScriptAstNode | null | undefined,
	scopes: ReadonlyArray<ReadonlySet<string>>,
	visit: (node: JavaScriptAstNode, scopes: ReadonlyArray<ReadonlySet<string>>) => void,
): void {
	if (!node || typeof node !== 'object') return;

	if (node.type === 'Program') {
		const scope = collectScopeDeclarations(asNodes(node.body));
		visit(node, [scope]);
		for (const child of asNodes(node.body)) {
			walkReferenceScopes(child, [scope], visit);
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
		walkReferenceScopes(node.body as JavaScriptAstNode | undefined, nextScopes, visit);
		return;
	}

	if (node.type === 'BlockStatement') {
		const scope = collectScopeDeclarations(asNodes(node.body));
		const nextScopes = [...scopes, scope];
		visit(node, nextScopes);
		for (const child of asNodes(node.body)) {
			walkReferenceScopes(child, nextScopes, visit);
		}
		return;
	}

	visit(node, scopes);
	for (const child of childNodes(node)) {
		walkReferenceScopes(child, scopes, visit);
	}
}

function collectScopeDeclarations(nodes: readonly JavaScriptAstNode[]): Set<string> {
	const declarations = new Set<string>();
	for (const node of nodes) {
		if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
			collectBindingNames(node.id as JavaScriptAstNode | undefined, declarations);
			continue;
		}
		if (node.type === 'ImportDeclaration') {
			for (const specifier of asNodes(node.specifiers)) {
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

function tryParseJavaScriptModule(code: string): JavaScriptAstNode | undefined {
	try {
		return parseJavaScriptModule(code);
	} catch {
		return undefined;
	}
}

function childNodes(node: JavaScriptAstNode): JavaScriptAstNode[] {
	const children: JavaScriptAstNode[] = [];
	for (const [key, value] of Object.entries(node)) {
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
