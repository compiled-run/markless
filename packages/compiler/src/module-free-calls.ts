import { SymbolFlags, analyze } from 'yuku-analyzer';

/**
 * Whether module code calls `name` at a site where it resolves to an import binding or to no
 * binding at all, read from scope tables without building the tree. Undefined when the code
 * does not parse cleanly.
 */
export function callsImportedOrFreeName(code: string, name: string): boolean | undefined {
	let module: ReturnType<typeof analyze>;
	try {
		module = analyze(code, {
			path: 'module.js',
			lang: 'js',
			sourceType: 'module',
			preserveParens: true,
		});
	} catch {
		return undefined;
	}
	if (module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return undefined;
	for (const reference of module.references) {
		if (reference.name !== name) continue;
		if (reference.symbol && !reference.symbol.has(SymbolFlags.Import)) continue;
		const parent = module.parentOf(reference.node);
		if (parent?.type === 'CallExpression' && parent.callee === reference.node) return true;
	}
	return false;
}
