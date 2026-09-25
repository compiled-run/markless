import { RolldownMagicString, type Plugin } from 'rolldown';
import { parseChunkCode } from './chunk-ast.ts';

// Top-level statements of a pack run when it evaluates, even for modules it only declares. Two
// rewrites shrink them: namespace objects are built on first read, and bare `var` lists merge.

type Syntax = { type?: string; start: number; end: number; [key: string]: unknown };
type Edit = { readonly start: number; readonly end: number; readonly source: string };

const NAMESPACE_HELPER = '__exportAll';

export function lazyNamespaceObjects(fileName: string, code: string): Edit[] {
	if (!code.includes(NAMESPACE_HELPER)) return [];
	const parsed = parseChunkCode(fileName, code);
	if (parsed.errors.length) return [];
	const body = parsed.program.body as unknown as Syntax[];
	const helpers = new Set<string>();
	const exported = new Set<string>();
	for (const node of body) {
		if (node.type === 'ImportDeclaration')
			for (const specifier of node.specifiers as Syntax[]) {
				const imported = specifier.imported as Syntax | undefined;
				if (
					specifier.type === 'ImportSpecifier' &&
					(imported?.name ?? imported?.value) === NAMESPACE_HELPER
				)
					helpers.add((specifier.local as Syntax).name as string);
			}
		else if (node.type === 'ExportNamedDeclaration') {
			const declaration = node.declaration as Syntax | null;
			if (declaration?.type === 'VariableDeclaration')
				for (const declarator of declaration.declarations as Syntax[])
					exported.add(((declarator.id as Syntax).name as string) ?? '');
			else if (declaration)
				exported.add(((declaration.id as Syntax | null)?.name as string) ?? '');
			for (const specifier of node.specifiers as Syntax[])
				exported.add(
					((specifier.local as Syntax).name ??
						(specifier.local as Syntax).value) as string,
				);
		} else if (node.type === 'ExportDefaultDeclaration' || node.type === 'ExportAllDeclaration')
			return [];
	}
	for (const node of body)
		for (const declarator of declaratorsOf(node))
			if (
				(declarator.id as Syntax).name === NAMESPACE_HELPER &&
				(declarator.init as Syntax | null)?.type === 'ArrowFunctionExpression'
			)
				helpers.add(NAMESPACE_HELPER);
	if (!helpers.size) return [];

	const candidates = new Map<string, Syntax>();
	for (const node of body) {
		if (node.type !== 'VariableDeclaration' || node.kind !== 'var') continue;
		const declarations = node.declarations as Syntax[];
		if (declarations.length !== 1) continue;
		const declarator = declarations[0]!;
		const id = declarator.id as Syntax;
		const init = declarator.init as Syntax | null;
		if (
			id.type !== 'Identifier' ||
			init?.type !== 'CallExpression' ||
			(init.callee as Syntax).type !== 'Identifier' ||
			!helpers.has((init.callee as Syntax).name as string) ||
			exported.has(id.name as string)
		)
			continue;
		candidates.set(id.name as string, node);
	}
	if (!candidates.size) return [];

	const bindings = new Map<string, number>();
	const references = new Map<string, { node: Syntax; shorthand?: Syntax }[]>();
	const names = new Set<string>();
	const written = new Set<string>();
	walk(parsed.program as unknown as Syntax, (node, parent, grandparent) => {
		if (node.type !== 'Identifier') return;
		const name = node.name as string;
		names.add(name);
		if (!candidates.has(name)) return;
		if (isWrite(node, parent, grandparent)) written.add(name);
		else if (isBinding(node, parent)) bindings.set(name, (bindings.get(name) ?? 0) + 1);
		else if (isReference(node, parent)) {
			const list = references.get(name) ?? [];
			list.push({
				node,
				...(parent?.type === 'Property' && parent.shorthand ? { shorthand: parent } : {}),
			});
			references.set(name, list);
		}
	});

	const edits: Edit[] = [];
	for (const [name, declaration] of candidates) {
		// A second binding of the name anywhere would make a reference ambiguous without scope analysis.
		if (bindings.get(name) !== 1 || written.has(name)) continue;
		let getter = `${name}$namespace`;
		for (let attempt = 1; names.has(getter); attempt++) getter = `${name}$namespace${attempt}`;
		names.add(getter);
		const declarator = (declaration.declarations as Syntax[])[0]!;
		const init = declarator.init as Syntax;
		edits.push({
			start: declaration.start,
			end: declaration.end,
			source: `function ${getter}(){return ${getter}.value||(${getter}.value=${code.slice(init.start, init.end)})}`,
		});
		for (const reference of references.get(name) ?? [])
			edits.push(
				reference.shorthand
					? {
							start: reference.shorthand.start,
							end: reference.shorthand.end,
							source: `${name}:${getter}()`,
						}
					: {
							start: reference.node.start,
							end: reference.node.end,
							source: `${getter}()`,
						},
			);
	}
	return edits;
}

