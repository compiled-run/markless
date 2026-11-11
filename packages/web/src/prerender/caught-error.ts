import type { ProtocolStatePayload } from '@markless/serializer';
import { durableError } from '../../../serializer/src/durable-error.ts';

// The shown @catch error goes into its cell, which the arm commit writes before the arm's text updates subscribe.
export function showCaughtError(
	cells: ProtocolStatePayload['cells'],
	render: { readonly symbolPrefix: string; readonly freshCellIds?: Set<string> },
	boundary: { readonly errorGraphNodeId?: string },
	error: unknown,
): { readonly arm: 2; readonly error: unknown } {
	const graphNodeId = boundary.errorGraphNodeId!;
	const cell = cells.find((candidate) => candidate.graphNodeId === graphNodeId);
	if (cell) Object.assign(cell, { value: undefined, directValue: durableError(error) });
	render.freshCellIds?.add(render.symbolPrefix + graphNodeId);
	return { arm: 2, error };
}
