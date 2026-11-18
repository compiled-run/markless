import type { AnyNode } from '../../ast/nodes.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { expressionReadNames } from './collect-expressions.ts';
import { findSharedInstance, resolveSharedInstanceGraphPath } from './collect-shared.ts';
import { inlineRenderLocals } from './render-local-inline.ts';
import type { WalkState } from './types.ts';

/**
 * Whether a component prop the parent works out with plain code keeps the value it rendered with: it reads
 * module values, globals and body consts over them, and no graph value the browser can change. A page's own
 * props count as fixed, since the router renders a page anew rather than changing them.
 */
export function readsOnlyFixedValues(expression: AnyNode, state: WalkState): boolean {
	const inlined = inlineRenderLocals(expression, state);
	if (inlined.kind !== 'inlined') return false;
	const pageProps =
		state.routeRoot &&
		state.graph.components.find((component) => component.name === state.currentComponentName)
			?.exportName === 'default';
	return [expression, ...inlined.definitions].every((node) =>
		expressionReadNames(node, state).every(
			(name) => inlined.names.has(name) || readsFixedName(name, state, pageProps),
		),
	);
}

function readsFixedName(name: string, state: WalkState, pageProps: boolean): boolean {
	const graph = resolveGraphPath(
		name,
		graphBindingMap(
			state.graph,
			state.currentSharedDefinitionId,
			state.currentComponentName ?? undefined,
		),
		semanticAliasMap(
			state.graph,
			state.currentSharedDefinitionId,
			state.currentComponentName ?? undefined,
		),
	);
	if (graph) return pageProps && graph.binding.kind === 'prop';
	return (
		!resolveSharedInstanceGraphPath(name, state.graph, state.currentComponentName) &&
		!findSharedInstance(name, state.graph, state.currentComponentName)
	);
}