// `var a;var b;` -> `var a,b;` at the first: declarations without initializers hoist either way.
export function mergedBareVarDeclarations(fileName: string, code: string): Edit[] {
	const parsed = parseChunkCode(fileName, code);
	if (parsed.errors.length) return [];
	const bare = (parsed.program.body as unknown as Syntax[]).filter(
		(node) =>
			node.type === 'VariableDeclaration' &&
			node.kind === 'var' &&
			(node.declarations as Syntax[]).every(
				(item) => item.init === null && (item.id as Syntax).type === 'Identifier',
			),
	);
	if (bare.length < 2) return [];
	const names = bare.flatMap((node) =>
		(node.declarations as Syntax[]).map((item) => (item.id as Syntax).name as string),
	);
	return bare.map((node, index) => ({
		start: node.start,
		end: node.end,
		source: index === 0 ? `var ${names.join(',')};` : '',
	}));
}

export function packTopLevelPlugin(): Plugin {
	return {
		name: 'markless-pack-top-level',
		renderChunk(code, chunk, options) {
			// Namespace edits touch initialized declarations and references; merging touches only bare ones.
			const edits = [
				...lazyNamespaceObjects(chunk.fileName, code),
				...mergedBareVarDeclarations(chunk.fileName, code),
			];
			if (!edits.length) return null;
			const source = new RolldownMagicString(code);
			for (const edit of edits)
				if (edit.source) source.overwrite(edit.start, edit.end, edit.source);
				else source.remove(edit.start, edit.end);
			return {
				code: source.toString(),
				map: options.sourcemap ? source.generateMap({ hires: true }).toString() : null,
			};
		},
	};
}

function declaratorsOf(node: Syntax): Syntax[] {
	return node.type === 'VariableDeclaration' ? (node.declarations as Syntax[]) : [];
}

function walk(
	root: Syntax,
	visit: (node: Syntax, parent: Syntax | undefined, grandparent: Syntax | undefined) => void,
): void {
	const pending: [unknown, Syntax | undefined, Syntax | undefined][] = [
		[root, undefined, undefined],
	];
	while (pending.length) {
		const [item, parent, grandparent] = pending.pop()!;
		if (!item || typeof item !== 'object') continue;
		if (Array.isArray(item)) {
			for (const child of item) pending.push([child, parent, grandparent]);
			continue;
		}
		const node = item as Syntax;
		const typed = typeof node.type === 'string';
		if (typed) visit(node, parent, grandparent);
		for (const [key, value] of Object.entries(node))
			if (key !== 'type' && value && typeof value === 'object')
				pending.push(typed ? [value, node, parent] : [value, parent, grandparent]);
	}
}

function isBinding(node: Syntax, parent: Syntax | undefined): boolean {
	if (!parent) return false;
	switch (parent.type) {
		case 'VariableDeclarator':
			return parent.id === node;
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			return parent.id === node || (parent.params as Syntax[]).includes(node);
		case 'ClassDeclaration':
		case 'ClassExpression':
			return parent.id === node;
		case 'CatchClause':
			return parent.param === node;
		case 'ImportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
			return parent.local === node;
		default:
			return false;
	}
}

// Pattern targets, assignments and updates: any of them makes the name unsafe to turn into a call.
function isWrite(
	node: Syntax,
	parent: Syntax | undefined,
	grandparent: Syntax | undefined,
): boolean {
	switch (parent?.type) {
		case 'ArrayPattern':
		case 'RestElement':
			return true;
		case 'AssignmentPattern':
			return parent.left === node;
		case 'Property':
			return parent.value === node && grandparent?.type === 'ObjectPattern';
		case 'AssignmentExpression':
			return parent.left === node;
		case 'UpdateExpression':
			return true;
		case 'ForInStatement':
		case 'ForOfStatement':
			return parent.left === node;
		default:
			return false;
	}
}

function isReference(node: Syntax, parent: Syntax | undefined): boolean {
	if (!parent) return true;
	switch (parent.type) {
		case 'MemberExpression':
			return parent.object === node || !!parent.computed;
		case 'Property':
			return parent.value === node || (!!parent.computed && parent.key === node);
		case 'MethodDefinition':
		case 'PropertyDefinition':
			return !!parent.computed && parent.key === node;
		case 'ExportSpecifier':
		case 'ImportSpecifier':
		case 'LabeledStatement':
		case 'BreakStatement':
		case 'ContinueStatement':
			return false;
		default:
			return true;
	}
}
