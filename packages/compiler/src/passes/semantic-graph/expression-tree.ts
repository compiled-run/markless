import type { AnyNode } from '../../ast/nodes.ts';
import { asNodes } from '../../ast/nodes.ts';
import type {
	NativeFactCollectors,
	SemanticExpression,
	SemanticHandlerStatement,
} from '../../artifacts.ts';

const UNARY = new Set(['!', '-', '+']);
const BINARY = new Set(['+', '-', '*', '/', '%', '===', '!==', '<', '<=', '>', '>=']);
const LOGICAL = new Set(['&&', '||', '??']);
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=']);
/** Calls with exact JavaScript meaning that a native host implements; any other call needs a script engine. */
const BUILTINS = new Set(['String', 'Number', 'Boolean', 'Math.abs', 'Math.floor', 'Math.max', 'Math.min', 'Math.round']);
/** Array and string methods with exact JavaScript meaning that return a new value and change nothing. */
const METHODS = new Set([
	'filter', 'map', 'find', 'findIndex', 'some', 'every', 'includes', 'indexOf', 'join', 'concat', 'slice',
	'reverse', 'toReversed', 'toUpperCase', 'toLowerCase', 'trim',
]);

const lambdaOf = (node: AnyNode): SemanticExpression => {
	const parameters = asNodes(node.params);
	if (node.async || parameters.some((parameter) => parameter.type !== 'Identifier'))
		return unsupported('a function with a pattern or async parameters');
	const body = node.body as AnyNode | undefined;
	if (!body || body.type === 'BlockStatement') return unsupported('a function with a block body');
	return { kind: 'lambda', parameters: parameters.map((parameter) => String(parameter.name)), body: expressionTreeOf(body) };
};

const unsupported = (construct: string): SemanticExpression => ({ kind: 'unsupported', construct });

function calleePath(node: AnyNode | undefined): string[] | null {
	if (node?.type === 'Identifier' && typeof node.name === 'string') return [node.name];
	if (node?.type === 'MemberExpression' && !node.computed) {
		const object = calleePath(node.object as AnyNode | undefined);
		const property = (node.property as AnyNode | undefined)?.name;
		return object && typeof property === 'string' ? [...object, property] : null;
	}
	return null;
}

const calleeName = (node: AnyNode | undefined): string | null =>
	calleePath(node)?.join('.') ?? null;

/** A template value, test or assigned value as a tree a native host evaluates; names are the component's bindings. */
export function expressionTreeOf(node: AnyNode | undefined): SemanticExpression {
	if (!node) return unsupported('a missing expression');
	switch (node.type) {
		case 'ParenthesizedExpression':
		case 'JSXExpressionContainer':
		case 'ChainExpression':
			return expressionTreeOf(node.expression as AnyNode | undefined);
		case 'Identifier':
			if (node.name === 'undefined') return { kind: 'literal', value: null };
			return typeof node.name === 'string' ? { kind: 'read', name: node.name } : unsupported('a name');
		case 'Literal':
			return typeof node.value === 'string' ||
				typeof node.value === 'boolean' ||
				typeof node.value === 'number' ||
				node.value === null
				? { kind: 'literal', value: node.value as string | number | boolean | null }
				: unsupported('a regular expression or bigint literal');
		case 'TemplateLiteral': {
			const quasis = asNodes(node.quasis).map((quasi) => {
				const value = quasi.value as { cooked?: string } | undefined;
				return value?.cooked ?? '';
			});
			const expressions = asNodes(node.expressions).map(expressionTreeOf);
			return {
				kind: 'template',
				parts: quasis.flatMap((text, index) =>
					index < expressions.length ? [text, expressions[index]!] : [text],
				),
			};
		}
		case 'UnaryExpression':
			return typeof node.operator === 'string' && UNARY.has(node.operator)
				? { kind: 'unary', operator: node.operator as '!' | '-' | '+', value: expressionTreeOf(node.argument as AnyNode) }
				: unsupported(`the \`${String(node.operator)}\` operator`);
		case 'BinaryExpression':
			return typeof node.operator === 'string' && BINARY.has(node.operator)
				? {
						kind: 'binary',
						operator: node.operator as Extract<SemanticExpression, { kind: 'binary' }>['operator'],
						left: expressionTreeOf(node.left as AnyNode),
						right: expressionTreeOf(node.right as AnyNode),
					}
				: unsupported(`the \`${String(node.operator)}\` operator`);
		case 'LogicalExpression':
			return typeof node.operator === 'string' && LOGICAL.has(node.operator)
				? {
						kind: 'logical',
						operator: node.operator as '&&' | '||' | '??',
						left: expressionTreeOf(node.left as AnyNode),
						right: expressionTreeOf(node.right as AnyNode),
					}
				: unsupported(`the \`${String(node.operator)}\` operator`);
		case 'ConditionalExpression':
			return {
				kind: 'conditional',
				test: expressionTreeOf(node.test as AnyNode),
				consequent: expressionTreeOf(node.consequent as AnyNode),
				alternate: expressionTreeOf(node.alternate as AnyNode),
			};
		case 'MemberExpression': {
			const property = (node.property as AnyNode | undefined)?.name;
			return !node.computed && typeof property === 'string'
				? { kind: 'member', object: expressionTreeOf(node.object as AnyNode), property }
				: unsupported('a computed member read');
		}
		case 'CallExpression': {
			const callee = node.callee as AnyNode | undefined;
			const method = callee?.type === 'MemberExpression' && !callee.computed ? (callee.property as AnyNode | undefined)?.name : undefined;
			if (typeof method === 'string' && METHODS.has(method) && !BUILTINS.has(calleeName(callee) ?? '')) {
				return {
					kind: 'method',
					method,
					object: expressionTreeOf(callee!.object as AnyNode),
					arguments: asNodes(node.arguments).map((argument) =>
						argument.type === 'ArrowFunctionExpression' ? lambdaOf(argument) : expressionTreeOf(argument),
					),
				};
			}
			const path = calleePath(callee);
			return path
				? {
						kind: 'call',
						callee: path.join('.'),
						calleePath: path,
						arguments: asNodes(node.arguments).map(expressionTreeOf),
					}
				: unsupported('a call to a computed function');
		}
		case 'AwaitExpression':
			return { kind: 'await', value: expressionTreeOf(node.argument as AnyNode | undefined) };
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			return unsupported('a function value');
		case 'ArrayExpression':
			return {
				kind: 'array',
				items: asNodes(node.elements).map((element) =>
					element?.type === 'SpreadElement'
						? { spread: true, value: expressionTreeOf(element.argument as AnyNode) }
						: { spread: false, value: expressionTreeOf(element ?? undefined) },
				),
			};
		case 'ObjectExpression': {
			const entries: (readonly [string, SemanticExpression])[] = [];
			for (const property of asNodes(node.properties)) {
				const key = property.key as AnyNode | undefined;
				const name = key?.type === 'Identifier' ? key.name : key?.type === 'Literal' ? key.value : undefined;
				if (property.type !== 'Property' || property.computed || property.kind !== 'init' || typeof name !== 'string')
					return unsupported('an object with a spread, computed key or method');
				entries.push([name, expressionTreeOf(property.value as AnyNode)]);
			}
			return { kind: 'object', entries };
		}
		default:
			return unsupported(`a ${String(node.type)}`);
	}
}

