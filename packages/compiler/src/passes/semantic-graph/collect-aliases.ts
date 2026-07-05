import { asNodes, isNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	graphBindingMap,
	graphPathSource,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import type { SemanticGraphBinding } from '../../artifacts.ts';
import { graphDestructureDefaultUnsupportedDiagnostic } from './diagnostics.ts';
import type { WalkState } from './types.ts';

export function collectDestructuredAliases(
	id: AnyNode | undefined,
	init: AnyNode,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): void {
	if (id?.type !== 'ObjectPattern' && id?.type !== 'ArrayPattern') return;

	const resolved = resolveGraphPath(
		expressionSource(init, state.source),
		graphBindingMap(state.graph, currentGraphScope(state)),
		semanticAliasMap(state.graph, currentGraphScope(state)),
	);
	if (!resolved) return;

	const targetBase = graphPathSource(resolved.binding, resolved.path);
	if (id.type === 'ObjectPattern') {
		collectObjectPatternAliases(id, targetBase, declarationKind, state);
		return;
	}

	collectArrayPatternAliases(id, targetBase, declarationKind, state);
}

export function collectWholeBindingAlias(
	id: AnyNode | undefined,
	init: AnyNode,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): void {
	const local = localAliasIdentifier(id);
	if (!local) return;

	const resolved = resolveGraphPath(
		expressionSource(init, state.source),
		graphBindingMap(state.graph, currentGraphScope(state)),
		semanticAliasMap(state.graph, currentGraphScope(state)),
	);
	if (!resolved) return;
	if (resolved.path.length > 0) return;

	state.graph.aliases.push({
		name: local.name,
		target: graphPathSource(resolved.binding, resolved.path),
		...sharedScope(state),
		declarationKind,
		sourceSpan: sourceSpan(local, state.filename),
	});
}

export function collectObjectPatternAliases(
	pattern: AnyNode,
	targetBase: string,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): void {
	const excludedPaths = objectPatternExcludedPaths(pattern);

	for (const property of asNodes(pattern.properties)) {
		if (property.type === 'RestElement') {
			const local = localAliasIdentifier(property.argument as AnyNode | undefined);
			if (!local) continue;

			state.graph.aliases.push({
				name: local.name,
				target: targetBase,
				...sharedScope(state),
				excludedPaths,
				declarationKind,
				sourceSpan: sourceSpan(local, state.filename),
			});
			continue;
		}

		if (property.type !== 'Property') continue;

		const key = objectPropertyKey(property.key as AnyNode | undefined);
		if (!key) continue;

		const target = `${targetBase}.${key}`;
		const value = property.value as AnyNode | undefined;
		if (value?.type === 'AssignmentPattern') {
			diagnoseDefaultAlias(value, target, state);
			continue;
		}

		const nested = nestedDestructuringPattern(value);
		if (nested?.type === 'ObjectPattern') {
			collectObjectPatternAliases(nested, target, declarationKind, state);
			continue;
		}
		if (nested?.type === 'ArrayPattern') {
			collectArrayPatternAliases(nested, target, declarationKind, state);
			continue;
		}

		const local = localAliasIdentifier(value);
		if (!local) continue;

		state.graph.aliases.push({
			name: local.name,
			target,
			...sharedScope(state),
			declarationKind,
			sourceSpan: sourceSpan(local, state.filename),
		});
	}
}

export function collectArrayPatternAliases(
	pattern: AnyNode,
	targetBase: string,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): void {
	const elements = Array.isArray(pattern.elements) ? pattern.elements : [];

	elements.forEach((element, index) => {
		if (!isNode(element)) return;
		if (element.type === 'RestElement') return;

		const target = `${targetBase}.${index}`;
		if (element.type === 'AssignmentPattern') {
			diagnoseDefaultAlias(element, target, state);
			return;
		}

		const nested = nestedDestructuringPattern(element);
		if (nested?.type === 'ObjectPattern') {
			collectObjectPatternAliases(nested, target, declarationKind, state);
			return;
		}
		if (nested?.type === 'ArrayPattern') {
			collectArrayPatternAliases(nested, target, declarationKind, state);
			return;
		}

		const local = localAliasIdentifier(element);
		if (!local) return;

		state.graph.aliases.push({
			name: local.name,
			target,
			...sharedScope(state),
			declarationKind,
			sourceSpan: sourceSpan(local, state.filename),
		});
	});
}

function currentGraphScope(state: WalkState): string | null {
	return state.currentSharedDefinitionId ?? null;
}

function sharedScope(state: WalkState): { readonly sharedDefinitionId?: string } {
	return state.currentSharedDefinitionId
		? { sharedDefinitionId: state.currentSharedDefinitionId }
		: {};
}

function diagnoseDefaultAlias(node: AnyNode, target: string, state: WalkState): void {
	const local = localAliasIdentifier(node);
	if (!local) return;

	state.graph.diagnostics.push(
		graphDestructureDefaultUnsupportedDiagnostic({
			localName: local.name,
			target,
			source: expressionSource(node, state.source),
			sourceSpan: sourceSpan(node, state.filename),
		}),
	);
}

function objectPatternExcludedPaths(pattern: AnyNode): ReadonlyArray<ReadonlyArray<string>> {
	return asNodes(pattern.properties).flatMap((property) => {
		if (property.type !== 'Property') return [];

		const key = objectPropertyKey(property.key as AnyNode | undefined);
		return key ? [[key]] : [];
	});
}

function nestedDestructuringPattern(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern') return node;

	if (node.type === 'AssignmentPattern') {
		return nestedDestructuringPattern(node.left as AnyNode | undefined);
	}

	return null;
}

function localAliasIdentifier(
	node: AnyNode | undefined,
): ({ readonly name: string } & AnyNode) | null {
	if (!node) return null;
	if (typeof node.name === 'string') return node as { readonly name: string } & AnyNode;

	if (node.type === 'AssignmentPattern') {
		return localAliasIdentifier(node.left as AnyNode | undefined);
	}

	return null;
}

function objectPropertyKey(node: AnyNode | undefined): string | null {
	if (!node) return null;
	if (typeof node.name === 'string') return node.name;
	if (typeof node.value === 'string' || typeof node.value === 'number') return String(node.value);
	return null;
}
