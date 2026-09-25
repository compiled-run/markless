import type { JavaScriptAstNode } from '@markless/compiler';
import { basename, dirname, join } from 'pathe';
import { parseChunkCode } from './chunk-ast.ts';

export type PreloadHelperChunk = {
	readonly fileName: string;
	code: string;
	imports?: string[];
};

type Node = JavaScriptAstNode & { readonly start: number; readonly end: number };
type Edit = { readonly start: number; readonly end: number; readonly text: string };
type Reference = { readonly node: Node; readonly parents: readonly Node[] };
type HelperExport = 'init' | 'preload';
type ChunkRewrite = { readonly code: string; readonly droppedImport: boolean };

// Empty preload wrappers are stripped per chunk; this drops the then-unused helper, its inits and imports bundle-wide, or changes nothing.
export function stripUnusedVitePreloadHelperFromBundle(
	chunks: readonly PreloadHelperChunk[],
): void {
	for (const helperChunk of chunks) {
		if (!helperChunk.code.includes('vite:preloadError')) continue;
		const rewrites = planHelperRemoval(helperChunk, chunks);
		if (!rewrites) continue;
		for (const [chunk, rewrite] of rewrites) {
			chunk.code = rewrite.code;
			if (rewrite.droppedImport && Array.isArray(chunk.imports)) {
				chunk.imports = chunk.imports.filter(
					(fileName) => fileName !== helperChunk.fileName,
				);
			}
		}
	}
}

function planHelperRemoval(
	helperChunk: PreloadHelperChunk,
	chunks: readonly PreloadHelperChunk[],
): Map<PreloadHelperChunk, ChunkRewrite> | undefined {
	const code = helperChunk.code;
	const program = parse(code);
	if (!program) return undefined;
	const helper = findHelperModule(program, code, code.indexOf('vite:preloadError'));
	if (!helper) return undefined;

	const edits: Edit[] = [...helper.removals];
	const exported = new Map<string, HelperExport>();
	const removedLocals = new Set([helper.initName, ...helper.helperVars]);
	for (const statement of asNodes(program.body)) {
		if (statement.type !== 'ExportNamedDeclaration') continue;
		if (statement.source) return undefined;
		if (statement.declaration) {
			const declared = new Set<string>();
			collectBindingNames((statement.declaration as Node).id as Node | undefined, declared);
			for (const declarator of asNodes((statement.declaration as Node).declarations))
				collectBindingNames(declarator.id as Node, declared);
			if ([...declared].some((name) => removedLocals.has(name))) return undefined;
			continue;
		}
		const specifiers = asNodes(statement.specifiers);
		const removed = new Set<Node>();
		for (const specifier of specifiers) {
			const local = moduleExportName(specifier.local as Node);
			if (local === undefined || !removedLocals.has(local)) continue;
			if (local !== helper.initName && local !== helper.preloadName) return undefined;
			exported.set(
				moduleExportName(specifier.exported as Node)!,
				local === helper.initName ? 'init' : 'preload',
			);
			removed.add(specifier);
		}
		edits.push(...listRemoval(code, statement, specifiers, removed));
	}

	const initCalls: Reference[] = [];
	for (const [name, found] of freeReferences(program, removedLocals)) {
		for (const reference of found) {
			if (insideAny(reference.node, helper.removals)) continue;
			if (reference.parents.at(-1)?.type === 'ExportSpecifier') continue;
			if (name !== helper.initName) return undefined;
			initCalls.push(reference);
		}
	}
	const callEdits = initCallRemovals(initCalls);
	if (!callEdits) return undefined;
	const helperCode = applyEdits(code, [...edits, ...callEdits]);
	if (helperCode === undefined) return undefined;

	const rewrites = new Map<PreloadHelperChunk, ChunkRewrite>();
	rewrites.set(helperChunk, { code: helperCode, droppedImport: false });
	if (exported.size === 0) return rewrites;

	const helperBase = basename(helperChunk.fileName);
	for (const chunk of chunks) {
		if (chunk === helperChunk || !chunk.code.includes(helperBase)) continue;
		const rewrite = rewriteImporter(chunk, helperChunk.fileName, exported);
		if (rewrite === false) return undefined;
		if (rewrite) rewrites.set(chunk, rewrite);
	}
	return rewrites;
}

type HelperModule = {
	readonly initName: string;
	readonly preloadName: string;
	readonly helperVars: readonly string[];
	readonly removals: readonly Edit[];
};

