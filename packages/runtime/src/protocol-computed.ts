import type { ProtocolComputedExpression } from '@arcade/protocol';

type ProtocolComputedRead = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

export function evaluateProtocolComputedExpression(
	expression: ProtocolComputedExpression,
	read: ProtocolComputedRead,
): unknown {
	if (expression.kind === 'literal') return expression.value;
	if (expression.kind === 'read') return read(expression.graphNodeId, expression.path);

	const left = evaluateProtocolComputedExpression(expression.left, read);
	const right = evaluateProtocolComputedExpression(expression.right, read);
	return applyProtocolBinaryOperator(expression.operator, left, right);
}

function applyProtocolBinaryOperator(
	operator: '+' | '-' | '*' | '/',
	left: unknown,
	right: unknown,
): unknown {
	if (operator === '+') return (left as number) + (right as number);
	if (operator === '-') return (left as number) - (right as number);
	if (operator === '*') return (left as number) * (right as number);
	if (operator === '/') return (left as number) / (right as number);
	return undefined;
}
