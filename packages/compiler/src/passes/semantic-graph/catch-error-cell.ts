import { DURABLE_ERROR_FIELDS } from '@markless/serializer';
import type { SemanticGraphBinding, SemanticGraphDependency } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { catchErrorFieldLostDiagnostic } from './diagnostics.ts';
import type { GraphReadScope } from './composite-reads.ts';
import { inlineRenderLocals } from './render-local-inline.ts';
import type { WalkState } from './types.ts';

// Text joining a `@catch (error)` binding with graph reads reads the error from a cell each shown @catch arm writes.
export function catchErrorScope(
	errors: ReadonlyMap<string, string>,
	scope: GraphReadScope,
	state: WalkState,
): CaughtErrorScope | null {
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
		keep: (expression, reads, child) => {
			for (const { boundaryId, cell } of cells) keepCatchErrorCell(boundaryId, cell, state);
			const lost = reads.find(
				(read) =>
					cells.some(({ cell }) => cell.id === read.graphNodeId) &&
					(read.path.length > 0 ? !DURABLE_ERROR_FIELDS.has(read.path[0]!) : child !== undefined),
			);
			if (!lost) return true;
			state.graph.diagnostics.push(
				catchErrorFieldLostDiagnostic({
					source: expressionSource(expression, state.source) ?? '',
					...(lost.path[0] === undefined ? { child: child! } : { field: lost.path[0] }),
					node: expression,
					filename: state.filename,
				}),
			);
			return false;
		},
	};
}

type CaughtErrorScope = {
	readonly scope: GraphReadScope;
	// Keeps the error cells, and refuses a read of a field the server render does not send; false when refused.
	readonly keep: (
		expression: AnyNode,
		reads: ReadonlyArray<{ readonly graphNodeId: string; readonly path: ReadonlyArray<string> }>,
		// A component the expression is passed to as a prop: it may read any field, so the whole error is refused.
		child?: string,
	) => boolean;
};

export function computedReads(graphNodeId: string, state: WalkState): ReadonlyArray<SemanticGraphDependency> {
	return state.graph.graphBindings.find((binding) => binding.id === graphNodeId)?.dependencies ?? [];
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

// A component prop worked out from a `@catch (error)` binding resolves in a scope where the error reads the boundary's error cell.
export function catchErrorPropScope(
	expression: AnyNode,
	scope: GraphReadScope,
	state: WalkState,
): CaughtErrorScope | null {
	const inlined = inlineRenderLocals(expression, state, { catchErrors: true });
	if (inlined.kind !== 'inlined' || inlined.catchErrors.size === 0 || inlined.definitions.length > 0)
		return null;
	return catchErrorScope(inlined.catchErrors, scope, state);
}