// `var a,p;function i(){return(i=esm((()=>{a=..,p=function(){..}})))()}` or the older `var a,p,i=esm(..)`.
function findHelperModule(program: Node, code: string, marker: number): HelperModule | undefined {
	let found: { readonly assignment: Node; readonly parents: readonly Node[] } | undefined;
	walk(program, [], (node, parents) => {
		if (found || node.type !== 'AssignmentExpression') return;
		const right = node.right as Node;
		if (right?.type !== 'FunctionExpression' || marker < right.start || marker > right.end)
			return;
		if ((node.left as Node).type !== 'Identifier') return;
		found = { assignment: node, parents: [...parents] };
	});
	if (!found) return undefined;

	const parents = [...found.parents];
	let cursor = parents.pop();
	const assignments =
		cursor?.type === 'SequenceExpression' ? asNodes(cursor.expressions) : [found.assignment];
	if (cursor?.type === 'SequenceExpression') cursor = parents.pop();
	if (cursor?.type !== 'ExpressionStatement') return undefined;
	const block = parents.pop();
	if (block?.type !== 'BlockStatement' || asNodes(block.body).length !== 1) return undefined;
	const arrow = parents.pop();
	if (arrow?.type !== 'ArrowFunctionExpression' || asNodes(arrow.params).length > 0)
		return undefined;
	const call = skipParens(parents);
	if (call?.type !== 'CallExpression' || asNodes(call.arguments).length !== 1) return undefined;

	const helperVars: string[] = [];
	for (const assignment of assignments) {
		const name =
			assignment.type === 'AssignmentExpression' && assignment.operator === '='
				? identifierName(assignment.left as Node)
				: undefined;
		if (!name) return undefined;
		helperVars.push(name);
	}
	const preloadName = identifierName(found.assignment.left as Node)!;

	const owner = skipParens(parents);
	let initName: string | undefined;
	let initDeclarator: Node | undefined;
	const removals: Edit[] = [];
	if (owner?.type === 'AssignmentExpression') {
		initName = identifierName(owner.left as Node);
		const invoke = skipParens(parents);
		const returned = parents.pop();
		const body = parents.pop();
		const declaration = parents.pop();
		if (
			invoke?.type !== 'CallExpression' ||
			asNodes(invoke.arguments).length > 0 ||
			returned?.type !== 'ReturnStatement' ||
			body?.type !== 'BlockStatement' ||
			asNodes(body.body).length !== 1 ||
			declaration?.type !== 'FunctionDeclaration' ||
			asNodes(declaration.params).length > 0 ||
			identifierName(declaration.id as Node) !== initName ||
			parents.at(-1)?.type !== 'Program'
		)
			return undefined;
		removals.push({ start: declaration.start, end: declaration.end, text: '' });
	} else if (owner?.type === 'VariableDeclarator') {
		initName = identifierName(owner.id as Node);
		initDeclarator = owner;
		if (parents.pop()?.type !== 'VariableDeclaration' || parents.at(-1)?.type !== 'Program')
			return undefined;
	}
	if (!initName) return undefined;

	const declared = new Set<string>();
	for (const statement of asNodes(program.body)) {
		if (statement.type !== 'VariableDeclaration') continue;
		const declarators = asNodes(statement.declarations);
		const removed = new Set<Node>();
		for (const declarator of declarators) {
			const name = identifierName(declarator.id as Node);
			if (declarator === initDeclarator) removed.add(declarator);
			else if (name !== undefined && helperVars.includes(name) && !declarator.init) {
				removed.add(declarator);
				declared.add(name);
			}
		}
		removals.push(...listRemoval(code, statement, declarators, removed));
	}
	if (helperVars.some((name) => !declared.has(name))) return undefined;
	return { initName, preloadName, helperVars, removals };
}

