import type { AnyNode } from '../../ast/nodes.ts';
import { asNodes, getIdentifierName, isNode } from '../../ast/nodes.ts';
import type { SemanticValueSet } from '../../artifacts.ts';

const UNKNOWN: SemanticValueSet = { kind: 'unknown' };

// Array methods whose result holds only the receiver's own elements.
const KEEPS_ELEMENTS = new Set(['filter', 'slice', 'reverse', 'sort', 'toSorted', 'toReversed']);

/** What a function can return: the union of its `return` arguments, or its expression body; unknown when none is known. */
export function returnsOf(fn: AnyNode | undefined): SemanticValueSet {
	if (!fn) return UNKNOWN;
	if (fn.generator) return UNKNOWN;
	const body = fn.body as AnyNode | undefined;
	if (!body) return UNKNOWN;
	if (body.type !== 'BlockStatement') return valueSetOf(body);
	const returned: SemanticValueSet[] = [];
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (!isNode(node)) return;
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression' ||
			node.type === 'ClassDeclaration' ||
			node.type === 'ClassExpression'
		)
			return;
		if (node.type === 'ReturnStatement') {
			returned.push(
				node.argument
					? valueSetOf(node.argument as AnyNode)
					: { kind: 'literals', values: [null] },
			);
			return;
		}
		for (const [key, child] of Object.entries(node))
			if (key !== 'loc' && key !== 'range') visit(child);
	};
	visit(body.body);
	return returned.length === 0 ? UNKNOWN : returned.reduce(union);
}

/** The values an expression can give, as far as its own syntax tells: literals, object fields and array elements. */
export function valueSetOf(node: AnyNode | undefined): SemanticValueSet {
	if (!node) return UNKNOWN;
	switch (node.type) {
		case 'Literal': {
			const value = node.value;
			return value === null ||
				typeof value === 'string' ||
				typeof value === 'number' ||
				typeof value === 'boolean'
				? { kind: 'literals', values: [value] }
				: UNKNOWN;
		}
		case 'TemplateLiteral':
			return asNodes(node.expressions).length === 0
				? {
						kind: 'literals',
						values: [
							asNodes(node.quasis)
								.map((quasi) =>
									String((quasi.value as { cooked?: string }).cooked ?? ''),
								)
								.join(''),
						],
					}
				: UNKNOWN;
		case 'ParenthesizedExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSNonNullExpression':
		case 'AwaitExpression':
			return valueSetOf((node.expression ?? node.argument) as AnyNode);
		case 'ConditionalExpression':
			return union(
				valueSetOf(node.consequent as AnyNode),
				valueSetOf(node.alternate as AnyNode),
			);
		case 'LogicalExpression':
			return union(valueSetOf(node.left as AnyNode), valueSetOf(node.right as AnyNode));
		case 'ObjectExpression':
			return objectOf(node);
		case 'ArrayExpression': {
			const elements: SemanticValueSet[] = [];
			for (const element of asNodes(node.elements)) {
				if (element.type === 'SpreadElement') {
					const spread = valueSetOf(element.argument as AnyNode);
					if (spread.kind !== 'array') return { kind: 'array', elements: UNKNOWN };
					elements.push(spread.elements);
				} else elements.push(valueSetOf(element));
			}
			return {
				kind: 'array',
				elements: elements.length === 0 ? UNKNOWN : elements.reduce(union),
			};
		}
		case 'CallExpression':
			return callOf(node);
		default:
			return UNKNOWN;
	}
}

function callOf(node: AnyNode): SemanticValueSet {
	const callee = node.callee as AnyNode | undefined;
	if (callee?.type === 'Identifier') return { kind: 'call', callee: String(callee.name) };
	if (callee?.type !== 'MemberExpression' || callee.computed) return UNKNOWN;
	const method = getIdentifierName(callee.property as AnyNode);
	if (method === 'map') {
		const callback = asNodes(node.arguments)[0];
		return callback?.type === 'ArrowFunctionExpression' ||
			callback?.type === 'FunctionExpression'
			? { kind: 'array', elements: returnsOf(callback) }
			: { kind: 'array', elements: UNKNOWN };
	}
	if (method && KEEPS_ELEMENTS.has(method)) {
		const receiver = valueSetOf(callee.object as AnyNode);
		return receiver.kind === 'array' || receiver.kind === 'call' ? receiver : UNKNOWN;
	}
	return UNKNOWN;
}

function objectOf(node: AnyNode): SemanticValueSet {
	let fields: Record<string, SemanticValueSet> = {};
	for (const property of asNodes(node.properties)) {
		if (property.type === 'SpreadElement') {
			const spread = valueSetOf(property.argument as AnyNode);
			// A spread of unknown keys may replace any field written before it.
			fields = spread.kind === 'object' ? { ...fields, ...spread.fields } : {};
			continue;
		}
		if (property.type !== 'Property' || property.computed || property.kind !== 'init') continue;
		const key = property.key as AnyNode;
		const name =
			key.type === 'Identifier'
				? String(key.name)
				: typeof key.value === 'string'
					? key.value
					: undefined;
		if (name === undefined) continue;
		fields[name] = property.shorthand ? UNKNOWN : valueSetOf(property.value as AnyNode);
	}
	return { kind: 'object', fields };
}

/** Either set's values: literals join, objects join field by field, arrays join their elements; anything else is unknown. */
export function union(a: SemanticValueSet, b: SemanticValueSet): SemanticValueSet {
	if (a.kind === 'literals' && b.kind === 'literals')
		return { kind: 'literals', values: [...new Set([...a.values, ...b.values])] };
	if (a.kind === 'array' && b.kind === 'array')
		return { kind: 'array', elements: union(a.elements, b.elements) };
	if (a.kind === 'object' && b.kind === 'object') {
		const fields: Record<string, SemanticValueSet> = {};
		for (const name of Object.keys(a.fields))
			if (Object.hasOwn(b.fields, name))
				fields[name] = union(a.fields[name]!, b.fields[name]!);
		return { kind: 'object', fields };
	}
	if (a.kind === 'call' && b.kind === 'call' && a.callee === b.callee) return a;
	return UNKNOWN;
}
