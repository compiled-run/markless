import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import type { ModuleSemantics } from './shared-ast.ts';

type Scope = ReturnType<ModuleSemantics['scopeOf']>;

/** A step down a state value: one element of an array, or one named property. */
export type ValueStep = { readonly element: true } | { readonly property: string };

/** What sits at a path inside a state's value, read from its starting value or its declared type. */
export type ValueShape = 'array' | 'keyed' | 'unknown';

const KEYED_CONSTRUCTORS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);
const KEYED_TYPES = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'ReadonlyMap', 'ReadonlySet']);
const ARRAY_TYPES = new Set(['Array', 'ReadonlyArray']);
const ASSERTIONS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

/**
 * The shape at `steps` inside the state `stateName` names where `from` stands. The starting
 * value decides first, then the type argument or an `as`/`satisfies` type; anything neither
 * pins down, or that two elements disagree on, is unknown.
 */
export function stateValueShape(
	semantic: ModuleSemantics,
	stateName: string,
	from: Scope,
	steps: ReadonlyArray<ValueStep>,
): ValueShape {
	const binding = semantic.lookup(stateName, { from });
	const declaration = binding?.declarations[0] as unknown as AnyNode | undefined;
	const declarator = declaration
		? (semantic.parentOf(declaration as never) as unknown as AnyNode | null)
		: null;
	const call = declarator?.type === 'VariableDeclarator' ? (declarator.init as AnyNode) : null;
	if (call?.type !== 'CallExpression') return 'unknown';
	const value = valueShape(asNodes(call.arguments)[0], steps, semantic);
	if (value !== 'unknown') return value;
	const typeArgument = asNodes((call.typeArguments as AnyNode | undefined)?.params)[0];
	return typeShape(typeArgument, steps, semantic, new Set());
}

function valueShape(
	node: AnyNode | undefined,
	steps: ReadonlyArray<ValueStep>,
	semantic: ModuleSemantics,
): ValueShape {
	if (!node) return 'unknown';
	if (node.type === 'ParenthesizedExpression')
		return valueShape(node.expression as AnyNode, steps, semantic);
	if (ASSERTIONS.has(node.type ?? '')) {
		const value = valueShape(node.expression as AnyNode, steps, semantic);
		return value !== 'unknown'
			? value
			: typeShape(node.typeAnnotation as AnyNode, steps, semantic, new Set());
	}
	const [step, ...rest] = steps;
	if (!step) {
		if (node.type === 'ArrayExpression') return 'array';
		if (
			node.type === 'NewExpression' &&
			isGlobal(node.callee as AnyNode, KEYED_CONSTRUCTORS, semantic)
		)
			return 'keyed';
		return 'unknown';
	}
	if ('element' in step) {
		if (node.type !== 'ArrayExpression') return 'unknown';
		const elements = asNodes(node.elements);
		if (elements.some((element) => element.type === 'SpreadElement')) return 'unknown';
		return agree(elements.map((element) => valueShape(element, rest, semantic)));
	}
	if (node.type !== 'ObjectExpression') return 'unknown';
	let found: AnyNode | undefined;
	for (const property of asNodes(node.properties)) {
		if (property.type !== 'Property' || property.computed === true) return 'unknown';
		if (propertyKey(property.key as AnyNode) === step.property)
			found = property.value as AnyNode;
	}
	return valueShape(found, rest, semantic);
}

function typeShape(
	node: AnyNode | undefined,
	steps: ReadonlyArray<ValueStep>,
	semantic: ModuleSemantics,
	seen: Set<AnyNode>,
): ValueShape {
	if (!node || seen.has(node)) return 'unknown';
	if (node.type === 'TSTypeAnnotation' || node.type === 'TSParenthesizedType')
		return typeShape(node.typeAnnotation as AnyNode, steps, semantic, seen);
	const [step, ...rest] = steps;
	if (node.type === 'TSArrayType') {
		if (!step) return 'array';
		return 'element' in step
			? typeShape(node.elementType as AnyNode, rest, semantic, seen)
			: 'unknown';
	}
	if (node.type === 'TSTypeReference') {
		const name = getIdentifierName(node.typeName as AnyNode);
		const local = name
			? semantic.lookup(name, { from: semantic.scopeOf(node as never), space: 'type' })
			: null;
		if (name && !local) {
			if (KEYED_TYPES.has(name)) return step ? 'unknown' : 'keyed';
			if (!ARRAY_TYPES.has(name)) return 'unknown';
			if (!step) return 'array';
			const element = asNodes((node.typeArguments as AnyNode | undefined)?.params)[0];
			return 'element' in step ? typeShape(element, rest, semantic, seen) : 'unknown';
		}
		const declaration = local?.declarations[0] as unknown as AnyNode | undefined;
		const declared = declaration
			? (semantic.parentOf(declaration as never) as unknown as AnyNode | null)
			: null;
		if (!declared) return 'unknown';
		seen.add(node);
		if (declared.type === 'TSTypeAliasDeclaration')
			return typeShape(declared.typeAnnotation as AnyNode, steps, semantic, seen);
		if (declared.type === 'TSInterfaceDeclaration' && !asNodes(declared.extends).length)
			return membersShape(
				asNodes((declared.body as AnyNode | undefined)?.body),
				steps,
				semantic,
				seen,
			);
		return 'unknown';
	}
	if (node.type === 'TSTypeLiteral')
		return membersShape(asNodes(node.members), steps, semantic, seen);
	return 'unknown';
}

function membersShape(
	members: ReadonlyArray<AnyNode>,
	steps: ReadonlyArray<ValueStep>,
	semantic: ModuleSemantics,
	seen: Set<AnyNode>,
): ValueShape {
	const [step, ...rest] = steps;
	if (!step || 'element' in step) return 'unknown';
	const member = members.find(
		(candidate) =>
			candidate.type === 'TSPropertySignature' &&
			candidate.computed !== true &&
			propertyKey(candidate.key as AnyNode) === step.property,
	);
	return typeShape(member?.typeAnnotation as AnyNode | undefined, rest, semantic, seen);
}

function agree(shapes: ReadonlyArray<ValueShape>): ValueShape {
	if (shapes.length === 0) return 'unknown';
	if (shapes.includes('keyed')) return 'keyed';
	return shapes.every((shape) => shape === 'array') ? 'array' : 'unknown';
}

function propertyKey(key: AnyNode | undefined): string | null {
	if (!key) return null;
	if (key.type === 'Identifier') return getIdentifierName(key);
	return key.type === 'Literal' && typeof key.value === 'string' ? key.value : null;
}

// `Map`, not a local that shadows it.
function isGlobal(
	node: AnyNode | undefined,
	names: ReadonlySet<string>,
	semantic: ModuleSemantics,
): boolean {
	const name = getIdentifierName(node);
	return (
		!!name &&
		names.has(name) &&
		!semantic.lookup(name, { from: semantic.scopeOf(node as never) })
	);
}
