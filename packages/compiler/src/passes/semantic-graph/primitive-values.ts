import { asNodes, type AnyNode } from '../../ast/nodes.ts';
import type { SemanticGraphBinding } from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import type { ModuleSemantics } from './shared-ast.ts';
import type { WalkState } from './types.ts';

// What a value is decided from: a string or a number handed to a function cannot be changed through it.

const PRIMITIVE_GLOBAL_CALLS = new Set([
	'Boolean',
	'Number',
	'String',
	'BigInt',
	'isFinite',
	'isNaN',
	'parseFloat',
	'parseInt',
	'encodeURI',
	'encodeURIComponent',
	'decodeURI',
	'decodeURIComponent',
]);
const PRIMITIVE_STATICS: Readonly<Record<string, ReadonlySet<string> | 'all'>> = {
	Math: 'all',
	Date: new Set(['now', 'parse', 'UTC']),
	JSON: new Set(['stringify']),
	Number: new Set(['isFinite', 'isInteger', 'isNaN', 'isSafeInteger', 'parseFloat', 'parseInt']),
	Array: new Set(['isArray']),
	Object: new Set(['is', 'hasOwn', 'isFrozen', 'isSealed', 'isExtensible']),
};
// Methods that answer a string, a number or a boolean whatever they are called on.
const PRIMITIVE_METHODS = new Set([
	'charAt',
	'charCodeAt',
	'codePointAt',
	'endsWith',
	'every',
	'findIndex',
	'findLastIndex',
	'getDate',
	'getDay',
	'getFullYear',
	'getHours',
	'getMilliseconds',
	'getMinutes',
	'getMonth',
	'getSeconds',
	'getTime',
	'has',
	'includes',
	'indexOf',
	'join',
	'lastIndexOf',
	'localeCompare',
	'padEnd',
	'padStart',
	'repeat',
	'replace',
	'replaceAll',
	'some',
	'startsWith',
	'substring',
	'test',
	'toDateString',
	'toFixed',
	'toISOString',
	'toLocaleDateString',
	'toLocaleString',
	'toLocaleTimeString',
	'toLowerCase',
	'toPrecision',
	'toString',
	'toUpperCase',
	'trim',
	'trimEnd',
	'trimStart',
]);
const PRIMITIVE_TYPES = new Set([
	'TSStringKeyword',
	'TSNumberKeyword',
	'TSBooleanKeyword',
	'TSBigIntKeyword',
	'TSSymbolKeyword',
	'TSNullKeyword',
	'TSUndefinedKeyword',
	'TSVoidKeyword',
	'TSLiteralType',
	'TSTemplateLiteralType',
]);

const scalarMemo = new WeakMap<WalkState, Map<string, boolean>>();

/** Whether a static state path (`user.first`, `count`) holds a primitive, by its declaration or initial value. */
export function isPrimitivePath(target: string, state: WalkState): boolean {
	const scope = state.currentSharedDefinitionId ?? null;
	const resolved = resolveGraphPath(
		target,
		graphBindingMap(state.graph, scope),
		semanticAliasMap(state.graph, scope),
	);
	if (!resolved) return false;
	if (resolved.path.length === 0) return isScalarState(resolved.binding, state);
	if (!resolved.binding.initialValueKnown) return false;
	let value: unknown = resolved.binding.initialValue;
	for (const segment of resolved.path) {
		if (typeof value !== 'object' || value === null) return false;
		value = (value as Record<string, unknown>)[segment];
	}
	return value !== undefined && (typeof value !== 'object' || value === null);
}

/** Whether a type annotation names only strings, numbers, booleans and their like. */
export function isPrimitiveType(type: AnyNode | undefined): boolean {
	const node = type?.type === 'TSTypeAnnotation' ? (type.typeAnnotation as AnyNode) : type;
	if (!node) return false;
	if (PRIMITIVE_TYPES.has(node.type ?? '')) return true;
	if (node.type === 'TSUnionType')
		return asNodes(node.types).every((member) => isPrimitiveType(member));
	if (node.type === 'TSParenthesizedType') return isPrimitiveType(node.typeAnnotation as AnyNode);
	return false;
}

