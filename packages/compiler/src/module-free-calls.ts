import { analyze } from '@tsrx/yuku';

/**
 * Whether module code calls `name` at a site where it resolves to an import binding or to no
 * binding at all, read from scope tables without building the tree. Undefined when the code
 * does not parse cleanly.
 */
export function callsImportedOrFreeName(code: string, name: string): boolean | undefined {
	let module: ReturnType<typeof analyze>;
	try {
		module = analyze(code, { path: 'module.js', sourceType: 'module', preserveParens: true });
	} catch {
		return undefined;
	}
	if (module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return undefined;
	const imported = new Set(module.imports.map((record) => record.local));
	for (const reference of module.references) {
		if (reference.name !== name) continue;
		if (reference.binding && !imported.has(reference.binding)) continue;
		const parent = module.parentOf(reference.node);
		if (parent?.type === 'CallExpression' && parent.callee === reference.node) return true;
	}
	return false;
}

type Span = { readonly type: string; readonly start: number; readonly end: number };

/** A call to `name` where it resolves to an import binding or to no binding, with the node around it. */
export type ImportedOrFreeNameCall = {
	readonly call: Span & { readonly argumentCount: number };
	/** Its parent, past any parentheses. */
	readonly parent: (Span & { readonly expressions?: readonly Span[] }) | null;
	/** Whether that parent, through any parentheses, is what a call or tagged template invokes or `delete` deletes. */
	readonly parentIsInvoked: boolean;
};

/**
 * Every call site `callsImportedOrFreeName` answers about, read from the same scope tables, so an edit
 * removes exactly the calls that reach the import. Undefined when the code does not parse cleanly.
 */
export function importedOrFreeNameCalls(
	code: string,
	name: string,
): readonly ImportedOrFreeNameCall[] | undefined {
	let module: ReturnType<typeof analyze>;
	try {
		module = analyze(code, { path: 'module.js', sourceType: 'module', preserveParens: true });
	} catch {
		return undefined;
	}
	if (module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return undefined;
	const imported = new Set(module.imports.map((record) => record.local));
	type Holder = Span & {
		readonly callee?: unknown;
		readonly tag?: unknown;
		readonly operator?: string;
		readonly argument?: unknown;
	};
	const outer = (node: unknown): { readonly node: Holder | null; readonly child: unknown } => {
		let child = node;
		let current = module.parentOf(node as never) as Holder | null;
		while (current?.type === 'ParenthesizedExpression') {
			child = current;
			current = module.parentOf(current as never) as Holder | null;
		}
		return { node: current, child };
	};
	const calls: ImportedOrFreeNameCall[] = [];
	for (const reference of module.references) {
		if (reference.name !== name) continue;
		if (reference.binding && !imported.has(reference.binding)) continue;
		const call = module.parentOf(reference.node) as
			| (Span & { readonly callee: unknown; readonly arguments: readonly unknown[] })
			| null;
		if (call?.type !== 'CallExpression' || call.callee !== reference.node) continue;
		const parent = outer(call).node;
		const holder = parent ? outer(parent) : undefined;
		const invoked =
			holder?.node?.callee === holder?.child ||
			holder?.node?.tag === holder?.child ||
			(holder?.node?.type === 'UnaryExpression' &&
				holder.node.operator === 'delete' &&
				holder.node.argument === holder.child);
		calls.push({
			call: {
				type: call.type,
				start: call.start,
				end: call.end,
				argumentCount: call.arguments.length,
			},
			parent: parent as ImportedOrFreeNameCall['parent'],
			parentIsInvoked: Boolean(holder?.node) && invoked,
		});
	}
	return calls;
}
