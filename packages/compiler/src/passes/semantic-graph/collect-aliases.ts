import { asNodes, isNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	graphBindingMap,
	graphPathSource,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import type { SemanticGraphBinding } from '../../artifacts.ts';
import { resolveSharedInstanceGraphPath } from './collect-shared.ts';
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

	const initSource = expressionSource(init, state.source);
	const resolved = resolveGraphPath(
		initSource,
		graphBindingMap(state.graph, currentGraphScope(state)),
		semanticAliasMap(state.graph, currentGraphScope(state)),
	);
	if (!resolved) {
		collectSharedInstancePathAlias(local, initSource, declarationKind, state);
		return;
	}
	// A `let` naming a path can be reassigned to something off the graph, and a
	// name declared inside a nested callback is that callback's local, not the
	// component's - so only a `const` in the body itself is the path it names.
	if (resolved.path.length > 0 && (declarationKind !== 'const' || state.currentFunctionSite)) {
		return;
	}

	state.graph.aliases.push({
		name: local.name,
		target: graphPathSource(resolved.binding, resolved.path),
		...sharedScope(state),
		declarationKind,
		sourceSpan: sourceSpan(local, state.filename),
	});
}

/**
 * `const days = cal.days` where `cal` is a shared-instance local.
 *
 * The instance local exists only inside the component function, so the target is
 * kept as the authored path and `resolveSharedInstanceGraphPath` walks it: the
 * shared graph is scoped to the definition, and its bindings are filtered out of
 * the component's own binding map, so the alias cannot name one directly.
 */
function collectSharedInstancePathAlias(
	local: { readonly name: string } & AnyNode,
	initSource: string,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): void {
	if (declarationKind !== 'const' || state.currentFunctionSite) return;
	if (state.currentSharedDefinitionId) return;

	const segments = splitStaticGraphPath(initSource);
	if (segments.length < 2 || segments[0] === local.name) return;
	if (!resolveSharedInstanceGraphPath(initSource, state.graph, state.currentComponentName)) {
		return;
	}

	state.graph.aliases.push({
		name: local.name,
		target: initSource,
		...(state.currentComponentName ? { componentName: state.currentComponentName } : {}),
		declarationKind,
		sourceSpan: sourceSpan(local, state.filename),
	});
}

export function collectObjectPatternAliases(
	pattern: AnyNode,
	targetBase: string,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
	propOwner?: PropAliasOwner,
): void {
	const excludedPaths = objectPatternExcludedPaths(pattern);

	for (const property of asNodes(pattern.properties)) {
		if (property.type === 'RestElement') {
			const local = localAliasIdentifier(property.argument as AnyNode | undefined);
			if (!local) continue;

			const span = sourceSpan(local, state.filename);
			if (!span) continue;
			const bindingId = sourceBindingId(span);
			state.graph.aliases.push({
				name: local.name,
				target: targetBase,
				...(propOwner
					? {
							bindingId,
							componentId: propOwner.componentId,
							componentName: propOwner.componentName,
							propPath: propOwner.propPath,
						}
					: {}),
				...sharedScope(state),
				excludedPaths,
				declarationKind,
				sourceSpan: span,
			});
			if (propOwner)
				recordComponentPropBinding(local.name, bindingId, span, propOwner, state);
			continue;
		}

		if (property.type !== 'Property') continue;

		const key = objectPropertyKey(property.key as AnyNode | undefined);
		if (!key) continue;

		const target = `${targetBase}.${key}`;
		const value = property.value as AnyNode | undefined;
		if (value?.type === 'AssignmentPattern') {
			const owned = propOwner && {
				...propOwner,
				propPath: [...propOwner.propPath, key],
			};
			if (!owned || !recordDefaultedPropAlias(value, target, owned, state)) {
				diagnoseDefaultAlias(value, target, state);
			}
			continue;
		}

		const nested = nestedDestructuringPattern(value);
		if (nested?.type === 'ObjectPattern') {
			collectObjectPatternAliases(
				nested,
				target,
				declarationKind,
				state,
				propOwner && {
					...propOwner,
					propPath: [...propOwner.propPath, key],
				},
			);
			continue;
		}
		if (nested?.type === 'ArrayPattern') {
			collectArrayPatternAliases(
				nested,
				target,
				declarationKind,
				state,
				propOwner && {
					...propOwner,
					propPath: [...propOwner.propPath, key],
				},
			);
			continue;
		}

		const local = localAliasIdentifier(value);
		if (!local) continue;

		const span = sourceSpan(local, state.filename);
		if (!span) continue;
		const bindingId = sourceBindingId(span);
		const ownedProp = propOwner && {
			...propOwner,
			propPath: [...propOwner.propPath, key],
		};
		state.graph.aliases.push({
			name: local.name,
			target,
			...(ownedProp
				? {
						bindingId,
						componentId: ownedProp.componentId,
						componentName: ownedProp.componentName,
						propPath: ownedProp.propPath,
					}
				: {}),
			...sharedScope(state),
			declarationKind,
			sourceSpan: span,
		});
		if (ownedProp) recordComponentPropBinding(local.name, bindingId, span, ownedProp, state);
	}
}