/** Whether the expression can only evaluate to a string, number, boolean, null or undefined. */
export function isPrimitiveExpression(
	node: AnyNode | undefined,
	state: WalkState,
	depth = 0,
): boolean {
	if (!node || depth > 8) return false;
	const next = (child: unknown) => isPrimitiveExpression(child as AnyNode, state, depth + 1);
	switch (node.type) {
		case 'Literal':
			return !('regex' in node && node.regex);
		case 'TemplateLiteral':
		case 'UpdateExpression':
			return true;
		case 'UnaryExpression':
			return node.operator !== 'delete';
		case 'BinaryExpression':
			return true;
		case 'LogicalExpression':
			return next(node.left) && next(node.right);
		case 'ConditionalExpression':
			return next(node.consequent) && next(node.alternate);
		case 'ParenthesizedExpression':
		case 'ChainExpression':
		case 'TSNonNullExpression':
			return next(node.expression);
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
			return isPrimitiveType(node.typeAnnotation as AnyNode) || next(node.expression);
		case 'MemberExpression':
			return (
				node.computed !== true && (node.property as AnyNode | undefined)?.name === 'length'
			);
		case 'CallExpression':
			return isPrimitiveCall(node, state);
		case 'Identifier':
			return isPrimitiveName(node, state, depth);
		default:
			return false;
	}
}

function isPrimitiveCall(call: AnyNode, state: WalkState): boolean {
	const callee = call.callee as AnyNode | undefined;
	if (!callee) return false;
	if (callee.type === 'Identifier') {
		return PRIMITIVE_GLOBAL_CALLS.has(callee.name as string) && isGlobal(callee, state);
	}
	if (callee.type !== 'MemberExpression' || callee.computed === true) return false;
	const method = (callee.property as AnyNode | undefined)?.name as string | undefined;
	if (!method) return false;
	const owner = callee.object as AnyNode | undefined;
	if (owner?.type === 'Identifier' && isGlobal(owner, state)) {
		const statics = PRIMITIVE_STATICS[owner.name as string];
		if (statics === 'all' || statics?.has(method)) return true;
	}
	return PRIMITIVE_METHODS.has(method);
}

function isGlobal(identifier: AnyNode, state: WalkState): boolean {
	return (
		typeof identifier.start === 'number' &&
		resolvedSymbolAt(state.semantic(), identifier.start) === null
	);
}

function isPrimitiveName(identifier: AnyNode, state: WalkState, depth: number): boolean {
	if (typeof identifier.start !== 'number') return false;
	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, identifier.start);
	if (symbolId === null) return identifier.name === 'undefined' || identifier.name === 'NaN';
	const binding = semantic.bindings[symbolId]!;
	return isPrimitiveBinding(binding, semantic, state, depth);
}

function isPrimitiveBinding(
	binding: ModuleSemantics['bindings'][number],
	semantic: ModuleSemantics,
	state: WalkState,
	depth: number,
): boolean {
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	if (!declaration) return false;
	if (isPrimitiveType(declaration.typeAnnotation as AnyNode | undefined)) return true;
	const parent = semantic.parentOf(declaration as never) as unknown as AnyNode | null;
	if (parent?.type === 'VariableDeclarator' && parent.id === declaration) {
		const graphBinding = state.graph.graphBindings.find(
			(candidate) =>
				candidate.sourceSpan?.start === declaration.start &&
				candidate.name === binding.name,
		);
		if (graphBinding) return isScalarState(graphBinding, state);
		if (binding.references.some((reference) => reference.isWrite)) return false;
		return isPrimitiveExpression(parent.init as AnyNode | undefined, state, depth + 1);
	}
	return isPrimitiveParameter(declaration, semantic);
}

