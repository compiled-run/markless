import { childNodes, type AnyNode } from '../../ast/nodes.ts';

const FUNCTION_TYPES = new Set<unknown>(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
// Expressions whose value is never a promise, whatever their operands are.
const NEVER_PROMISE = new Set<unknown>([
	'Literal',
	'TemplateLiteral',
	'UpdateExpression',
	'UnaryExpression',
	'BinaryExpression',
	'ObjectExpression',
	'ArrayExpression',
	'ArrowFunctionExpression',
	'FunctionExpression',
	'AssignmentExpression',
]);

const WRAPPERS = new Set<unknown>([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
]);

export function isFunctionNode(node: AnyNode | undefined): boolean {
	return !!node && FUNCTION_TYPES.has(node.type);
}

/** Whether a handler can hand a promise back: an async function, or one that returns a value that may be one. A promise it starts and does not return is not its result. */
export function handlerMayReturnPromise(node: AnyNode | undefined): boolean {
	if (!node || !FUNCTION_TYPES.has(node.type)) return false;
	if (node.async === true) return true;
	const body = node.body as AnyNode | undefined;
	if (!body) return false;
	if (body.type !== 'BlockStatement') return mayBePromise(body);
	return ownReturns(body).some((argument) => mayBePromise(argument));
}

function mayBePromise(expression: AnyNode): boolean {
	if (WRAPPERS.has(expression.type)) return mayBePromise(expression.expression as AnyNode);
	return !NEVER_PROMISE.has(expression.type);
}

function ownReturns(node: AnyNode): AnyNode[] {
	const found: AnyNode[] = [];
	const visit = (current: AnyNode) => {
		if (FUNCTION_TYPES.has(current.type)) return;
		if (current.type === 'ReturnStatement' && current.argument) found.push(current.argument as AnyNode);
		for (const child of childNodes(current)) visit(child);
	};
	for (const child of childNodes(node)) visit(child);
	return found;
}
