import { getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import type { SemanticComponentRowRead } from '../../artifacts.ts';
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
	if (!root) return null;
	for (const repeatId of [...state.currentKeyedRepeatScopeIds].reverse()) {
		const repeat = state.graph.keyedRepeats.find((candidate) => candidate.id === repeatId);
		if (!repeat) continue;
		if (repeat.itemName === root) return { repeatId, path };
		if (repeat.indexName === root) return path.length === 0 ? { repeatId, path, index: true } : null;
		const alias = repeat.itemAliases?.find((candidate) => candidate.name === root);
		if (alias) return { repeatId, path: [...alias.path, ...path] };
	}
	return null;
}
