import { asNodes, getIdentifierName, unwrapTypeAssertion, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type { SemanticGraphBinding, SemanticStateClassInstance } from '../../artifacts.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { isClassInstanceValue } from './collect-state.ts';
import { rowItemRead } from './row-item-read.ts';
import type { WalkState } from './types.ts';

/** The class instances a state() initializer spells: the whole value, root array elements, and object fields. */
export function stateClassInstances(
	initial: AnyNode | undefined,
	state: WalkState,
): SemanticStateClassInstance[] {
	const found: SemanticStateClassInstance[] = [];
	const visit = (node: AnyNode | undefined, path: ReadonlyArray<string>, element: boolean) => {
		const value = constantInitializer(unwrapTypeAssertion(node), state);
		if (!value) return;
		if (isClassInstanceValue(value, state.semantic)) {
			const span = sourceSpan(value, state.filename);
			found.push({
				path,
				...(element ? { element: true as const } : {}),
				constructorName: constructorName(value, state),
				source: expressionSource(value, state.source),
				...(span ? { sourceSpan: span } : {}),
			});
			return;
		}
		if (value.type === 'ArrayExpression' && !element) {
			for (const item of asNodes(value.elements)) {
				if (item.type !== 'SpreadElement') visit(item, path, true);
			}
			return;
		}
		if (value.type !== 'ObjectExpression' || element) return;
		for (const property of asNodes(value.properties)) {
			if (property.type !== 'Property' || property.computed === true) continue;
			const key = propertyKey(property.key as AnyNode | undefined);
			if (key !== null) visit(property.value as AnyNode | undefined, [...path, key], false);
		}
	};
	visit(initial, [], false);
	return found;
}

/** The state binding and class instance a receiver names: a state path, or the item of a row over a state array. */
export function stateClassInstanceAt(
	receiver: AnyNode | undefined,
	state: WalkState,
): { readonly binding: SemanticGraphBinding; readonly instance: SemanticStateClassInstance } | null {
	const held = stateClassValueAt(receiver, state);
	if (!held) return null;
	if (held.member.length > 0) return null;
	const instance = held.binding.classInstances?.find(
		(candidate) => (candidate.element === true) === held.row && samePath(candidate.path, held.path),
	);
	return instance ? { binding: held.binding, instance } : null;
}

/**
 * The state binding an expression reads, with its path, when that binding holds a class instance.
 * The receiver is resolved through the analyzer's scopes, so a parameter that shadows the state
 * name is not the state. `row` marks the item of a `@for` over the binding's array at `path`;
 * `member` is what the expression reads below the value at `path` (or below the row item).
 */
export function stateClassValueAt(
	expression: AnyNode | undefined,
	state: WalkState,
): {
	readonly binding: SemanticGraphBinding;
	readonly path: ReadonlyArray<string>;
	readonly row: boolean;
	readonly member: ReadonlyArray<string>;
} | null {
	if (state.stateClassBindings.size === 0) return null;
	const value = unwrapTypeAssertion(expression);
	if (value?.type !== 'Identifier' && value?.type !== 'MemberExpression') return null;
	const row = rowItemRead(value, state);
	if (row) {
		if (row.index) return null;
		const repeat = state.graph.keyedRepeats.find((candidate) => candidate.id === row.repeatId);
		const binding = stateBindingWithId(repeat?.collectionGraphNodeId, state);
		if (!binding?.classInstances) return null;
		return { binding, path: repeat?.collectionPath ?? [], row: true, member: row.path };
	}
	const path: string[] = [];
	let root: AnyNode | undefined = value;
	while (root?.type === 'MemberExpression') {
		if (root.computed === true) return null;
		const property = getIdentifierName(root.property as AnyNode | undefined);
		if (!property) return null;
		path.unshift(property);
		root = root.object as AnyNode | undefined;
	}
	if (root?.type !== 'Identifier' || typeof root.start !== 'number') return null;
	const symbol = resolvedSymbolAt(state.semantic(), root.start);
	const bindingId = symbol === null ? undefined : state.stateClassBindings.get(symbol);
	const binding = stateBindingWithId(bindingId, state);
	if (!binding) return null;
	const at = binding.classInstances?.find(
		(candidate) => !candidate.element && samePath(candidate.path, path.slice(0, candidate.path.length)),
	)?.path.length;
	return at === undefined
		? { binding, path, row: false, member: [] }
		: { binding, path: path.slice(0, at), row: false, member: path.slice(at) };
}

/** Records the analyzer symbol a state() declaration binds, when its initializer holds a class instance. */
export function rememberStateClassBinding(
	declared: AnyNode,
	binding: SemanticGraphBinding,
	state: WalkState,
): void {
	if (!binding.classInstances || typeof declared.start !== 'number') return;
	const semantic = state.semantic();
	const symbol = semantic.bindings.find(
		(candidate) => candidate.declarations[0]?.start === declared.start,
	);
	if (symbol) state.stateClassBindings.set(symbol.id, binding.id);
}

// `const inst = new Cart(); state(inst)`: a name declared once and never reassigned stands for its initializer.
function constantInitializer(node: AnyNode | undefined, state: WalkState): AnyNode | undefined {
	if (node?.type !== 'Identifier' || typeof node.start !== 'number') return node;
	const semantic = state.semantic();
	const symbol = resolvedSymbolAt(semantic, node.start);
	const binding = symbol === null ? undefined : semantic.bindings[symbol];
	if (!binding || binding.declarations.length !== 1) return node;
	if (binding.references.some((reference) => reference.isWrite)) return node;
	const declarator = semantic.parentOf(binding.declarations[0]!) as unknown as AnyNode | null;
	if (declarator?.type !== 'VariableDeclarator' || declarator.id !== binding.declarations[0]) return node;
	const init = unwrapTypeAssertion(declarator.init as AnyNode | undefined);
	return init?.type === 'NewExpression' ? init : node;
}

function stateBindingWithId(
	id: string | undefined,
	state: WalkState,
): SemanticGraphBinding | undefined {
	if (id === undefined) return undefined;
	return state.graph.graphBindings.find(
		(binding) => binding.id === id && binding.kind === 'state',
	);
}

function samePath(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
	return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function constructorName(node: AnyNode, state: WalkState): string {
	const callee = node.callee as AnyNode | undefined;
	const name = getIdentifierName(callee);
	if (name) return name.startsWith('new ') ? name.slice('new '.length) : name;
	return (callee && expressionSource(callee, state.source)) || 'class';
}

function propertyKey(key: AnyNode | undefined): string | null {
	if (key?.type === 'Identifier') return getIdentifierName(key);
	if (key?.type === 'Literal' && typeof key.value === 'string') return key.value;
	return null;
}