// `{ menu }: { menu: string }` - a destructured parameter whose own type is primitive.
function isPrimitiveParameter(declaration: AnyNode, semantic: ModuleSemantics): boolean {
	const property = semantic.parentOf(declaration as never) as unknown as AnyNode | null;
	const target =
		property?.type === 'AssignmentPattern'
			? (semantic.parentOf(property as never) as unknown as AnyNode | null)
			: property;
	if (target?.type !== 'Property') return false;
	const key =
		(target.key as AnyNode | undefined)?.name ?? (target.key as AnyNode | undefined)?.value;
	const pattern = semantic.parentOf(target as never) as unknown as AnyNode | null;
	if (pattern?.type !== 'ObjectPattern') return false;
	return isPrimitiveType(memberType(pattern.typeAnnotation as AnyNode | undefined, String(key)));
}

function memberType(type: AnyNode | undefined, key: string): AnyNode | undefined {
	const literal = type?.type === 'TSTypeAnnotation' ? (type.typeAnnotation as AnyNode) : type;
	if (literal?.type !== 'TSTypeLiteral') return undefined;
	for (const member of asNodes(literal.members)) {
		if (member.type !== 'TSPropertySignature') continue;
		const name =
			(member.key as AnyNode | undefined)?.name ?? (member.key as AnyNode | undefined)?.value;
		if (name === key) return member.typeAnnotation as AnyNode | undefined;
	}
	return undefined;
}

// Declared so, created from a primitive, or (initial value unknown) only ever written with primitives.
export function isScalarState(binding: SemanticGraphBinding, state: WalkState): boolean {
	if (binding.valueKind === 'scalar') return true;
	if (binding.valueKind === 'object' || binding.valueKind === 'array') return false;
	if (binding.kind !== 'state') return false;
	let memo = scalarMemo.get(state);
	if (!memo) scalarMemo.set(state, (memo = new Map()));
	const known = memo.get(binding.id);
	if (known !== undefined) return known;
	memo.set(binding.id, false);
	const verdict = scalarVerdict(binding, state);
	memo.set(binding.id, verdict);
	return verdict;
}

function scalarVerdict(binding: SemanticGraphBinding, state: WalkState): boolean {
	const semantic = state.semantic();
	const span = binding.sourceSpan ?? state.stateDeclarations.get(binding.id);
	const id =
		typeof span?.start === 'number' ? nodeAt(semantic, span.start, span.end as number) : null;
	const declarator = id && (semantic.parentOf(id as never) as unknown as AnyNode | null);
	const call =
		declarator?.type === 'VariableDeclarator'
			? (declarator.init as AnyNode | undefined)
			: undefined;
	if (isPrimitiveType(id?.typeAnnotation as AnyNode | undefined)) return true;
	if (call?.type === 'CallExpression') {
		const typeArgument = asNodes((call.typeArguments as AnyNode | undefined)?.params)[0];
		if (typeArgument && isPrimitiveType(typeArgument)) return true;
		if (isPrimitiveExpression(asNodes(call.arguments)[0], state)) return true;
	}
	let evidence = false;
	for (const write of state.graph.stateWrites) {
		if (write.target !== binding.name || write.componentName !== binding.componentName)
			continue;
		if (write.operation === 'update') {
			evidence = true;
			continue;
		}
		if (write.operation !== 'assign') return false;
		if (
			write.assignmentOperator &&
			write.assignmentOperator !== '??=' &&
			write.assignmentOperator !== '||='
		) {
			evidence = true;
			continue;
		}
		const value = write.valueSpan
			? nodeAt(semantic, write.valueSpan.start, write.valueSpan.end)
			: null;
		if (isNullish(value)) continue;
		if (!isPrimitiveExpression(value ?? undefined, state)) return false;
		evidence = true;
	}
	return evidence;
}

function isNullish(node: AnyNode | null): boolean {
	return (
		(node?.type === 'Literal' && node.value === null) ||
		(node?.type === 'Identifier' && node.name === 'undefined')
	);
}

function nodeAt(semantic: ModuleSemantics, start: number, end: number): AnyNode | null {
	let node = semantic.nodeAt(start) as unknown as AnyNode | null;
	while (node && !(node.start === start && node.end === end)) {
		const parent = semantic.parentOf(node as never) as unknown as AnyNode | null;
		if (!parent || (parent.start as number) < start || (parent.end as number) > end)
			return null;
		node = parent;
	}
	return node;
}