export function collectArrayPatternAliases(
	pattern: AnyNode,
	targetBase: string,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
	propOwner?: PropAliasOwner,
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
			collectObjectPatternAliases(
				nested,
				target,
				declarationKind,
				state,
				propOwner && {
					...propOwner,
					propPath: [...propOwner.propPath, String(index)],
				},
			);
			return;
		}
		if (nested?.type === 'ArrayPattern') {
			collectArrayPatternAliases(
				nested,
				target,
				declarationKind,
				state,
				propOwner && {
					...propOwner,
					propPath: [...propOwner.propPath, String(index)],
				},
			);
			return;
		}

		const local = localAliasIdentifier(element);
		if (!local) return;

		const span = sourceSpan(local, state.filename);
		if (!span) return;
		const bindingId = sourceBindingId(span);
		const ownedProp = propOwner && {
			...propOwner,
			propPath: [...propOwner.propPath, String(index)],
		};
		state.graph.aliases.push({
			name: local.name,
			target,
			...(ownedProp
				? {
						bindingId,
						componentId: ownedProp.componentId,
						componentName: ownedProp.componentName,
						propPath: ownedProp.propPath,
					}
				: {}),
			...sharedScope(state),
			declarationKind,
			sourceSpan: span,
		});
		if (ownedProp) recordComponentPropBinding(local.name, bindingId, span, ownedProp, state);
	});
}

type PropAliasOwner = {
	readonly componentId: string;
	readonly componentName: string;
	readonly propPath: ReadonlyArray<string>;
};

function sourceBindingId(span: { readonly start: number; readonly end: number }): string {
	return `binding:${span.start}:${span.end}`;
}

// A component signature's destructuring default is the one place a part states
// what an omitted prop means, so the prop local records the default expression
// and every emitter that materializes the local applies it.
function recordDefaultedPropAlias(
	pattern: AnyNode,
	target: string,
	owner: PropAliasOwner,
	state: WalkState,
): boolean {
	const local = pattern.left as AnyNode | undefined;
	const fallback = pattern.right as AnyNode | undefined;
	if (local?.type !== 'Identifier' || typeof local.name !== 'string' || !fallback) return false;

	const span = sourceSpan(local, state.filename);
	if (!span) return false;

	const bindingId = sourceBindingId(span);
	const defaultSource = expressionSource(fallback, state.source);
	state.graph.aliases.push({
		name: local.name,
		target,
		bindingId,
		componentId: owner.componentId,
		componentName: owner.componentName,
		propPath: owner.propPath,
		defaultSource,
		...sharedScope(state),
		declarationKind: 'const',
		sourceSpan: span,
	});
	state.graph.componentPropBindings.push({
		componentId: owner.componentId,
		componentName: owner.componentName,
		bindingId,
		localName: local.name,
		propPath: owner.propPath,
		defaultSource,
		sourceSpan: span,
	});
	return true;
}

function recordComponentPropBinding(
	localName: string,
	bindingId: string,
	span: NonNullable<ReturnType<typeof sourceSpan>>,
	owner: PropAliasOwner,
	state: WalkState,
): void {
	state.graph.componentPropBindings.push({
		componentId: owner.componentId,
		componentName: owner.componentName,
		bindingId,
		localName,
		propPath: owner.propPath,
		sourceSpan: span,
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
