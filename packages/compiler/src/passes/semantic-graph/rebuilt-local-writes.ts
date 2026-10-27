import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';

// A body const a handler reads is rebuilt from its definition for every run, so any change made to it is lost.
// Fail closed: a method is a read only when the receiver's kind is known and the method is on that kind's read list.

type ValueKind =
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

const ARRAY_READS = new Set([
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
const READS: Record<Exclude<ValueKind, 'primitive' | 'regexp' | 'unknown' | 'date'>, Set<string>> =
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
const MUTATING_STATICS = new Set([
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

export type RebuiltLocalWrite = { readonly source: string; readonly call: boolean };

/** How `reference` (a read of a rebuilt body const defined by `init`) changes it, or null for a read. */
export function rebuiltLocalWrite(
	reference: AnyNode,
	ancestors: ReadonlyArray<AnyNode>,
	init: AnyNode,
	source: string,
): RebuiltLocalWrite | null {
	let node = reference;
	let depth = ancestors.length - 1;
	const path: Array<string | null> = [];
	for (; depth >= 0; depth--) {
		const parent = ancestors[depth]!;
		if (isTransparent(parent)) {
			node = parent;
			continue;
		}
		if (parent.type !== 'MemberExpression' || parent.object !== node) break;
		path.push(parent.computed === true ? null : getIdentifierName(parent.property as AnyNode));
		node = parent;
	}
	const parent = depth >= 0 ? ancestors[depth] : undefined;
	const written = (call = false) => ({
		source: source.slice(parent?.start ?? node.start, parent?.end ?? node.end),
		call,
	});
	if (!parent) return null;
	if (path.length > 0) {
		if (
			(parent.type === 'AssignmentExpression' && parent.left === node) ||
			(parent.type === 'UpdateExpression' && parent.argument === node) ||
			(parent.type === 'UnaryExpression' && parent.operator === 'delete')
		)
			return written();
		if (parent.type === 'CallExpression' && parent.callee === node) {
			const method = path[path.length - 1];
			const receiverPath = path.slice(0, -1);
			if (callsArrowMember(init, receiverPath, method ?? null, getIdentifierName(reference)))
				return null;
			const receiver = kindAtPath(valueKind(init), init, receiverPath);
			if (method && isRead(receiver, method)) return null;
			// A known kind's method off its read list changes it; an unknown one only might.
			return written(receiver === 'unknown' || receiver === 'object' || !method);
		}
		return null;
	}
	const callee = parent.callee as AnyNode | undefined;
	if (
		parent.type === 'CallExpression' &&
		callee &&
		asNodes(parent.arguments)[0] === node &&
		MUTATING_STATICS.has(source.slice(callee.start, callee.end))
	)
		return written();
	return null;
}

// `actions[op]()` over `{ inc: () => ..., dec: () => ... }`: an arrow has no `this`,
// so calling one changes the object only if its body names the object.
function callsArrowMember(
	init: AnyNode,
	receiverPath: ReadonlyArray<string | null>,
	method: string | null,
	localName: string | null,
): boolean {
	if (receiverPath.some((key) => key === null)) return false;
	let receiver = unwrap(init);
	for (const key of receiverPath) receiver = receiver && propertyValue(receiver, key!);
	if (receiver?.type !== 'ObjectExpression') return false;
	const properties = asNodes(receiver.properties);
	const called =
		method === null ? properties.map((property) => property.value as AnyNode | undefined) : [propertyValue(receiver, method)];
	return (
		called.length > 0 &&
		properties.every((property) => property.type === 'Property') &&
		called.every(
			(value) => value?.type === 'ArrowFunctionExpression' && !namesIdentifier(value, localName),
		)
	);
}

function propertyValue(object: AnyNode, key: string): AnyNode | undefined {
	if (object.type !== 'ObjectExpression') return undefined;
	return unwrap(
		asNodes(object.properties).find(
			(property) =>
				property.type === 'Property' &&
				property.computed !== true &&
				(getIdentifierName(property.key as AnyNode) ?? (property.key as AnyNode).value) === key,
		)?.value as AnyNode | undefined,
	);
}

function namesIdentifier(node: AnyNode, name: string | null): boolean {
	if (name === null) return true;
	if (node.type === 'Identifier' && node.name === name) return true;
	for (const value of Object.values(node))
		for (const child of Array.isArray(value) ? value : [value])
			if (child && typeof child === 'object' && typeof (child as AnyNode).type === 'string')
				if (namesIdentifier(child as AnyNode, name)) return true;
	return false;
}

function isTransparent(node: AnyNode): boolean {
	return (
		node.type === 'ParenthesizedExpression' ||
		node.type === 'ChainExpression' ||
		node.type === 'TSNonNullExpression' ||
		node.type === 'TSAsExpression' ||
		node.type === 'TSSatisfiesExpression'
	);
}

function isRead(kind: ValueKind, method: string): boolean {
	if (kind === 'primitive' || kind === 'regexp') return true;
	if (kind === 'unknown') return false;
	if (kind === 'date') return method.startsWith('get') || method.startsWith('to') || method === 'valueOf';
	return READS[kind].has(method) || OBJECT_READS.has(method);
}

// The kind of the value at `path` inside a literal, as far as the literal shows it.
function kindAtPath(kind: ValueKind, init: AnyNode, path: ReadonlyArray<string | null>): ValueKind {
	let current: AnyNode | undefined = unwrap(init);
	let currentKind = kind;
	for (const key of path) {
		if (currentKind === 'primitive') return 'primitive';
		if (!current || key === null) return 'unknown';
		if (current.type === 'ObjectExpression') {
			current = unwrap(
				asNodes(current.properties).find(
					(property) =>
						property.type === 'Property' &&
						property.computed !== true &&
						(getIdentifierName(property.key as AnyNode) ?? (property.key as AnyNode).value) === key,
				)?.value as AnyNode | undefined,
			);
		} else if (current.type === 'ArrayExpression' && /^\d+$/.test(key)) {
			current = unwrap(asNodes(current.elements)[Number(key)]);
		} else if (currentKind === 'array' && key === 'length') {
			return 'primitive';
		} else {
			return 'unknown';
		}
		currentKind = current ? valueKind(current) : 'unknown';
	}
	return currentKind;
}

function valueKind(input: AnyNode): ValueKind {
	const node = unwrap(input);
	if (!node) return 'unknown';
	if (node.type === 'ArrayExpression') return 'array';
	if (node.type === 'ObjectExpression') return 'object';
	if (node.type === 'Literal') return node.regex ? 'regexp' : 'primitive';
	if (node.type === 'TemplateLiteral') return 'primitive';
	if (node.type === 'NewExpression')
		return CONSTRUCTED[getIdentifierName(node.callee as AnyNode) ?? ''] ?? 'unknown';
	return 'unknown';
}

function unwrap(node: AnyNode | undefined): AnyNode | undefined {
	let current = node;
	while (current && isTransparent(current)) current = current.expression as AnyNode | undefined;
	return current;
}