// false: an import of the helper this pass cannot rewrite, so nothing is removed anywhere.
function rewriteImporter(
	chunk: PreloadHelperChunk,
	helperFileName: string,
	exported: ReadonlyMap<string, HelperExport>,
): ChunkRewrite | undefined | false {
	const program = parse(chunk.code);
	if (!program) return false;
	const helperBase = basename(helperFileName);
	const resolvesToHelper = (source: Node | null | undefined): boolean | undefined => {
		const specifier = source?.type === 'Literal' ? source.value : undefined;
		if (typeof specifier !== 'string' || basename(specifier) !== helperBase) return false;
		if (!specifier.startsWith('.')) return undefined;
		return join(dirname(chunk.fileName), specifier) === helperFileName;
	};

	const edits: Edit[] = [];
	const locals = new Map<string, HelperExport>();
	let droppedImport = false;
	for (const statement of asNodes(program.body)) {
		if (
			statement.type === 'ExportAllDeclaration' ||
			statement.type === 'ExportNamedDeclaration'
		) {
			if (resolvesToHelper(statement.source as Node | null) !== false) return false;
			continue;
		}
		if (statement.type !== 'ImportDeclaration') continue;
		const target = resolvesToHelper(statement.source as Node);
		if (target === undefined) return false;
		if (!target) continue;
		const specifiers = asNodes(statement.specifiers);
		const removed = new Set<Node>();
		for (const specifier of specifiers) {
			if (specifier.type !== 'ImportSpecifier') return false;
			const role = exported.get(moduleExportName(specifier.imported as Node) ?? '');
			if (!role) continue;
			locals.set(identifierName(specifier.local as Node)!, role);
			removed.add(specifier);
		}
		if (removed.size > 0 && removed.size === specifiers.length) droppedImport = true;
		edits.push(...listRemoval(chunk.code, statement, specifiers, removed));
	}

	let unsafeDynamicImport = false;
	walk(program, [], (node, parents) => {
		if (node.type !== 'ImportExpression' || unsafeDynamicImport) return;
		const target = resolvesToHelper(node.source as Node);
		if (target === false) return;
		unsafeDynamicImport = target === undefined || readsRemovedExport(parents, exported);
	});
	if (unsafeDynamicImport) return false;
	if (locals.size === 0) return undefined;

	const initCalls: Reference[] = [];
	for (const [name, found] of freeReferences(program, new Set(locals.keys()))) {
		if (found.length > 0 && locals.get(name) !== 'init') return false;
		initCalls.push(...found);
	}
	const callEdits = initCallRemovals(initCalls);
	if (!callEdits) return false;
	const next = applyEdits(chunk.code, [...edits, ...callEdits]);
	return next === undefined ? false : { code: next, droppedImport };
}

// `import(helper).then((ns) => ns.x)` may read only exports this pass keeps.
function readsRemovedExport(
	parents: readonly Node[],
	exported: ReadonlyMap<string, HelperExport>,
): boolean {
	const member = parents.at(-1);
	const call = parents.at(-2);
	if (
		member?.type !== 'MemberExpression' ||
		member.computed ||
		identifierName(member.property as Node) !== 'then' ||
		call?.type !== 'CallExpression' ||
		call.callee !== member
	)
		return true;
	const callback = asNodes(call.arguments)[0];
	const params = asNodes(callback?.params);
	if (callback?.type !== 'ArrowFunctionExpression' || params.length !== 1) return true;
	const namespace = identifierName(params[0]!);
	if (!namespace) return true;
	for (const [, found] of freeReferences(callback.body as Node, new Set([namespace]))) {
		for (const reference of found) {
			const parent = reference.parents.at(-1);
			const property =
				parent?.type === 'MemberExpression' &&
				!parent.computed &&
				parent.object === reference.node
					? identifierName(parent.property as Node)
					: undefined;
			if (property === undefined || exported.has(property)) return true;
		}
	}
	return false;
}

function initCallRemovals(references: readonly Reference[]): Edit[] | undefined {
	const bySequence = new Map<Node, { readonly statement: Node[]; readonly calls: Set<Node> }>();
	const edits: Edit[] = [];
	for (const reference of references) {
		const parents = [...reference.parents];
		const call = parents.pop();
		if (
			call?.type !== 'CallExpression' ||
			call.callee !== reference.node ||
			call.optional ||
			asNodes(call.arguments).length > 0
		)
			return undefined;
		const parent = parents.pop();
		if (parent?.type === 'SequenceExpression') {
			const entry = bySequence.get(parent) ?? { statement: [...parents], calls: new Set() };
			entry.calls.add(call);
			bySequence.set(parent, entry);
			continue;
		}
		if (parent?.type !== 'ExpressionStatement') return undefined;
		const removal = statementRemoval(parent, parents.at(-1));
		if (!removal) return undefined;
		edits.push(removal);
	}
	for (const [sequence, { statement, calls }] of bySequence) {
		const expressions = asNodes(sequence.expressions);
		if (calls.size < expressions.length) {
			edits.push(...commaListRemovals(expressions, calls));
			continue;
		}
		const holder = statement.at(-1);
		if (holder?.type !== 'ExpressionStatement') return undefined;
		const removal = statementRemoval(holder, statement.at(-2));
		if (!removal) return undefined;
		edits.push(removal);
	}
	return edits;
}

