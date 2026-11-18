import { getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import type { SemanticComponentRowRead } from '../../artifacts.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import type { WalkState } from './types.ts';

/** The enclosing `@for` row an expression reads as a plain member path (`row`, `row.id`, `row?.owner.name`), or null. */
export function rowItemRead(expression: AnyNode, state: WalkState): SemanticComponentRowRead | null {
	const path: string[] = [];
	let current: AnyNode | undefined = expression.type === 'ChainExpression' ? (expression.expression as AnyNode) : expression;
	while (current?.type === 'MemberExpression') {
		const property = current.computed === true ? null : getIdentifierName(current.property as AnyNode);
		if (!property) return null;
		path.unshift(property);
		current = current.object as AnyNode;
	}
	const root = current?.type === 'Identifier' ? getIdentifierName(current) : null;
	if (!root || typeof current?.start !== 'number') return null;
	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, current.start);
	if (symbolId === null) return null;
	const scope = semantic.bindings[symbolId]!.scope;
	for (const repeatId of [...state.currentKeyedRepeatScopeIds].reverse()) {
		const repeat = state.graph.keyedRepeats.find((candidate) => candidate.id === repeatId);
		const header = state.keyedRepeatItemSpans.get(repeatId);
		if (!repeat || !header) continue;
		// The row's names are the bindings its header declares; a same-named local elsewhere is not the row.
		const declared = semantic.bindings.find((binding) => {
			const start = binding.declarations[0]?.start;
			return typeof start === 'number' && start >= header.start && start < header.end;
		});
		if (declared?.scope.id !== scope.id) continue;
		if (repeat.itemName === root) return { repeatId, path };
		if (repeat.indexName === root) return path.length === 0 ? { repeatId, path, index: true } : null;
		const alias = repeat.itemAliases?.find((candidate) => candidate.name === root);
		if (alias) return { repeatId, path: [...alias.path, ...path] };
	}
	return null;
}
