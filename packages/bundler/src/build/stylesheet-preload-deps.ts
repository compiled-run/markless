import { parseChunkCode } from './chunk-ast.ts';

type Node = {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly [key: string]: unknown;
};
type Edit = { readonly start: number; readonly end: number; readonly text: string };

// Vite's name for the table of files a chunk's dynamic imports wait for.
const DEPENDENCY_TABLE = '__vite__mapDeps';

/** The chunk with every stylesheet left out of the files its dynamic imports wait for. */
export function stylesheetlessPreloads(
	fileName: string,
	code: string,
	stylesheets: readonly string[],
): string {
	if (!code.includes(DEPENDENCY_TABLE)) return code;
	const program = parseChunkCode(fileName, code).program as unknown as Node;
	const table = dependencyTable(program);
	if (!table) return code;
	const named = new Set(stylesheets);
	const dropped = new Set(table.files.flatMap((file, index) => (named.has(file) ? [index] : [])));
	if (dropped.size === 0) return code;
	const edits: Edit[] = [];
	let keptCalls = 0;
	for (const call of tableCalls(program)) {
		const kept = call.indexes.filter((index) => !dropped.has(index));
		if (kept.length > 0) keptCalls++;
		if (kept.length === call.indexes.length) continue;
		edits.push(
			kept.length === 0
				? { start: call.node.start, end: call.node.end, text: '[]' }
				: { start: call.list.start, end: call.list.end, text: `[${kept.join(',')}]` },
		);
	}
	if (keptCalls === 0 && table.declarations === 1)
		edits.push({ start: table.statement.start, end: table.statement.end, text: '' });
	return applyEdits(code, edits);
}

function dependencyTable(
	program: Node,
):
	| { readonly files: readonly string[]; readonly statement: Node; readonly declarations: number }
	| undefined {
	for (const statement of children(program, 'body')) {
		if (statement.type !== 'VariableDeclaration') continue;
		for (const declarator of children(statement, 'declarations')) {
			const id = declarator.id as Node | undefined;
			if (id?.type !== 'Identifier' || id.name !== DEPENDENCY_TABLE) continue;
			const list = firstStringList(declarator.init as Node | undefined);
			return list
				? {
						files: list,
						statement,
						declarations: children(statement, 'declarations').length,
					}
				: undefined;
		}
	}
	return undefined;
}

function firstStringList(node: Node | undefined): readonly string[] | undefined {
	let found: readonly string[] | undefined;
	visit(node, (current) => {
		if (found || current.type !== 'ArrayExpression') return;
		const elements = children(current, 'elements');
		if (
			elements.every(
				(element) => element.type === 'Literal' && typeof element.value === 'string',
			)
		)
			found = elements.map((element) => element.value as string);
	});
	return found;
}

function tableCalls(
	program: Node,
): Array<{ readonly node: Node; readonly list: Node; readonly indexes: readonly number[] }> {
	const calls: Array<{
		readonly node: Node;
		readonly list: Node;
		readonly indexes: readonly number[];
	}> = [];
	visit(program, (node) => {
		if (node.type !== 'CallExpression') return;
		const callee = node.callee as Node;
		if (callee.type !== 'Identifier' || callee.name !== DEPENDENCY_TABLE) return;
		const [list] = children(node, 'arguments');
		if (list?.type !== 'ArrayExpression') return;
		const elements = children(list, 'elements');
		if (
			!elements.every(
				(element) => element.type === 'Literal' && typeof element.value === 'number',
			)
		)
			return;
		calls.push({ node, list, indexes: elements.map((element) => element.value as number) });
	});
	return calls;
}

function children(node: Node, key: string): Node[] {
	const value = node[key];
	return Array.isArray(value) ? (value.filter(Boolean) as Node[]) : [];
}

function visit(node: Node | undefined, enter: (node: Node) => void): void {
	if (!node || typeof node.type !== 'string') return;
	enter(node);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const item of value)
				if (item && typeof item === 'object') visit(item as Node, enter);
		} else if (value && typeof value === 'object') visit(value as Node, enter);
	}
}

function applyEdits(code: string, edits: readonly Edit[]): string {
	let next = code;
	for (const edit of [...edits].sort((left, right) => right.start - left.start))
		next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
	return next;
}