function statementRemoval(statement: Node, container: Node | undefined): Edit | undefined {
	if (container?.type !== 'BlockStatement' && container?.type !== 'Program') return undefined;
	return { start: statement.start, end: statement.end, text: '' };
}

function listRemoval(
	code: string,
	statement: Node,
	items: readonly Node[],
	removed: ReadonlySet<Node>,
): Edit[] {
	if (removed.size === 0) return [];
	if (removed.size < items.length) return commaListRemovals(items, removed);
	const end = code[statement.end] === ';' ? statement.end + 1 : statement.end;
	return [{ start: statement.start, end, text: '' }];
}

function commaListRemovals(items: readonly Node[], removed: ReadonlySet<Node>): Edit[] {
	const edits: Edit[] = [];
	for (let index = 0; index < items.length; index++) {
		if (!removed.has(items[index]!)) continue;
		let last = index;
		while (last + 1 < items.length && removed.has(items[last + 1]!)) last++;
		edits.push(
			last + 1 < items.length
				? { start: items[index]!.start, end: items[last + 1]!.start, text: '' }
				: { start: items[index - 1]!.end, end: items[last]!.end, text: '' },
		);
		index = last;
	}
	return edits;
}

function applyEdits(code: string, edits: readonly Edit[]): string | undefined {
	const ordered = [...edits].sort((left, right) => right.start - left.start);
	let next = code;
	let floor = Number.POSITIVE_INFINITY;
	for (const edit of ordered) {
		if (edit.end > floor) return undefined;
		next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
		floor = edit.start;
	}
	return parse(next) ? next : undefined;
}

function insideAny(node: Node, ranges: readonly Edit[]): boolean {
	return ranges.some((range) => node.start >= range.start && node.end <= range.end);
}

function skipParens(parents: Node[]): Node | undefined {
	let node = parents.pop();
	while (node?.type === 'ParenthesizedExpression') node = parents.pop();
	return node;
}

function freeReferences(root: Node, names: ReadonlySet<string>): Map<string, Reference[]> {
	const found = new Map<string, Reference[]>();
	const scopes: Set<string>[] = [];
	const visit = (node: Node, parents: Node[]): void => {
		const scope = declaredIn(node);
		if (scope) scopes.push(scope);
		if (node.type === 'Identifier') {
			const name = node.name as string;
			if (
				names.has(name) &&
				isReference(node, parents.at(-1)) &&
				!scopes.some((declared) => declared.has(name))
			) {
				const list = found.get(name) ?? [];
				list.push({ node, parents: [...parents] });
				found.set(name, list);
			}
		}
		parents.push(node);
		for (const child of childNodes(node)) {
			if (isBindingSlot(node, child)) visitPattern(child, parents);
			else visit(child, parents);
		}
		parents.pop();
		if (scope) scopes.pop();
	};
	// Binding identifiers are declarations, but defaults and computed keys inside a pattern are reads.
	const visitPattern = (pattern: Node, parents: Node[]): void => {
		parents.push(pattern);
		if (pattern.type === 'AssignmentPattern') {
			visitPattern(pattern.left as Node, parents);
			visit(pattern.right as Node, parents);
		} else if (pattern.type === 'ArrayPattern') {
			for (const element of asNodes(pattern.elements)) visitPattern(element, parents);
		} else if (pattern.type === 'ObjectPattern') {
			for (const property of asNodes(pattern.properties)) {
				if (property.type === 'RestElement') {
					visitPattern(property.argument as Node, parents);
					continue;
				}
				if (property.computed) visit(property.key as Node, parents);
				visitPattern(property.value as Node, parents);
			}
		} else if (pattern.type === 'RestElement') {
			visitPattern(pattern.argument as Node, parents);
		} else if (pattern.type !== 'Identifier') {
			parents.pop();
			visit(pattern, parents);
			return;
		}
		parents.pop();
	};
	visit(root, []);
	return found;
}

function isBindingSlot(node: Node, child: Node): boolean {
	switch (node.type) {
		case 'VariableDeclarator':
			return child === node.id;
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			return child === node.id || asNodes(node.params).includes(child);
		case 'ClassDeclaration':
		case 'ClassExpression':
			return child === node.id;
		case 'CatchClause':
			return child === node.param;
		default:
			return false;
	}
}

