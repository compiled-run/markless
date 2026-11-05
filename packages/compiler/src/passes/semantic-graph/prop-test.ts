import { getIdentifierName, unwrapTypeAssertion, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import type { SemanticPropTest } from '../../artifacts.ts';
import {
	graphBindingMap,
	optionalMemberReadSource,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { PROTOCOL_PROP_GRAPH_NODE_PREFIX } from '@markless/serializer';
import type { WalkState } from './types.ts';

const COMPARE = new Set(['===', '!==', '==', '!=']);
const LOGICAL = new Set(['&&', '||', '??']);

/** A branch test over the component's props and literals only; undefined when it reads anything else. */
export function propTestOf(
	node: AnyNode | undefined,
	state: WalkState,
): SemanticPropTest | undefined {
	const test = unwrapTypeAssertion(node);
	if (!test || !state.currentComponentName) return undefined;
	switch (test.type) {
		case 'ChainExpression':
			return propTestOf(test.expression as AnyNode | undefined, state);
		case 'Literal':
			return test.value === null || typeof test.value !== 'object'
				? { kind: 'value', value: test.value }
				: undefined;
		case 'Identifier':
			if (getIdentifierName(test) === 'undefined') return { kind: 'value', value: undefined };
			return propRead(test, state);
		case 'MemberExpression':
			return propRead(test, state);
		case 'UnaryExpression': {
			if (test.operator !== '!') return undefined;
			const operand = propTestOf(test.argument as AnyNode | undefined, state);
			return operand && { kind: 'not', operand };
		}
		case 'BinaryExpression':
		case 'LogicalExpression': {
			const operator = String(test.operator);
			const left = propTestOf(test.left as AnyNode | undefined, state);
			const right = left && propTestOf(test.right as AnyNode | undefined, state);
			if (!left || !right) return undefined;
			if (test.type === 'BinaryExpression' && COMPARE.has(operator))
				return { kind: 'compare', operator: operator as '===', left, right };
			if (test.type === 'LogicalExpression' && LOGICAL.has(operator))
				return { kind: 'logical', operator: operator as '&&', left, right };
			return undefined;
		}
		default:
			return undefined;
	}
}

function propRead(node: AnyNode, state: WalkState): SemanticPropTest | undefined {
	const source = optionalMemberReadSource(expressionSource(node, state.source));
	const componentName = state.currentComponentName;
	const aliases = semanticAliasMap(state.graph, state.currentSharedDefinitionId, componentName);
	const root = /^[A-Za-z_$][\w$]*/.exec(source)?.[0];
	const alias = root ? aliases.get(root) : undefined;
	// A destructuring default replaces an absent prop, and a reassignable alias may not hold the prop at all.
	if (alias && (alias.defaultSource !== undefined || alias.declarationKind !== 'const'))
		return undefined;
	const resolved = resolveGraphPath(
		source,
		graphBindingMap(state.graph, state.currentSharedDefinitionId, componentName),
		aliases,
	);
	if (
		!resolved ||
		resolved.binding.kind !== 'prop' ||
		!resolved.binding.id.startsWith(PROTOCOL_PROP_GRAPH_NODE_PREFIX) ||
		resolved.path.length === 0
	)
		return undefined;
	return { kind: 'prop', path: resolved.path };
}
