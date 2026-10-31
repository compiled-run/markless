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
	/** Whether that parent, through any parentheses, is what a call or tagged template invokes, or `delete` or `typeof` reads as a reference. */
	readonly parentIsInvoked: boolean;
	/** Whether that parent's value is thrown away: it is a statement of its own. */
	readonly parentValueDiscarded: boolean;
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
				(holder.node.operator === 'delete' || holder.node.operator === 'typeof') &&
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
			parentValueDiscarded: holder?.node?.type === 'ExpressionStatement',
		});
	}
	return calls;
}

/** A node as the analyzer parsed it: its type, its source range, and its own fields. */
export type AnalyzedNode = {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly [field: string]: unknown;
};

/** What edits of a module's calls read: who a callee resolves to, from the analyzer's scope tables. */
export type ModuleCallFacts = {
	/** The local names that import `importedName`. */
	readonly importLocals: (importedName: string) => readonly string[];
	/** Every name the module scope declares, imports included. */
	readonly moduleNames: () => readonly string[];
	/** Each named import: the local it binds, the name it imports, and the specifier it imports from. */
	readonly imports: () => ReadonlyArray<{
		readonly local: string;
		readonly imported: string;
		readonly specifier: string;
	}>;
	/** The values assigned to the module-scope binding `name`, declaration initializers included. */
	readonly writesOf: (name: string) => readonly AnalyzedNode[];
	/** Where the module-scope binding `name` is read, as the identifiers that read it. */
	readonly readsOf: (name: string) => readonly AnalyzedNode[];
	/** The calls whose callee resolves to the module-scope binding `name`, with each call's parent. */
	readonly callsTo: (
		name: string,
	) => ReadonlyArray<{ readonly call: AnalyzedNode; readonly parent: AnalyzedNode | null }>;
};

/** Undefined when the code does not parse cleanly. */
export function moduleCallFacts(code: string): ModuleCallFacts | undefined {
	let module: ReturnType<typeof analyze>;
	try {
		module = analyze(code, { path: 'module.js', sourceType: 'module', preserveParens: true });
	} catch {
		return undefined;
	}
	if (module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return undefined;
	const parentOf = (node: unknown) => module.parentOf(node as never) as AnalyzedNode | null;
	const binding = (name: string) => module.rootScope.find(name);
	return {
		importLocals: (importedName) =>
			module.imports.flatMap((record) =>
				record.name === importedName && record.local ? [record.local.name] : [],
			),
		moduleNames: () => module.rootScope.bindings.map((entry) => entry.name),
		imports: () =>
			module.imports.flatMap((record) =>
				record.kind === 'named' && record.name && record.local
					? [
							{
								local: record.local.name,
								imported: record.name,
								specifier: record.specifier,
							},
						]
					: [],
			),
		writesOf: (name) => {
			const target = binding(name);
			if (!target) return [];
			const writes: AnalyzedNode[] = [];
			for (const declaration of target.declarations) {
				const declarator = parentOf(declaration);
				if (declarator?.type === 'VariableDeclarator' && declarator.init)
					writes.push(declarator.init as AnalyzedNode);
				if (declarator?.type === 'FunctionDeclaration') writes.push(declarator);
			}
			for (const reference of target.references) {
				if (!reference.isWrite) continue;
				const assignment = parentOf(reference.node);
				if (
					assignment?.type === 'AssignmentExpression' &&
					assignment.left === reference.node
				)
					writes.push(assignment.right as AnalyzedNode);
			}
			return writes;
		},
		readsOf: (name) => {
			const target = binding(name);
			if (!target) return [];
			return target.references.flatMap((reference) =>
				reference.isWrite ? [] : [reference.node as unknown as AnalyzedNode],
			);
		},
		callsTo: (name) => {
			const target = binding(name);
			if (!target) return [];
			return target.references.flatMap((reference) => {
				const call = parentOf(reference.node);
				if (call?.type !== 'CallExpression' || call.callee !== reference.node) return [];
				return [{ call, parent: parentOf(call) }];
			});
		},
	};
}