function isReference(node: Node, parent: Node | undefined): boolean {
	if (!parent) return true;
	switch (parent.type) {
		case 'MemberExpression':
			return parent.object === node || parent.computed === true;
		case 'Property':
		case 'MethodDefinition':
		case 'PropertyDefinition':
			return parent.key !== node || parent.computed === true;
		case 'LabeledStatement':
		case 'BreakStatement':
		case 'ContinueStatement':
			return false;
		case 'ExportSpecifier':
			return parent.local === node;
		case 'ImportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
			return false;
		default:
			return true;
	}
}

function declaredIn(node: Node): Set<string> | undefined {
	switch (node.type) {
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression': {
			const names = new Set<string>();
			if (node.type === 'FunctionExpression') collectBindingNames(node.id as Node, names);
			for (const param of asNodes(node.params)) collectBindingNames(param, names);
			collectVarNames(node.body as Node, names);
			return names;
		}
		case 'ClassExpression': {
			const names = new Set<string>();
			collectBindingNames(node.id as Node, names);
			return names;
		}
		case 'BlockStatement':
		case 'StaticBlock':
			return lexicalNames(asNodes(node.body));
		case 'SwitchStatement':
			return lexicalNames(asNodes(node.cases).flatMap((item) => asNodes(item.consequent)));
		case 'ForStatement':
		case 'ForInStatement':
		case 'ForOfStatement': {
			const head = (node.type === 'ForStatement' ? node.init : node.left) as Node | undefined;
			return head?.type === 'VariableDeclaration' ? lexicalNames([head]) : undefined;
		}
		case 'CatchClause': {
			const names = new Set<string>();
			collectBindingNames(node.param as Node, names);
			return names;
		}
		default:
			return undefined;
	}
}

function lexicalNames(statements: readonly Node[]): Set<string> {
	const names = new Set<string>();
	for (const statement of statements) {
		if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
			for (const declarator of asNodes(statement.declarations))
				collectBindingNames(declarator.id as Node, names);
		} else if (
			statement.type === 'FunctionDeclaration' ||
			statement.type === 'ClassDeclaration'
		) {
			collectBindingNames(statement.id as Node, names);
		}
	}
	return names;
}

function collectVarNames(node: Node | undefined, names: Set<string>): void {
	if (!node) return;
	if (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	)
		return;
	if (node.type === 'VariableDeclaration' && node.kind === 'var') {
		for (const declarator of asNodes(node.declarations))
			collectBindingNames(declarator.id as Node, names);
	}
	for (const child of childNodes(node)) collectVarNames(child, names);
}

function collectBindingNames(pattern: Node | null | undefined, names: Set<string>): void {
	if (!pattern) return;
	switch (pattern.type) {
		case 'Identifier':
			names.add(pattern.name as string);
			return;
		case 'AssignmentPattern':
			collectBindingNames(pattern.left as Node, names);
			return;
		case 'RestElement':
			collectBindingNames(pattern.argument as Node, names);
			return;
		case 'ArrayPattern':
			for (const element of asNodes(pattern.elements)) collectBindingNames(element, names);
			return;
		case 'ObjectPattern':
			for (const property of asNodes(pattern.properties))
				collectBindingNames(
					(property.type === 'RestElement' ? property.argument : property.value) as Node,
					names,
				);
			return;
	}
}

function walk(
	node: Node,
	parents: Node[],
	visit: (node: Node, parents: readonly Node[]) => void,
): void {
	visit(node, parents);
	parents.push(node);
	for (const child of childNodes(node)) walk(child, parents, visit);
	parents.pop();
}

function parse(code: string): Node | undefined {
	try {
		const parsed = parseChunkCode('chunk.js', code);
		if (parsed.errors.length) return undefined;
		const program = parsed.program as unknown as Node;
		return program;
	} catch {
		return undefined;
	}
}

function childNodes(node: Node): Node[] {
	const children: Node[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parent') continue;
		if (Array.isArray(value)) {
			for (const item of value) if (isNode(item)) children.push(item);
		} else if (isNode(value)) {
			children.push(value);
		}
	}
	return children;
}

function asNodes(value: unknown): Node[] {
	return Array.isArray(value) ? value.filter(isNode) : [];
}

function isNode(value: unknown): value is Node {
	return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
}

function identifierName(node: Node | null | undefined): string | undefined {
	return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : undefined;
}

function moduleExportName(node: Node | null | undefined): string | undefined {
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	return identifierName(node);
}