const statementOf = (expression: AnyNode | null): SemanticHandlerStatement => {
	if (!expression) return { kind: 'unsupported', construct: 'a statement other than an expression' };
	if (expression.type === 'ParenthesizedExpression')
		return statementOf((expression.expression as AnyNode | undefined) ?? null);
	if (
		expression.type === 'CallExpression' &&
		(expression.callee as AnyNode | undefined)?.type === 'Identifier' &&
		asNodes(expression.arguments).length === 0 &&
		!BUILTINS.has(String((expression.callee as AnyNode).name))
	)
		return { kind: 'invoke', name: String((expression.callee as AnyNode).name) };
	if (expression.type === 'UpdateExpression') {
		const target = expression.argument as AnyNode | undefined;
		if (target?.type !== 'Identifier' || typeof target.name !== 'string')
			return { kind: 'unsupported', construct: 'an update of something other than a name' };
		const read: SemanticExpression = { kind: 'read', name: target.name };
		return {
			kind: 'assign',
			target: target.name,
			value: {
				kind: 'binary',
				operator: expression.operator === '--' ? '-' : '+',
				left: { kind: 'unary', operator: '+', value: read },
				right: { kind: 'literal', value: 1 },
			},
		};
	}
	if (expression.type === 'AssignmentExpression') {
		const target = expression.left as AnyNode | undefined;
		if (target?.type !== 'Identifier' || typeof target.name !== 'string')
			return { kind: 'unsupported', construct: 'an assignment to something other than a name' };
		const value = expressionTreeOf(expression.right as AnyNode | undefined);
		const operator = String(expression.operator);
		if (operator === '=') return { kind: 'assign', target: target.name, value };
		return COMPOUND.has(operator)
			? {
					kind: 'assign',
					target: target.name,
					value: {
						kind: 'binary',
						operator: operator.slice(0, -1) as Extract<SemanticExpression, { kind: 'binary' }>['operator'],
						left: { kind: 'read', name: target.name },
						right: value,
					},
				}
			: { kind: 'unsupported', construct: `the \`${operator}\` assignment` };
	}
	const tree = expressionTreeOf(expression);
	if (tree.kind === 'call' || tree.kind === 'await') return { kind: 'effect', value: tree };
	return {
		kind: 'unsupported',
		construct: tree.kind === 'unsupported' ? tree.construct : 'an expression statement',
	};
};

/** A handler's body as statements a native host runs: assignments to names, each value a tree. */
export function handlerStatementsOf(
	node: AnyNode | undefined,
): ReadonlyArray<SemanticHandlerStatement> | undefined {
	if (!node || (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression'))
		return undefined;
	const body = node.body as AnyNode | undefined;
	if (body?.type !== 'BlockStatement') return [statementOf(body ?? null)];
	return asNodes(body.body).map((statement) =>
		statement.type === 'ExpressionStatement'
			? statementOf(statement.expression as AnyNode)
			: { kind: 'unsupported', construct: `a ${String(statement.type)}` },
	);
}

/** What a native build passes as `nativeFacts`; nothing else imports this module. */
export const NATIVE_FACT_COLLECTORS: NativeFactCollectors = {
	expression: expressionTreeOf as NativeFactCollectors['expression'],
	handlerStatements: handlerStatementsOf as NativeFactCollectors['handlerStatements'],
};
