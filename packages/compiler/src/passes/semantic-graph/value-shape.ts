import type { AnyNode } from '../../ast/nodes.ts';
import type { SemanticValueShape } from '../../artifacts.ts';

// The expression forms a native host evaluates as data; anything else has no shape and stays script.
export function valueShapeOf(node: AnyNode | undefined): SemanticValueShape | undefined {
	if (!node) return undefined;
	switch (node.type) {
		case 'ParenthesizedExpression':
		case 'JSXExpressionContainer':
			return valueShapeOf(node.expression as AnyNode | undefined);
		case 'Identifier':
			return typeof node.name === 'string' && node.name !== 'undefined'
				? { kind: 'read', name: node.name }
				: undefined;
		case 'Literal':
			return typeof node.value === 'string' ||
				typeof node.value === 'boolean' ||
				(typeof node.value === 'number' && Number.isInteger(node.value))
				? { kind: 'literal', value: node.value }
				: undefined;
		case 'UnaryExpression': {
			const operand = valueShapeOf(node.argument as AnyNode | undefined);
			if (!operand) return undefined;
			if (node.operator === '!') return { kind: 'not', value: operand };
			return node.operator === '-' && operand.kind === 'literal' && typeof operand.value === 'number'
				? { kind: 'literal', value: operand.value === 0 ? 0 : -operand.value }
				: undefined;
		}
		case 'ConditionalExpression': {
			const test = valueShapeOf(node.test as AnyNode | undefined);
			const consequent = valueShapeOf(node.consequent as AnyNode | undefined);
			const alternate = valueShapeOf(node.alternate as AnyNode | undefined);
			return test && consequent && alternate
				? { kind: 'conditional', test, consequent, alternate }
				: undefined;
		}
		case 'BinaryExpression': {
			if (node.operator !== '===' && node.operator !== '!==') return undefined;
			const left = valueShapeOf(node.left as AnyNode | undefined);
			const right = valueShapeOf(node.right as AnyNode | undefined);
			if (!left || !right) return undefined;
			const equals: SemanticValueShape = { kind: 'equals', left, right };
			return node.operator === '===' ? equals : { kind: 'not', value: equals };
		}
		default:
			return undefined;
	}
}
