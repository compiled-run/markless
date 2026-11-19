import { asNodes, getIdentifierName, unwrapTypeAssertion, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import type { SemanticGraphBinding, SemanticStateClassInstance } from '../../artifacts.ts';
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
		const value = unwrapTypeAssertion(node);
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
	if (!state.graph.graphBindings.some((binding) => binding.classInstances)) return null;
	const value = unwrapTypeAssertion(receiver);
	if (value?.type !== 'Identifier' && value?.type !== 'MemberExpression') return null;
	const row = rowItemRead(value, state);
	if (row) {
		if (row.index || row.path.length > 0) return null;
		const repeat = state.graph.keyedRepeats.find((candidate) => candidate.id === row.repeatId);
		const binding = stateBindingWithId(repeat?.collectionGraphNodeId, state);
		const instance = binding?.classInstances?.find(
			(candidate) => candidate.element && samePath(candidate.path, repeat?.collectionPath ?? []),
		);
		return binding && instance ? { binding, instance } : null;
	}
	const resolved = stateValueAt(value, state);
	if (!resolved) return null;
	const instance = resolved.binding.classInstances?.find(
		(candidate) => !candidate.element && samePath(candidate.path, resolved.path),
	);
	return instance ? { binding: resolved.binding, instance } : null;
}

/** The state binding and path an expression names, or the state collection a row item comes from. */
export function stateValueAt(
	expression: AnyNode,
	state: WalkState,
): { readonly binding: SemanticGraphBinding; readonly path: ReadonlyArray<string> } | null {
	const row = rowItemRead(expression, state);
	if (row) {
		const repeat = state.graph.keyedRepeats.find((candidate) => candidate.id === row.repeatId);
		const binding = stateBindingWithId(repeat?.collectionGraphNodeId, state);
		return binding ? { binding, path: [...(repeat?.collectionPath ?? []), ...row.path] } : null;
	}
	const resolved = resolveGraphPath(
		expressionSource(expression, state.source),
		graphBindingMap(state.graph, state.currentSharedDefinitionId, state.currentComponentName),
		semanticAliasMap(state.graph, state.currentSharedDefinitionId, state.currentComponentName),
	);
	if (!resolved || resolved.binding.kind !== 'state') return null;
	if (resolved.binding.sharedDefinitionId !== undefined) return null;
	return { binding: resolved.binding, path: resolved.path };
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
