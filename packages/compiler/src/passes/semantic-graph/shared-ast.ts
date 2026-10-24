import { parseJavaScriptModule, parseModule, parserLanguageFor } from '../../js-ast.ts';
import { analyze } from '@tsrx/yuku';

/** Scopes, bindings and references for one TSRX module, as the analyzer reports them. */
export type ModuleSemantics = ReturnType<typeof analyze>;
import type { AnyNode } from '../../ast/nodes.ts';

type OwnedAst = { readonly source: string; readonly filename: string; readonly ast: AnyNode };

const ownedAsts = new WeakMap<object, OwnedAst>();

/**
 * The module AST for one owner's source — parsed on the first ask and handed
 * back unchanged after. Owner-scoped rather than global: the tree lives exactly
 * as long as the compile that asked for it, so nothing is retained between
 * compiles and no reader can be handed a tree an earlier compile edited.
 *
 * Every reader shares one tree. A caller that writes to the nodes it gets back
 * must keep its own `parseModule` call instead of using this.
 */
export function ownedModuleAst(owner: object, source: string, filename: string): AnyNode {
	const owned = ownedAsts.get(owner);
	if (owned && owned.source === source && owned.filename === filename) return owned.ast;
	const ast = parseModule(source, filename) as unknown as AnyNode;
	ownedAsts.set(owner, { source, filename, ast });
	return ast;
}

const ownedOptionalAsts = new WeakMap<object, OptionalOwnedAst>();

type OptionalOwnedAst = {
	readonly source: string;
	readonly filename: string;
	readonly ast: AnyNode | null;
};

/**
 * `ownedModuleAst` for a source the parser may reject. The refusal is remembered
 * as `null`, so a second reader of the same owner does not pay for the failed
 * parse again, and it carries no error — a caller that needs the parse
 * diagnostic must call `parseModule` itself.
 */
export function ownedModuleAstOrNull(
	owner: object,
	source: string,
	filename: string,
): AnyNode | null {
	const owned = ownedOptionalAsts.get(owner);
	if (owned && owned.source === source && owned.filename === filename) return owned.ast;
	let ast: AnyNode | null;
	try {
		// Printed modules are one-shot sources: parse uncached so they never fill the memo.
		ast = parseJavaScriptModule(source, filename) as unknown as AnyNode;
	} catch {
		ast = null;
	}
	ownedOptionalAsts.set(owner, { source, filename, ast });
	return ast;
}

/**
 * A memo for a function whose whole answer is determined by `(filename, source)`.
 * Only plain data may be memoized through it — the entries outlive the compile
 * that filled them, so an AST node reaching a later compile through one would
 * carry any edit the first compile made.
 *
 * Bounded, least-recently-used first out: a build compiles each module under
 * several query variants, far apart in time.
 */
export function createSourceMemo<Value>(
	limit = 4,
): (filename: string, source: string, compute: () => Value) => Value {
	// Keyed by the source string itself, whose hash the engine caches on it: a joined key was rebuilt and rehashed per call.
	const entries = new Map<string, Map<string, Value>>();
	let size = 0;
	return (filename, source, compute) => {
		const byFile = entries.get(source);
		if (byFile?.has(filename)) {
			entries.delete(source);
			entries.set(source, byFile);
			return byFile.get(filename) as Value;
		}
		const value = compute();
		if (byFile) {
			entries.delete(source);
			entries.set(source, byFile);
			byFile.set(filename, value);
		} else entries.set(source, new Map([[filename, value]]));
		size++;
		while (size > limit) {
			const [oldestSource, oldest] = entries.entries().next().value!;
			size -= oldest.size;
			entries.delete(oldestSource);
		}
		return value;
	};
}

const moduleSemanticsMemo = createSourceMemo<ModuleSemantics>(256);

/** The analyzer's scope tables for a whole module. Callers only read the view. */
export function moduleSemantics(source: string, filename: string): ModuleSemantics {
	return moduleSemanticsMemo(filename, source, () => analyze(source, parserLanguageFor(filename)));
}
