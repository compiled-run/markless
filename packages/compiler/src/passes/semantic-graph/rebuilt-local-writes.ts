import { getIdentifierName, type AnyNode } from '../../ast/nodes.ts';

// Fail closed: a method is a read only when the receiver's kind is known and the method is on that kind's read list.

export type ValueKind =
	| 'array'
	| 'object'
	| 'map'
	| 'set'
	| 'weak-map'
	| 'weak-set'
	| 'date'
	| 'url'
	| 'search-params'
	| 'primitive'
	| 'regexp'
	| 'unknown';

export const ARRAY_READS = new Set([
	'at',
	'concat',
	'entries',
	'every',
	'filter',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flat',
	'flatMap',
	'forEach',
	'includes',
	'indexOf',
	'join',
	'keys',
	'lastIndexOf',
	'map',
	'reduce',
	'reduceRight',
	'slice',
	'some',
	'subarray',
	'toLocaleString',
	'toReversed',
	'toSorted',
	'toSpliced',
	'toString',
	'values',
	'with',
]);
const OBJECT_READS = new Set([
	'hasOwnProperty',
	'isPrototypeOf',
	'propertyIsEnumerable',
	'toLocaleString',
	'toString',
	'valueOf',
]);
export const READS: Record<Exclude<ValueKind, 'primitive' | 'regexp' | 'unknown' | 'date'>, Set<string>> =
	{
		array: ARRAY_READS,
		object: OBJECT_READS,
		map: new Set(['get', 'has', 'keys', 'values', 'entries', 'forEach']),
		set: new Set([
			'has',
			'keys',
			'values',
			'entries',
			'forEach',
			'union',
			'intersection',
			'difference',
			'symmetricDifference',
			'isSubsetOf',
			'isSupersetOf',
			'isDisjointFrom',
		]),
		'weak-map': new Set(['get', 'has']),
		'weak-set': new Set(['has']),
		url: new Set(['toString', 'toJSON']),
		'search-params': new Set(['get', 'getAll', 'has', 'keys', 'values', 'entries', 'forEach', 'toString']),
	};
const CONSTRUCTED: Record<string, ValueKind> = {
	Array: 'array',
	Map: 'map',
	Set: 'set',
	WeakMap: 'weak-map',
	WeakSet: 'weak-set',
	Date: 'date',
	URL: 'url',
	URLSearchParams: 'search-params',
	RegExp: 'regexp',
	ArrayBuffer: 'object',
	Int8Array: 'array',
	Uint8Array: 'array',
	Uint8ClampedArray: 'array',
	Int16Array: 'array',
	Uint16Array: 'array',
	Int32Array: 'array',
	Uint32Array: 'array',
	Float32Array: 'array',
	Float64Array: 'array',
	BigInt64Array: 'array',
	BigUint64Array: 'array',
};
// Built-ins that change their first argument.
export const MUTATING_STATICS = new Set([
	'Object.assign',
	'Object.defineProperty',
	'Object.defineProperties',
	'Object.setPrototypeOf',
	'Object.freeze',
	'Object.seal',
	'Object.preventExtensions',
	'Reflect.set',
	'Reflect.defineProperty',
	'Reflect.deleteProperty',
	'Reflect.setPrototypeOf',
	'Reflect.preventExtensions',
]);

export function isTransparent(node: AnyNode): boolean {
	return (
		node.type === 'ParenthesizedExpression' ||
		node.type === 'ChainExpression' ||
		node.type === 'TSNonNullExpression' ||
		node.type === 'TSAsExpression' ||
		node.type === 'TSSatisfiesExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSInstantiationExpression'
	);
}

export function isRead(kind: ValueKind, method: string): boolean {
	if (kind === 'primitive' || kind === 'regexp') return true;
	if (kind === 'unknown') return false;
	if (kind === 'date') return method.startsWith('get') || method.startsWith('to') || method === 'valueOf';
	return READS[kind].has(method) || OBJECT_READS.has(method);
}

export function valueKind(input: AnyNode): ValueKind {
	const node = unwrap(input);
	if (!node) return 'unknown';
	if (node.type === 'ArrayExpression') return 'array';
	if (node.type === 'ObjectExpression') return 'object';
	if (node.type === 'Literal') return node.regex ? 'regexp' : 'primitive';
	if (PRIMITIVE_RESULTS.has(node.type ?? '')) return 'primitive';
	if (node.type === 'CallExpression') {
		const callee = getIdentifierName(node.callee as AnyNode);
		return callee && PRIMITIVE_CALLS.has(callee) ? 'primitive' : 'unknown';
	}
	if (node.type === 'NewExpression')
		return CONSTRUCTED[getIdentifierName(node.callee as AnyNode) ?? ''] ?? 'unknown';
	return 'unknown';
}

// Expressions that always evaluate to a string, number, boolean, bigint or undefined.
const PRIMITIVE_RESULTS = new Set([
	'TemplateLiteral',
	'BinaryExpression',
	'UnaryExpression',
	'UpdateExpression',
]);
const PRIMITIVE_CALLS = new Set(['String', 'Number', 'Boolean', 'BigInt', 'parseInt', 'parseFloat']);

export function unwrap(node: AnyNode | undefined): AnyNode | undefined {
	let current = node;
	while (current && isTransparent(current)) current = current.expression as AnyNode | undefined;
	return current;
}
