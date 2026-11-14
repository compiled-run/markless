import type { SemanticGraphBinding } from '../../artifacts.ts';
import { graphBindingMap, resolveGraphPath, semanticAliasMap } from '../../artifact-helpers/graph-paths.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { collectCompositeTemplateExpression, type GraphReadScope } from './composite-reads.ts';
import { inlineRenderLocals } from './render-local-inline.ts';
import type { WalkState } from './types.ts';

// Text joining a `@catch (error)` binding with graph reads reads the error from a cell each shown @catch arm writes.
export function catchErrorScope(
	errors: ReadonlyMap<string, string>,
	scope: GraphReadScope,
	state: WalkState,
): { readonly scope: GraphReadScope; readonly keep: () => void } | null {
	const bindings = new Map(scope.bindings);
	const cells: Array<{ readonly boundaryId: string; readonly cell: SemanticGraphBinding }> = [];
	for (const [name, boundaryId] of errors) {
		const cell = catchErrorCell(boundaryId, state);
		if (!cell) return null;
		bindings.set(name, cell);
		cells.push({ boundaryId, cell });
	}
	return {
		scope: { bindings, aliases: scope.aliases },
		keep: () => {
			for (const { boundaryId, cell } of cells) keepCatchErrorCell(boundaryId, cell, state);
		},
	};
}

function catchErrorCell(boundaryId: string, state: WalkState): SemanticGraphBinding | null {
	const boundary = state.graph.asyncBoundaries.find((candidate) => candidate.id === boundaryId);
	if (!boundary) return null;
	const kept = state.graph.graphBindings.find((binding) => binding.id === boundary.errorGraphNodeId);
	if (kept) return kept;
	const name = `marklessCatchError${boundaryId.slice(boundaryId.lastIndexOf(':') + 1)}`;
	return {
		id: `state:${name}`,
		name,
		kind: 'state',
		writable: false,
		valueKind: 'object',
		initialValue: null,
		initialValueKnown: true,
		...(state.currentComponentId ? { componentId: state.currentComponentId } : {}),
		...(boundary.componentName ? { componentName: boundary.componentName } : {}),
	};
}

function keepCatchErrorCell(boundaryId: string, cell: SemanticGraphBinding, state: WalkState): void {
	const boundary = state.graph.asyncBoundaries.find((candidate) => candidate.id === boundaryId);
	if (!boundary || boundary.errorGraphNodeId) return;
	boundary.errorGraphNodeId = cell.id;
	state.graph.graphBindings.push(cell);
}

// A component prop worked out from a `@catch (error)` binding reads the error from the same cell, so the child follows each failure.
export function catchErrorPropRead(
	expression: AnyNode,
	state: WalkState,
): {
	readonly graphNodeId: string;
	readonly graphBindingKind: SemanticGraphBinding['kind'];
	readonly path: ReadonlyArray<string>;
} | null {
	const inlined = inlineRenderLocals(expression, state, { catchErrors: true });
	if (inlined.kind !== 'inlined' || inlined.catchErrors.size === 0 || inlined.definitions.length > 0)
		return null;
	const component = state.currentComponentName;
	const caught = catchErrorScope(
		inlined.catchErrors,
		{
			bindings: graphBindingMap(state.graph, state.currentSharedDefinitionId, component),
			aliases: semanticAliasMap(state.graph, state.currentSharedDefinitionId, component),
		},
		state,
	);
	if (!caught) return null;
	const source = expressionSource(expression, state.source);
	const direct = source ? resolveGraphPath(source, caught.scope.bindings, caught.scope.aliases) : null;
	if (direct) {
		caught.keep();
		return { graphNodeId: direct.binding.id, graphBindingKind: direct.binding.kind, path: direct.path };
	}
	const composite = collectCompositeTemplateExpression(expression, state, {
		scope: caught.scope,
		methodCalls: true,
		unaryOperators: true,
	});
	if (!composite) return null;
	caught.keep();
	return { graphNodeId: composite.graphNodeId, graphBindingKind: 'computed', path: [] };
}
