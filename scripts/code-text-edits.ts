// Finds text-search edits in the build packages: `.replace`/`.replaceAll` calls, `new RegExp`, and functions that
// splice strings at positions they searched for with indexOf. Keyed `file#function`, counted per function.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yuku';

export const CODE_TEXT_EDIT_ROOTS = [
	'packages/bundler/src',
	'packages/router/src',
	'packages/compiler/src',
];

type Node = { readonly type: string; readonly [key: string]: unknown };

const SEARCHES = new Set(['indexOf', 'lastIndexOf', 'search', 'exec', 'match', 'matchAll']);
const SPLICES = new Set(['slice', 'substring', 'substr']);

function sourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return name.endsWith('.ts') && !name.endsWith('.d.ts') ? [path] : [];
	});
}

function children(node: Node): Node[] {
	const out: Node[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'type' || key === 'start' || key === 'end') continue;
		if (Array.isArray(value)) {
			for (const item of value)
				if (item && typeof item === 'object' && 'type' in item) out.push(item as Node);
		} else if (value && typeof value === 'object' && 'type' in value) out.push(value as Node);
	}
	return out;
}

function nameOf(node: Node | undefined): string | undefined {
	if (!node) return undefined;
	if (node.type === 'Identifier') return node.name as string;
	if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
	return undefined;
}

function memberName(callee: Node): string | undefined {
	return callee.type === 'MemberExpression' && !callee.computed
		? nameOf(callee.property as Node)
		: undefined;
}

/** Counts per `file#function` (`<module>` for top-level code) of each text-edit kind. */
export function codeTextEdits(root: string): Map<string, Record<string, number>> {
	const found = new Map<string, Record<string, number>>();
	for (const base of CODE_TEXT_EDIT_ROOTS) {
		for (const file of sourceFiles(join(root, base))) {
			const source = readFileSync(file, 'utf8');
			const { program } = parse(source, { lang: 'ts', sourceType: 'module' });
			const path = relative(root, file);
			const add = (owner: string, kind: string) => {
				const key = `${path}#${owner}`;
				const counts = found.get(key) ?? {};
				counts[kind] = (counts[kind] ?? 0) + 1;
				found.set(key, counts);
			};
			const visit = (
				node: Node,
				owner: string,
				searched: { search: boolean; splice: boolean },
			) => {
				let next = owner;
				let flags = searched;
				const fn =
					node.type === 'FunctionDeclaration' ||
					node.type === 'FunctionExpression' ||
					node.type === 'ArrowFunctionExpression';
				if (fn && node.id) next = nameOf(node.id as Node) ?? owner;
				if (node.type === 'VariableDeclarator' && node.init) {
					const init = node.init as Node;
					if (
						init.type === 'ArrowFunctionExpression' ||
						init.type === 'FunctionExpression'
					)
						next = nameOf(node.id as Node) ?? owner;
				}
				if ((node.type === 'MethodDefinition' || node.type === 'Property') && node.value) {
					const value = node.value as Node;
					if (
						value.type === 'FunctionExpression' ||
						value.type === 'ArrowFunctionExpression'
					)
						next = nameOf(node.key as Node) ?? owner;
				}
				if (next !== owner) flags = { search: false, splice: false };
				if (node.type === 'CallExpression') {
					const member = memberName(node.callee as Node);
					if (member === 'replace' || member === 'replaceAll') add(next, member);
					if (member && SEARCHES.has(member)) flags.search = true;
					if (member && SPLICES.has(member)) flags.splice = true;
				}
				if (node.type === 'NewExpression' && nameOf(node.callee as Node) === 'RegExp')
					add(next, 'RegExp');
				for (const child of children(node)) visit(child, next, flags);
				if (next !== owner && flags.search && flags.splice) add(next, 'search-splice');
			};
			const top = { search: false, splice: false };
			visit(program as unknown as Node, '<module>', top);
			if (top.search && top.splice) add('<module>', 'search-splice');
		}
	}
	return found;
}
